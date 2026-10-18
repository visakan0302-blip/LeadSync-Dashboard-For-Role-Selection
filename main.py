"""
LeadSync Production ASGI Entry Point for Render / Cloud Hosting.
Exposes the FastAPI 'app' instance at module level (main:app)
and allows direct execution (python main.py).
"""
import os
import sys

# Ensure project root is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.app import app

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8888))
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    uvicorn.run("main:app", host=host, port=port, reload=False)
