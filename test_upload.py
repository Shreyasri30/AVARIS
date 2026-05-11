import requests

# Create a dummy image
with open("dummy.jpg", "wb") as f:
    f.write(b"dummy image data")

with open("dummy.jpg", "rb") as f:
    response = requests.post("http://127.0.0.1:8000/api/upload-prescription", files={"image": f})

print(f"Status: {response.status_code}")
print(f"Response: {response.text}")
