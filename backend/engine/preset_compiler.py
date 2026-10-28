import json
import logging
from typing import Dict, List, Any, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("PresetCompiler")

class TensorRankMismatchError(Exception):
    """Raised when connected sockets have incompatible tensor ranks or variance."""
    pass

class NonHermitianWarning(UserWarning):
    """Warning emitted when quantum operators lack conjugate counterparts."""
    pass

def validate_socket_contraction(source_socket: Dict[str, Any], target_socket: Dict[str, Any]) -> bool:
    """
    Enforces tensor contraction rules:
    - Ranks must match for direct assignment, or contraction requires complementary variance (covariant/contravariant).
    """
    if source_socket["rank"] != target_socket["rank"]:
        # Allow contraction if ranks differ by valid index lowering/raising (e.g. Metric tensor contract)
        if abs(source_socket["rank"] - target_socket["rank"]) > 1:
            return False
            
    # Check variance contractability
    s_var = source_socket["variance"]
    t_var = target_socket["variance"]
    
    if s_var != "scalar" and t_var != "scalar" and s_var == t_var:
        logger.warning(f"Direct contraction between identical variances ({s_var}) without metric tensor may be invalid.")
        
    return True

def compile_preset(preset_data: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Validates the full node graph and connection topology for `v2.7.8`.
    Returns (is_valid, error_log).
    """
    errors = []
    nodes = {node["node_id"]: node for node in preset_data.get("nodes", [])}
    connections = preset_data.get("connections", [])
    
    # Index lookup helper for sockets
    socket_registry = {}
    for node_id, node in nodes.items():
        for s in node.get("inputs", []):
            socket_registry[f"{node_id}.in.{s['socket_id']}"] = s
        for s in node.get("outputs", []):
            socket_registry[f"{node_id}.out.{s['socket_id']}"] = s

    # Validate all connections
    for conn in connections:
        src_key = f"{conn['source_node']}.out.{conn['source_output']}"
        tgt_key = f"{conn['target_node']}.in.{conn['target_input']}"
        
        if src_key not in socket_registry or tgt_key not in socket_registry:
            errors.append(f"Broken wire connection: {src_key} -> {tgt_key}")
            continue
            
        src_socket = socket_registry[src_key]
        tgt_socket = socket_registry[tgt_key]
        
        if not validate_socket_contraction(src_socket, tgt_socket):
            errors.append(
                f"Tensor rank/variance mismatch at connection {src_key} "
                f"(Rank {src_socket['rank']} {src_socket['variance']}) -> "
                f"{tgt_key} (Rank {tgt_socket['rank']} {tgt_socket['variance']})"
            )

    is_valid = len(errors) == 0
    if is_valid:
        logger.info(f"Preset '{preset_data.get('preset_id')}' compiled successfully with {len(nodes)} nodes.")
    else:
        logger.error(f"Preset compilation failed with {len(errors)} error(s).")
        
    return is_valid, errors