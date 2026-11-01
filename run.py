"""
LeadSync Dashboard Server Launcher
Runs using Python 3.14 with Uvicorn.
"""
import sys
import os
import socket
from pathlib import Path
from dotenv import load_dotenv

# Ensure the root directory is in sys.path and root .env is loaded
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

ENV_PATH = BASE_DIR / ".env"
if ENV_PATH.is_file():
    load_dotenv(dotenv_path=ENV_PATH, override=True)

import uvicorn

def find_available_port(start_port=8888):
    for port in [8888, 8090, 8500, 5000, 9000]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    return start_port

if __name__ == "__main__":
    env_port = os.environ.get("PORT")
    if env_port:
        port = int(env_port)
        host = "0.0.0.0"
    else:
        port = find_available_port(8888)
        host = "127.0.0.1"

    print("=" * 60)
    print(" LeadSync Role Succession & Assessment Platform")
    print(f" Python Executable: {sys.executable}")
    print(f" Python Version:    {sys.version.split()[0]}")
    print(f" Server URL:        http://{host}:{port}")
    print(f" API Documentation: http://{host}:{port}/docs")
    print("=" * 60)

    uvicorn.run("backend.app:app", host=host, port=port, reload=False)
