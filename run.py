"""
LeadSync Dashboard Server Launcher
Runs using Python 3.14 with Uvicorn.
"""
import sys
import os
import socket
import uvicorn

# Ensure the root directory is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

def find_available_port(start_port=8888):
    for port in [8888, 8090, 8500, 5000, 9000]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    return start_port

if __name__ == "__main__":
    port = find_available_port(8888)
    print("=" * 60)
    print(" LeadSync Role Succession & Assessment Platform")
    print(f" Python Executable: {sys.executable}")
    print(f" Python Version:    {sys.version.split()[0]}")
    print(f" Server URL:        http://127.0.0.1:{port}")
    print(f" API Documentation: http://127.0.0.1:{port}/docs")
    print("=" * 60)

    uvicorn.run("backend.app:app", host="127.0.0.1", port=port, reload=False)
