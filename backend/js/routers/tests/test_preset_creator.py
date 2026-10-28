# backend/tests/test_preset_creator.py
import pytest
from fastapi.testclient import TestClient
from backend.main import app  # assuming main FastAPI app instance

client = TestClient(app)

def test_valid_preset_compilation():
    payload = {
        "preset_id": "test_preset_01",
        "metadata": {"title": "Topological Edge State Test"},
        "nodes": [
            {
                "node_id": "node_metric",
                "operator_type": "Schwarzschild Metric",
                "position_3d": [100.0, 150.0, 0.0],
                "inputs": [{"socket_id": "in_1", "rank": 2, "variance": "covariant", "shape_marker": "square"}],
                "outputs": [{"socket_id": "out_1", "rank": 2, "variance": "contravariant", "shape_marker": "square"}],
                "parameters": {"mass": 1.0}
            }
        ],
        "connections": [],
        "slider_bindings": {
            "coupling_strength": "0.75",
            "entropy_perturbation": "0.05",
            "stream_velocity": "1.00",
            "scalar_distortion": "0.20"
        }
    }
    
    response = client.post("/api/v2.7.8/presets/compile", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["preset_id"] == "test_preset_01"