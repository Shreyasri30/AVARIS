
import requests
import os
from PIL import Image

def test_api_upload():
    url = "http://127.0.0.1:8000/api/upload-prescription"
    dummy_image = "test_api_prescription.jpg"
    
    # Create a dummy image
    img = Image.new('RGB', (200, 200), color = 'white')
    img.save(dummy_image)
    
    try:
        print(f"Sending POST request to {url}...")
        with open(dummy_image, 'rb') as f:
            files = {'image': (dummy_image, f, 'image/jpeg')}
            response = requests.post(url, files=files)
            
        print(f"Status Code: {response.status_code}")
        print("Response:", response.text)
        
    except Exception as e:
        print("Error during API request:", e)
    finally:
        if os.path.exists(dummy_image):
            os.remove(dummy_image)

if __name__ == "__main__":
    # Wait a bit for server to fully initialize if just started
    import time
    time.sleep(2)
    test_api_upload()
