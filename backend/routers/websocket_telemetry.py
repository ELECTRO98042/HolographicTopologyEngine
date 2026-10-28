# backend/routers/websocket_telemetry.py
import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.engine.simulation_runner import CH04SimulationEngine

router = APIRouter(tags=["WebSocket Telemetry"])

active_simulations = {}

@router.websocket("/ws/telemetry/{preset_id}")
async def websocket_telemetry_endpoint(websocket: WebSocket, preset_id: str):
    """
    WebSocket endpoint that streams real-time JAX simulation telemetry frames
    to the frontend CH-04 visual preview for version 2.7.8 preset scenarios.
    """
    await websocket.accept()
    
    if preset_id not in active_simulations:
        dummy_config = {
            "preset_id": preset_id,
            "slider_bindings": {
                "coupling_strength": "0.50",
                "entropy_perturbation": "0.10",
                "stream_velocity": "1.00",
                "scalar_distortion": "0.00"
            }
        }
        active_simulations[preset_id] = CH04SimulationEngine(dummy_config)
        
    sim_engine = active_simulations[preset_id]
    step_idx = 0

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=0.01)
                payload = json.loads(data)
                if "slider_bindings" in payload:
                    bindings = payload["slider_bindings"]
                    sim_engine.coupling_constant = float(bindings.get("coupling_strength", sim_engine.coupling_constant))
                    sim_engine.entropy_rate = float(bindings.get("entropy_perturbation", sim_engine.entropy_rate))
                    sim_engine.velocity = float(bindings.get("stream_velocity", sim_engine.velocity))
                    sim_engine.distortion = float(bindings.get("scalar_distortion", sim_engine.distortion))
            except asyncio.TimeoutError:
                pass

            telemetry = sim_engine.generate_telemetry_frame(step_idx)
            await websocket.send_json(telemetry)
            
            step_idx += 1
            await asyncio.sleep(0.033)
            
    except WebSocketDisconnect:
        pass