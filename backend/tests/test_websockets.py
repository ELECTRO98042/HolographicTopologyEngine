# backend/tests/test_websockets.py
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_websocket_telemetry_connection():
    """Verifies WebSocket telemetry streaming connectivity for v2.7.8 scenarios."""
    with client.websocket_connect("/ws/telemetry/ws_test_preset") as websocket:
        # Receive initial telemetry frame
        data = websocket.receive_json()
        assert data["status"] == "active"
        assert "tensor_norms" in data
        assert len(data["tensor_norms"]) == 6