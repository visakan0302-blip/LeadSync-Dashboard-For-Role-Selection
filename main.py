"""
LeadSync Production ASGI Entry Point for Render / Cloud Hosting.
Exposes the FastAPI 'app' instance at module level (main:app)
and allows direct execution (python main.py).
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Ensure project root is in sys.path and root .env is loaded
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

ENV_PATH = BASE_DIR / ".env"
if ENV_PATH.is_file():
    load_dotenv(dotenv_path=ENV_PATH, override=True)

from backend.app import app

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8888))
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    uvicorn.run("main:app", host=host, port=port, reload=False)
