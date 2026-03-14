import time
import requests
import logging
import os
import pandas as pd
import numpy as np
import joblib
from datetime import datetime
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database.models import get_db, SensorData, RiskPrediction, AnomalyEvent, FoodAnalysisLog
from backend.ai_engine.reasoning import explain_anomaly, explain_risk, explain_food_risk
from backend.vision.ingredient_detector import detect_ingredients
from ml.allergen_checker import check_ingredients_for_allergens

import json
logger = logging.getLogger(__name__)

router = APIRouter()
        
# In-memory state for active analysis mode
ACTIVE_MODE = "FOOD" # Default mode

@router.post("/set-mode")
async def set_active_mode(mode: dict):
    global ACTIVE_MODE
    new_mode = mode.get("mode")
    if new_mode in ["FOOD", "ENVIRONMENT"]:
        ACTIVE_MODE = new_mode
        logger.info(f"Active AI mode set to: {ACTIVE_MODE}")
        return {"status": "success", "mode": ACTIVE_MODE}
    raise HTTPException(status_code=400, detail="Invalid mode. Choose 'FOOD' or 'ENVIRONMENT'.")

@router.get("/active-mode")
async def get_active_mode():
    return {"mode": ACTIVE_MODE}

# Load Models
RISK_MODEL_PATH = "backend/ml_models/risk_model.pkl"
ANOMALY_MODEL_PATH = "backend/ml_models/anomaly_model.pkl"
FORECAST_MODEL_PATH = "backend/ml_models/forecast_model.pkl"

def load_model(path):
    if os.path.exists(path):
        return joblib.load(path)
    return None

risk_model = load_model(RISK_MODEL_PATH)
anomaly_model = load_model(ANOMALY_MODEL_PATH)
forecast_model = load_model(FORECAST_MODEL_PATH)

class SensorPayload(BaseModel):
    temperature: float
    humidity: float
    dust: float
    timestamp: Optional[str] = None

@router.post("/sensor-data")
def receive_sensor_data(payload: SensorPayload, db: Session = Depends(get_db)):
    """Receive data from ESP32, predict risk/anomaly, and store."""
    
    try:
        # Storage
        db_sensor = SensorData(
            temperature=payload.temperature,
            humidity=payload.humidity,
            dust=payload.dust
        )
        ts = payload.timestamp
        if ts is not None:
            try:
                db_sensor.timestamp = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                pass # fallback to default now()
        
        db.add(db_sensor)
        db.commit()
        db.refresh(db_sensor)

        # ML Inference preparation
        features = pd.DataFrame([{
            "temperature": payload.temperature,
            "humidity": payload.humidity,
            "dust": payload.dust
        }])

        # 1. Anomaly Detection
        is_anomaly = False
        if anomaly_model:
            pred_anomaly = anomaly_model.predict(features)[0]
            # Isolation Forest: -1 is anomaly, 1 is normal
            is_anomaly = bool(pred_anomaly == -1)
            
            if is_anomaly:
                # Generate AI Explanation (Only if in ENVIRONMENT mode)
                if ACTIVE_MODE == "ENVIRONMENT":
                    explanation = explain_anomaly(payload.temperature, payload.humidity, payload.dust)
                else:
                    # Use fallback manually or just log
                    explanation = "[Auto-Analysis] Anomaly detected. (Detailed AI reasoning disabled in current mode)"
                
                db_anomaly = AnomalyEvent(
                    status="anomaly",
                    description=f"Automated Alert: Anomaly Detected.\n{explanation}",
                    recommended_action="Inspect area immediately."
                )
                db.add(db_anomaly)
                db.commit()

        # 2. Risk Prediction
        current_risk = "UNKNOWN"
        if risk_model:
            pred_risk = risk_model.predict(features)[0]
            current_risk = str(pred_risk) # Ensure it's a standard string
            
            # Save Risk Prediction
            db_risk = RiskPrediction(
                risk_level=current_risk,
                confidence=0.95 # Mock confidence
            )
            db.add(db_risk)
            db.commit()
            
            # Explain Critical/High Risk (Only if in ENVIRONMENT mode)
            if current_risk in ["HIGH", "CRITICAL"]:
                if ACTIVE_MODE == "ENVIRONMENT":
                    risk_explanation = explain_risk(current_risk, payload.temperature, payload.humidity, payload.dust)
                else:
                    risk_explanation = f"[Auto-Analysis] {current_risk} risk detected. (Detailed AI reasoning disabled in current mode)"
                
                db_anomaly_risk = AnomalyEvent(
                    status=current_risk,
                    description=f"Risk Alert: {current_risk}.\n{risk_explanation}",
                    recommended_action="Follow safety protocols."
                )
                db.add(db_anomaly_risk)
                db.commit()

        return {"status": "success", "risk_level": current_risk, "anomaly_detected": is_anomaly}
    except Exception as e:
        import traceback
        print(f"Error in receive_sensor_data: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/latest-sensor-data")
def get_latest_sensor_data(db: Session = Depends(get_db)):
    """Fetch the most recent sensor reading."""
    data = db.query(SensorData).order_by(SensorData.timestamp.desc()).first()
    if not data:
        raise HTTPException(status_code=404, detail="No sensor data found")
    return {
        "temperature": data.temperature,
        "humidity": data.humidity,
        "dust": data.dust,
        "timestamp": data.timestamp.isoformat() + "Z"
    }

@router.get("/risk-prediction")
def get_latest_risk(db: Session = Depends(get_db)):
    """Fetch the most recent risk prediction."""
    data = db.query(RiskPrediction).order_by(RiskPrediction.timestamp.desc()).first()
    if not data:
        return {"risk_level": "LOW", "confidence": 1.0, "timestamp": datetime.utcnow().isoformat()}
    return {
        "risk_level": data.risk_level,
        "confidence": data.confidence,
        "timestamp": data.timestamp.isoformat() + "Z"
    }

@router.get("/anomaly-events")
def get_anomaly_events(db: Session = Depends(get_db), limit: int = 10):
    """Fetch recent anomaly events and AI explanations."""
    events = db.query(AnomalyEvent).order_by(AnomalyEvent.timestamp.desc()).limit(limit).all()
    return [{"status": e.status, "description": e.description, "action": e.recommended_action, "timestamp": e.timestamp.isoformat() + "Z"} for e in events]

@router.get("/forecast")
def get_forecast(db: Session = Depends(get_db)):
    """Predict conditions 30 mins from now."""
    if not forecast_model:
        return {"error": "Forecast model not available"}
        
    latest = db.query(SensorData).order_by(SensorData.timestamp.desc()).first()
    if not latest:
        return {"error": "No data available for forecasting"}

    features = pd.DataFrame([{
        "temperature": latest.temperature,
        "humidity": latest.humidity,
        "dust": latest.dust
    }])
    
    prediction = forecast_model.predict(features)[0]
    
    return {
        "predicted_temperature": float(prediction[0]),
        "predicted_humidity": float(prediction[1]),
        "predicted_dust": float(prediction[2]),
        "forecast_time_mins": 30
    }

def process_food_analysis(db: Session, file_path: str, filename: str):
    """Helper to run ingredient analysis, allergen check, and logging."""
    try:
        # 2. Analyze Image (Only if in FOOD mode)
        try:
            detected_allergens = []
            risk_level = "UNKNOWN"
            ai_explanation = ""
            
            if ACTIVE_MODE == "FOOD":
                analysis = detect_ingredients(file_path)
                if "error" in analysis:
                    raise RuntimeError(analysis["error"])
                    
                food_item = analysis.get("food_item", "Unknown")
                ingredients = analysis.get("ingredients", [])
                confidence = analysis.get("confidence", 0.0)
                
                logger.info(f"Analysis complete - Food: {food_item}, Ingredients: {ingredients}")
                
                # 3. Check for Allergens
                detected_allergens, risk_level = check_ingredients_for_allergens(ingredients)
                
                # 4. Generate AI Explanation
                ai_explanation = explain_food_risk(food_item, ingredients, detected_allergens, risk_level)
            else:
                # Mode is ENVIRONMENT, so skip AI analysis
                food_item = "Image Analysis Skipped"
                ingredients = []
                confidence = 0.0
                ai_explanation = (
                    "[Mode Alert] Dashboard is currently in 'Environmental' mode. "
                    "AI Vision analysis is paused to preserve quota. "
                    "Switch to 'Food Analysis' in the header to analyze this image."
                )
                
        except Exception as e:
            logger.warning(f"Vision analysis failed: {e}")
            food_item = "Image Analysis Error"
            ingredients = []
            confidence = 0.0
            
            # Check if it's a known Quota error
            error_msg = str(e)
            if "quota" in error_msg.lower() or "429" in error_msg:
                ai_explanation = (
                    "[Rule-Based Analysis] AI Quota reached. "
                    "We cannot analyze images right now. "
                    "Recommendation: Please consult the product label manually."
                )
            else:
                ai_explanation = f"[System Error] {error_msg}. Please check your connection or API key."
        
        # 5. Log to Database
        db_log = FoodAnalysisLog(
            image_path=file_path,
            food_item=food_item,
            ingredients=json.dumps(ingredients),
            detected_allergens=json.dumps(detected_allergens),
            risk_level=risk_level,
            ai_explanation=ai_explanation
        )
        db.add(db_log)
        db.commit()
        db.refresh(db_log)
        
        logger.info(f"Analysis logged to database with ID: {db_log.id}")
        
        return {
            "food_item": food_item,
            "ingredients": ingredients,
            "detected_allergens": detected_allergens,
            "risk_level": risk_level,
            "confidence": confidence,
            "ai_explanation": ai_explanation,
            "image_url": f"/uploads/food_images/{filename}"
        }
    except Exception as e:
        logger.error(f"Error in process_food_analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/capture-and-analyze")
async def capture_and_analyze(data: dict, db: Session = Depends(get_db)):
    """Fetch image from ESP32-CAM, save it, and analyze."""
    try:
        cam_ip = data.get("cam_ip")
        if not cam_ip:
            raise HTTPException(status_code=400, detail="Camera IP is required")
            
        # 1. Network Diagnostic (Ping Check)
        ping_url = f"http://{cam_ip}/ping"
        
        # HARD STREAM-CUT PROTOCOL: 
        # Connection: close header is CRITICAL here. It ensures the backend doesn't 
        # hold onto any sockets after the image is fetched, leaving the camera 
        # clean for the next action.
        no_proxy_session = requests.Session()
        no_proxy_session.trust_env = False
        headers = {"Connection": "close", "Cache-Control": "no-cache"}
        
        try:
            # tuple for timeout: (connect_timeout, read_timeout)
            # Increased connect timeout to handle camera startup lag
            ping_res = no_proxy_session.get(ping_url, timeout=(15, 5), headers=headers)
            if ping_res.status_code == 200:
                logger.info("Camera network check: SUCCESS (PONG received)")
            else:
                logger.warning(f"Camera network check: WEAK (Status {ping_res.status_code})")
        except Exception as e:
            logger.error(f"Camera network check: FAILED (Unreachable). Error: {e}")
            raise HTTPException(status_code=504, detail=f"Could not reach ESP32-CAM at {cam_ip}. Is it powered on and connected to Wi-Fi? (Diagnostic: {type(e).__name__})")

        # 2. Fetch from Camera (with Retry Logic)
        cam_url = f"http://{cam_ip}/capture"
        logger.info(f"Triggering Single-Socket Force Capture from {cam_url}")
        
        max_retries = 3 # Increased retries
        response = None
        for attempt in range(max_retries):
            try:
                # connect_timeout=15s, read_timeout=20s
                response = no_proxy_session.get(cam_url, timeout=(15, 20), headers=headers)
                if response.status_code == 200:
                    break
                logger.warning(f"Capture attempt {attempt+1} failed with status {response.status_code}")
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
                logger.warning(f"Capture attempt {attempt+1} failed: {type(e).__name__}. Waiting for hardware reset...")
                time.sleep(3) # Increased cooldown for hardware reset
            
        if not response or response.status_code != 200:
            status = response.status_code if response else "TIMEOUT"
            raise HTTPException(status_code=502, detail=f"Failed to capture from camera hardware after {max_retries} attempts (Status: {status}). Please ensure no other device is viewing the stream.")
            
        # 2. Save Image
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"cam_{timestamp}.jpg"
        upload_dir = "uploads/food_images"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, filename)
        
        with open(file_path, "wb") as f:
            f.write(response.content)
            
        # 3. Process
        return process_food_analysis(db, file_path, filename)
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Camera connection error: {e}")
        raise HTTPException(status_code=504, detail=f"Could not connect to ESP32-CAM at {cam_ip}. Please check the IP and Wi-Fi.")

@router.post("/upload-food-image")
async def upload_food_image(image: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload food image, analyze for allergens using local Vision Transformer, and store result."""
    try:
        # 1. Save Image
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"food_{timestamp}.jpg"
        upload_dir = "uploads/food_images"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, filename)
        
        with open(file_path, "wb") as buffer:
            buffer.write(await image.read())
            
        logger.info(f"Saved uploaded image to {file_path}")
            
        # 2. Analyze Image (Only if in FOOD mode)
        try:
            if ACTIVE_MODE == "FOOD":
                analysis = detect_ingredients(file_path)
                if "error" in analysis:
                    raise RuntimeError(analysis["error"])
                    
                food_item = analysis.get("food_item", "Unknown")
                ingredients = analysis.get("ingredients", [])
                confidence = analysis.get("confidence", 0.0)
                
                logger.info(f"Analysis complete - Food: {food_item}, Ingredients: {ingredients}")
                
                # 3. Check for Allergens
                detected_allergens, risk_level = check_ingredients_for_allergens(ingredients)
                
                # 4. Generate AI Explanation
                ai_explanation = explain_food_risk(food_item, ingredients, detected_allergens, risk_level)
            else:
                # Mode is ENVIRONMENT, so skip AI analysis
                food_item = "Image Analysis Skipped"
                ingredients = []
                confidence = 0.0
                detected_allergens = []
                risk_level = "UNKNOWN"
                ai_explanation = (
                    "[Mode Alert] Dashboard is currently in 'Environmental' mode. "
                    "AI Vision analysis is paused to preserve quota. "
                    "Switch to 'Food Analysis' in the header to analyze this image."
                )
            
        except Exception as e:
            logger.warning(f"Vision analysis failed: {e}")
            food_item = "Image Analysis Error"
            ingredients = []
            confidence = 0.0
            detected_allergens = []
            risk_level = "UNKNOWN"
            
            # Check if it's a known Quota error
            error_msg = str(e)
            if "quota" in error_msg.lower() or "429" in error_msg:
                ai_explanation = (
                    "[Rule-Based Analysis] AI Quota reached. "
                    "We cannot analyze images right now. "
                    "Recommendation: Please consult the product label manually."
                )
            else:
                ai_explanation = f"[System Error] {error_msg}. Please check your connection or API key."
        
        # 5. Log to Database
        db_log = FoodAnalysisLog(
            image_path=file_path,
            food_item=food_item,
            ingredients=json.dumps(ingredients),
            detected_allergens=json.dumps(detected_allergens),
            risk_level=risk_level,
            ai_explanation=ai_explanation
        )
        db.add(db_log)
        db.commit()
        db.refresh(db_log)
        
        logger.info(f"Analysis logged to database with ID: {db_log.id}")
        
        return {
            "food_item": food_item,
            "ingredients": ingredients,
            "detected_allergens": detected_allergens,
            "risk_level": risk_level,
            "confidence": confidence,
            "ai_explanation": ai_explanation,
            "image_url": f"/uploads/food_images/{filename}"
        }
    except Exception as e:
        logger.error(f"Error in upload_food_image: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/latest-food-analysis")
def get_latest_food_analysis(db: Session = Depends(get_db)):
    """Fetch the most recent food analysis log."""
    log = db.query(FoodAnalysisLog).order_by(FoodAnalysisLog.timestamp.desc()).first()
    if not log:
        return None
    return {
        "id": log.id,
        "timestamp": log.timestamp.isoformat() + "Z",
        "image_path": log.image_path,
        "food_item": log.food_item,
        "ingredients": json.loads(log.ingredients),
        "detected_allergens": json.loads(log.detected_allergens),
        "risk_level": log.risk_level,
        "ai_explanation": log.ai_explanation
    }
