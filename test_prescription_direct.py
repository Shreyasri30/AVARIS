
import os
import sys

# Add the root directory to python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.ai_engine.gemini_vision import GeminiVisionAnalyzer
from PIL import Image

def test_prescription():
    analyzer = GeminiVisionAnalyzer()
    
    # Create a dummy image for testing if none exists
    dummy_image = "test_prescription.jpg"
    if not os.path.exists(dummy_image):
        img = Image.new('RGB', (200, 200), color = 'white')
        img.save(dummy_image)
        print(f"Created dummy image {dummy_image}")

    try:
        print("Analyzing prescription...")
        result = analyzer.analyze_prescription(dummy_image)
        print("Result:", result)
    except Exception as e:
        print("Error during analysis:", e)
    finally:
        if os.path.exists(dummy_image):
             os.remove(dummy_image)

if __name__ == "__main__":
    test_prescription()
