# backend/tests/test_simulation_runner.py
import pytest
import jax.numpy as jnp
from backend.engine.simulation_runner import CH04SimulationEngine

def test_simulation_engine_initialization():
    config = {
        "preset_id": "test_sim_01",
        "slider_bindings": {
            "coupling_strength": "0.60",
            "entropy_perturbation": "0.15",
            "stream_velocity": "1.20",
            "scalar_distortion": "0.05"
        }
    }
    engine = CH04SimulationEngine(config)
    assert engine.preset_id == "test_sim_01"
    assert engine.coupling_constant == 0.60

    frame = engine.generate_telemetry_frame(0)
    assert frame["status"] == "active"
    assert len(frame["tensor_norms"]) == 6