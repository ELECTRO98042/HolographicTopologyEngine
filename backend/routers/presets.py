## backend/routers/presets.py
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from typing import Dict, Any, List
from backend.engine.preset_compiler import compile_preset

router = APIRouter(prefix="/api/v2.7.8/presets", tags=["Custom Scenario Preset Creator"])

class PresetPayload(BaseModel):
    preset_id: str
    metadata: Dict[str, Any]
    nodes: List[Dict[str, Any]]
    connections: List[Dict[str, Any]]
    slider_bindings: Dict[str, str] = Field(default_factory=dict)

@router.post("/compile", status_code=status.HTTP_200_OK)
def compile_and_register_preset(payload: PresetPayload):
    """
    Receives a custom preset configuration graph from the v2.7.8 frontend builder,
    runs tensor rank and socket validation, and registers it for JAX execution.
    """
    preset_dict = payload.dict()
    is_valid, errors = compile_preset(preset_dict)
    
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Preset compilation failed due to tensor/socket topology errors.",
                "messages": errors
            }
        )
        
    return {
        "status": "success",
        "preset_id": payload.preset_id,
        "message": "Custom scenario preset compiled and validated successfully for CH-05 topology engine rendering."
    }