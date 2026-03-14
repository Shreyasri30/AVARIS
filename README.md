# AVARIS: AI Environmental Risk & Food Scanner

AVARIS is an advanced, dual-mode IoT platform combining Environmental Monitoring with AI-powered Food Allergen Scanning. Powered by dual ESP32 microcontrollers, it provides real-time data analysis and high-stability hardware integration.

## Project Structure
- **/backend**: FastAPI server, AI routing, database models, and ML pipelines.
- **/frontend**: React dashboard with dual-mode views (Environment / Food).
- **/iot**: Firmware for ESP32 devices.
  - `esp32_firmware/`: Main environmental sensor controller.
  - `esp32_cam/`: ESP32-CAM firmware with Dual-Port stability architecture.
- **/ml & /ml_training**: Local models for anomaly detection and environmental forecasting.
- **/scripts**: Utility scripts for data generation and retraining.

## Running the Project
1. **Backend**: `cd backend && python ../main.py`
2. **Frontend**: `cd frontend && npm run dev`
