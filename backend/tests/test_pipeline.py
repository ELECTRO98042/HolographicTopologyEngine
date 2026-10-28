# backend/tests/test_pipeline.py
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.engine.preset_compiler import compile_preset
from backend.engine.simulation_runner import CH04SimulationEngine

client = TestClient(app)

def test_full_preset_to_simulation_pipeline():
    """Validates end-to-end flow from preset graph compilation to JAX telemetry generation."""
    preset_payload = {
        "preset_id": "pipeline_test_01",
        "metadata": {"title": "Topological Gauge Pipeline"},
        "nodes": [
            {
                "node_id": "node_gauge",
                "operator_type": "Berry Curvature",
                "position_3d": [50.0, 50.0, 0.0],
                "inputs": [{"socket_id": "in_1", "rank": 2, "variance": "covariant", "shape_marker": "square"}],
                "outputs": [{"socket_id": "out_1", "rank": 2, "variance": "contravariant", "shape_marker": "square"}],
                "parameters": {"flux": 1.5}
            }
        ],
        "connections": [],
        "slider_bindings": {
            "coupling_strength": "0.80",
            "entropy_perturbation": "0.20",
            "stream_velocity": "1.50",
            "scalar_distortion": "0.10"
        }
    }

    # Step 1: Compile preset via API
    response = client.post("/api/v2.7.8/presets/compile", json=preset_payload)
    assert response.status_code == 200

    # Step 2: Initialize JAX simulation engine with compiled preset config
    engine = CH04SimulationEngine(preset_payload)
    frame = engine.generate_telemetry_frame(0)

    assert frame["status"] == "active"
    assert frame["preset_id"] == "pipeline_test_01"
    assert len(frame["tensor_norms"]) == 6