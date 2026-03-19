"""
Gemini Vision API Module
Stage 1: Analyzes food images and extracts ingredients
"""

import google.generativeai as genai
import os
import json
import logging
from typing import Dict, List, Any, Optional
from dotenv import load_dotenv
from PIL import Image

logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

class GeminiVisionAnalyzer:
    """Gemini Vision API for food image analysis"""
    
    def __init__(self):
        self.model = None
        self._configure_gemini()
    
    def _configure_gemini(self):
        """Configure Gemini Vision API"""
        # Try hardcoded key first (for development)
        hardcoded_key = "AIzaSyC_LQpcT5r7F7dYqWkiKuhesSpYKwQhAuw"
        
        api_key = None
        if hardcoded_key and hardcoded_key not in ["", "YOUR_API_KEY_HERE"]:
            api_key = hardcoded_key
            logger.info("Using hardcoded Gemini API key for vision")
        else:
            api_key = os.getenv("GEMINI_API_KEY")
            if api_key and api_key != "YOUR_API_KEY_HERE":
                logger.info("Using Gemini API key from environment for vision")
        
        if api_key:
            try:
                genai.configure(api_key=api_key)
                self.model = genai.GenerativeModel('gemini-2.5-flash')
                logger.info("Gemini vision analyzer configured successfully")
            except Exception as e:
                logger.error(f"Failed to configure Gemini Vision: {e}")
                self.model = None
        else:
            logger.warning("Gemini API key not found for vision analysis")
            self.model = None
    
    def analyze_food_image(self, image_path: str) -> dict:
        """
        Analyze food image using Gemini Vision API
        
        Args:
            image_path (str): Path to the food image
            
        Returns:
            dict: {
                "food_item": str,
                "ingredients": list,
                "confidence": float
            }
        """
        model = self.model
        if model is None:
            logger.error("Gemini Vision not configured")
            raise RuntimeError("Gemini Vision API not configured. Please set GEMINI_API_KEY.")
        
        try:
            # Load image
            img = Image.open(image_path)
            
            # Create detailed prompt for food analysis
            prompt = """
            Analyze this food image carefully and provide detailed information.

            Your task:
            1. Identify the exact food item or product in the image.
            2. List ONLY the actual ingredients that make up the food shown. If it is a raw, single-ingredient food (like a raw vegetable, fruit, or plain meat), the ONLY ingredient should be the item itself. 
            3. Do NOT list items that are "commonly paired with" or "cooked with" this item unless you visually confirm their presence (e.g., do not list cheese or meat for plain bell peppers).
            4. Provide a confidence score (0.0 to 1.0) for your identification.

            IMPORTANT: 
            - If it's a prepared dish or packaged food, list its expected base ingredients (flour, dairy, common allergens).
            - Do NOT hallucinate ingredients that are not part of the core food shown.

            Return your response in this EXACT JSON format:
            {
                "food_item": "name of the food",
                "ingredients": ["ingredient1", "ingredient2"],
                "confidence": 0.95
            }
            """
            
            # Generate content with image
            response = model.generate_content([prompt, img])
            
            # Parse response
            text_response = response.text.strip()
            
            # Clean up markdown formatting if present
            if "```json" in text_response:
                text_response = text_response.split("```json")[1].split("```")[0].strip()
            elif "```" in text_response:
                text_response = text_response.split("```")[1].split("```")[0].strip()
            
            # Parse JSON
            result = json.loads(text_response)
            
            logger.info(f"Gemini Vision Analysis: {result['food_item']} with {len(result.get('ingredients', []))} ingredients")
            
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini Vision response as JSON: {e}")
            logger.error(f"Response text: {text_response}")
            raise RuntimeError(f"Failed to parse vision analysis response: {e}")
            
        except Exception as e:
            logger.error(f"Error analyzing food image with Gemini Vision: {e}")
    def analyze_prescription(self, image_path: str) -> list:
        """
        Analyze medical prescription or allergy test image using Gemini Vision API
        
        Args:
            image_path (str): Path to the medical document image
            
        Returns:
            list: Array of strings representing extracted allergens
        """
        model = self.model
        if model is None:
            logger.error("Gemini Vision not configured")
            raise RuntimeError("Gemini Vision API not configured. Please set GEMINI_API_KEY.")
            
        try:
            # Load image
            img = Image.open(image_path)
            
            # Create detailed prompt for medical document analysis
            prompt = """
            You are a medical document reading AI. Carefully analyze this image of a medical prescription, doctor's note, or allergy test report.
            
            Find any explicit mention of allergies or hypersensitivities belonging to this patient.
            Extract the exact allergens (e.g., "Penicillin", "Peanuts", "Dust mites", "Lactose").
            
            Return your response in this EXACT JSON format:
            {
                "extracted_allergens": ["Allergen 1", "Allergen 2"]
            }
            
            If NO allergies are found in the document, return:
            {
                "extracted_allergens": []
            }
            """
            
            response = model.generate_content([prompt, img])
            text_response = response.text.strip()
            
            # Clean up markdown formatting if present
            if "```json" in text_response:
                text_response = text_response.split("```json")[1].split("```")[0].strip()
            elif "```" in text_response:
                text_response = text_response.split("```")[1].split("```")[0].strip()
                
            result = json.loads(text_response)
            extracted = result.get("extracted_allergens", [])
            
            if not isinstance(extracted, list):
                 logger.warning(f"Extracted allergens is not a list: {extracted}")
                 extracted = []
                 
            # Enforce string type to prevent frontend crashes (e.g., .toLowerCase() on non-strings)
            cleaned_extracted = []
            for item in extracted:
                if isinstance(item, str):
                    cleaned_extracted.append(item)
                elif isinstance(item, dict):
                    # Fallback for structured AI responses
                    val = item.get("allergen") or item.get("name") or str(item)
                    cleaned_extracted.append(str(val))
                else:
                    cleaned_extracted.append(str(item))
            
            logger.info(f"Gemini Vision Medical Analysis: extracted {len(cleaned_extracted)} allergens")
            return cleaned_extracted
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse medical analysis response as JSON: {e}")
            raise RuntimeError(f"Failed to parse medical analysis: {e}")
            
        except Exception as e:
            logger.error(f"Error analyzing medical document with Gemini Vision: {e}")
            raise

    def is_available(self) -> bool:
        """Check if Gemini Vision is available"""
        return self.model is not None

# Global vision analyzer instance
_vision_analyzer = None

def get_vision_analyzer() -> GeminiVisionAnalyzer:
    """Get the global vision analyzer instance"""
    global _vision_analyzer
    if _vision_analyzer is None:
        _vision_analyzer = GeminiVisionAnalyzer()
    return _vision_analyzer

def analyze_food_image(image_path: str) -> dict:
    """
    Convenience function to analyze food image
    """
    analyzer = get_vision_analyzer()
    return analyzer.analyze_food_image(image_path)

def analyze_prescription_image(image_path: str) -> list:
    """
    Convenience function to analyze prescription image
    """
    analyzer = get_vision_analyzer()
    return analyzer.analyze_prescription(image_path)