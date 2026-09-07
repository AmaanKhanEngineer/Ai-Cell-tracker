import urllib.request
import urllib.error
import json
import sys
import uuid

def test_api_upload_urllib():
    print("--- Verifying Upload API Endpoint via Standard Library (Port 8000) ---")
    url = "http://127.0.0.1:8000/api/experiments/upload"
    file_path = "/Users/amaankhan/Downloads/sample_cells.tiff"
    
    try:
        # Read file bytes
        with open(file_path, "rb") as f:
            file_content = f.read()
            
        boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"
        
        # Construct multipart/form-data body
        body = []
        
        # Add file
        body.append(f"--{boundary}".encode('utf-8'))
        body.append(b'Content-Disposition: form-data; name="file"; filename="sample_cells.tiff"')
        body.append(b'Content-Type: image/tiff')
        body.append(b'')
        body.append(file_content)
        
        # Add name field
        body.append(f"--{boundary}".encode('utf-8'))
        body.append(b'Content-Disposition: form-data; name="name"')
        body.append(b'')
        body.append(b'Urllib Validation Run')
        
        body.append(f"--{boundary}--".encode('utf-8'))
        body.append(b'')
        
        payload = b'\r\n'.join(body)
        
        req = urllib.request.Request(url, data=payload)
        req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
        req.add_header('Content-Length', str(len(payload)))
        
        print("Sending POST request to upload dataset...")
        with urllib.request.urlopen(req) as response:
            status = response.status
            response_data = response.read().decode('utf-8')
            
            print(f"Response Status Code: {status}")
            if status == 200:
                meta = json.loads(response_data)
                print("Upload Successful!")
                print(f"Experiment Metadata: {meta}")
                print("--- API Verification SUCCESS! ---")
            else:
                print(f"Upload Failed. Error: {response_data}")
                sys.exit(1)
                
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.read().decode('utf-8')}")
        sys.exit(1)
    except Exception as e:
        print(f"Error connecting to server: {e}")
        print("Make sure your FastAPI server is running on port 8000!")
        sys.exit(1)

if __name__ == "__main__":
    test_api_upload_urllib()
