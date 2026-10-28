# backend/engine/simulation_runner.py
import jax
jax.config.update("jax_enable_x64", True)
import jax.numpy as jnp
from typing import Dict, Any

@jax.jit
def _step_simulation_jit(state: jnp.ndarray, kappa: float, sigma: float, v: float, phi: float) -> jnp.ndarray:
    """
    JIT-compiled state evolution kernel across the 6 interleaved CH-04 spectral layers.
    """
    metric_base = state[0] * (1.0 + phi)
    connection_flow = state[1] + v * jnp.gradient(metric_base)[0]
    
    hamiltonian_mesh = state[2] + kappa * connection_flow
    entropy_layer = state[3] + sigma * jnp.abs(jnp.fft.fft2(hamiltonian_mesh))
    
    stream_dynamics = state[4] * v - jnp.roll(entropy_layer, shift=1, axis=1)
    boundary_layer = state[5] + jnp.tanh(hamiltonian_mesh * kappa)

    return jnp.stack([
        metric_base,
        connection_flow,
        hamiltonian_mesh,
        entropy_layer,
        stream_dynamics,
        boundary_layer
    ])

class CH04SimulationEngine:
    """
    Executes the JAX-accelerated backend simulation for custom scenario presets (v2.7.8),
    streaming real-time tensor telemetry to the CH-04 6-layer WebGL/SVG renderer.
    """
    def __init__(self, preset_config: Dict[str, Any]):
        self.preset_id = preset_config.get("preset_id")
        self.nodes = preset_config.get("nodes", [])
        self.slider_bindings = preset_config.get("slider_bindings", {})
        
        # Initialize spectral grid dimensions for the 6 CH-04 depth planes
        self.grid_resolution = 128
        self.state_tensor = jnp.zeros((6, self.grid_resolution, self.grid_resolution), dtype=jnp.complex128)
        self._initialize_operators()

    def _initialize_operators(self):
        """Maps custom operator nodes from the preset graph into JAX matrix kernels."""
        self.coupling_constant = float(self.slider_bindings.get("coupling_strength", 0.5))
        self.entropy_rate = float(self.slider_bindings.get("entropy_perturbation", 0.1))
        self.velocity = float(self.slider_bindings.get("stream_velocity", 1.0))
        self.distortion = float(self.slider_bindings.get("scalar_distortion", 0.0))

    def step_simulation(self, state: jnp.ndarray, kappa: float, sigma: float, v: float, phi: float) -> jnp.ndarray:
        return _step_simulation_jit(state, kappa, sigma, v, phi)

    def generate_telemetry_frame(self, step_idx: int) -> Dict[str, Any]:
        """Produces serialized tensor telemetry for WebSocket streaming."""
        self.state_tensor = self.step_simulation(
            self.state_tensor,
            self.coupling_constant,
            self.entropy_rate,
            self.velocity,
            self.distortion
        )
        
        return {
            "preset_id": self.preset_id,
            "step": step_idx,
            "tensor_norms": [float(jnp.linalg.norm(self.state_tensor[i])) for i in range(6)],
            "max_entropy": float(jnp.max(jnp.abs(self.state_tensor[3]))),
            "status": "active"
        }