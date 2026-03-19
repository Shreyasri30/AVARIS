
import os
import sys
from PIL import Image, ImageDraw, ImageFont

# Add the root directory to python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.ai_engine.gemini_vision import GeminiVisionAnalyzer

def test_prescription_with_text():
    analyzer = GeminiVisionAnalyzer()
    
    # Create image with text
    dummy_image = "test_prescription_text.jpg"
    img = Image.new('RGB', (600, 400), color = 'white')
    d = ImageDraw.Draw(img)
    
    # Draw text (use default font)
    d.text((50, 50), "MEDICAL REPORT", fill="black")
    d.text((50, 100), "Patient Name: Sample", fill="black")
    d.text((50, 150), "DIAGNOSIS: CONFIRMED ALLERGY", fill="black")
    d.text((50, 200), "- PEANUTS", fill="red")
    d.text((50, 230), "- DAIRY", fill="red")
    d.text((50, 280), "Doctor: Dr. Smith", fill="black")
    
    img.save(dummy_image)
    print(f"Created image {dummy_image} with text content.")

    try:
        print("Analyzing prescription image with text...")
        result = analyzer.analyze_prescription(dummy_image)
        print("Result:", result)
    except Exception as e:
        print("Error during analysis:", e)
    finally:
         if os.path.exists(dummy_image) and False: # Keep for easy inspection if needed, or remove
             os.remove(dummy_image)

if __name__ == "__main__":
    test_prescription_with_text()
