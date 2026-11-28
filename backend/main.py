"""
main.py
Stage 3 Authoritative Pipeline Coordinator, Unified Frame Builder &
Multi-Channel Broadcast Fan-Out for the Holographic Topology Engine.
"""

from __future__ import annotations

import asyncio
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
import importlib
import json
import math
import os
import struct
import threading
import time
import numpy as np
from typing import Any, Dict, List, Optional, Tuple

from pathlib import Path
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.compute_engine import (
    compute_model_geometry_suite,
    configure_jax_precision,
    make_provenance,
    serialize_coords_to_binary,
)
from backend.oscilloscope_engine import (
    assemble_oscilloscope_projection,
    build_oscilloscope_sample,
)

SCHEMA_VERSION = "1.0.0"
FRAME_CONTRACT_VERSION = "3.0.0"

PIPELINE_MODES = ("live", "benchmark/synthetic")
PROVENANCE_STATUSES = ("exact", "reduced_order", "unpopulated", "degenerate")

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = REPO_ROOT / "frontend"
BACKEND_DIR = Path(__file__).resolve().parent

CH05_AXES: List[Dict[str, Any]] = [
    {"index": 0, "name": "x", "label": "Position X", "unit": "fm"},
    {"index": 1, "name": "y", "label": "Position Y", "unit": "fm"},
    {"index": 2, "name": "z", "label": "Position Z", "unit": "fm"},
    {"index": 3, "name": "px", "label": "Momentum / State Axis 3", "unit": "GeV/c"},
    {"index": 4, "name": "py", "label": "Momentum / State Axis 4", "unit": "GeV/c"},
    {"index": 5, "name": "pz_or_phase", "label": "Momentum Z / Phase Axis 5", "unit": "GeV/c or rad"},
]

DEFAULT_UNITS: Dict[str, str] = {
    "length": "fm",
    "energy": "GeV",
    "momentum": "GeV/c",
    "mass": "GeV/c^2",
    "charge": "e",
    "time": "fm/c",
    "phase": "rad",
}

DEFAULT_BOUNDS: Dict[str, List[float]] = {
    "x": [-10.0, 10.0],
    "y": [-10.0, 10.0],
    "z": [-10.0, 10.0],
}

# Configure JAX 64-bit mode once at startup before worker threads run JIT kernels.
configure_jax_precision(enable_x64=True)


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def _finite_float(value: Any, fallback: float = 0.0) -> float:
    if _is_finite_number(value):
        return float(value)
    return float(fallback)


def _sanitize_json_tree(obj: Any, fallback_num: float = 0.0) -> Any:
    """Recursively ensure all numbers in JSON payloads are finite."""
    if isinstance(obj, bool) or obj is None or isinstance(obj, str):
        return obj
    if isinstance(obj, (int, float)):
        return float(obj) if math.isfinite(float(obj)) else fallback_num
    if isinstance(obj, np.floating):
        val = float(obj)
        return val if math.isfinite(val) else fallback_num
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.ndarray):
        arr = np.nan_to_num(obj, nan=fallback_num, posinf=fallback_num, neginf=fallback_num)
        return arr.tolist()
    if isinstance(obj, dict):
        return {str(k): _sanitize_json_tree(v, fallback_num) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_json_tree(item, fallback_num) for item in obj]
    return str(obj)


def _sanitize_vec3(raw: Any, fallback: Tuple[float, float, float] = (0.0, 0.0, 0.0)) -> List[float]:
    if isinstance(raw, (list, tuple)) and len(raw) >= 3:
        return [
            _finite_float(raw[0], fallback[0]),
            _finite_float(raw[1], fallback[1]),
            _finite_float(raw[2], fallback[2]),
        ]
    return [float(fallback[0]), float(fallback[1]), float(fallback[2])]


def _sanitize_bounds(raw: Any, fallback: List[float]) -> List[float]:
    if isinstance(raw, (list, tuple)) and len(raw) >= 2:
        a = _finite_float(raw[0], fallback[0])
        b = _finite_float(raw[1], fallback[1])
        return [a, b] if a <= b else [b, a]
    return [float(fallback[0]), float(fallback[1])]


def normalize_node(raw: Dict[str, Any], index: int) -> Dict[str, Any]:
    node_id = (
        str(raw["id"])
        if raw.get("id") is not None and str(raw.get("id")).strip() != ""
        else f"node_{index}"
    )
    label = str(raw.get("label") if raw.get("label") is not None else node_id)
    species = str(raw.get("species") or raw.get("particle") or "generic_entity")
    pdg_id = int(raw["pdg_id"]) if _is_finite_number(raw.get("pdg_id")) else None
    tier = str(raw.get("tier") or "BULK_CORE")

    raw_flags = raw.get("flags") if isinstance(raw.get("flags"), dict) else {}
    flags = {
        "is_core": bool(raw_flags.get("is_core", raw.get("isCore", False))),
        "is_severed": bool(raw_flags.get("is_severed", raw.get("isSevered", False))),
        "pinned": bool(raw_flags.get("pinned", False)),
    }

    if "position" in raw:
        pos = _sanitize_vec3(raw.get("position"))
    else:
        pos = _sanitize_vec3([raw.get("x", 0.0), raw.get("y", 0.0), raw.get("z", 0.0)])

    mom_source = raw.get("momentum") if "momentum" in raw else raw.get("velocity")
    momentum = _sanitize_vec3(mom_source) if isinstance(mom_source, (list, tuple)) else None

    raw_quantum = raw.get("quantum")
    if not isinstance(raw_quantum, dict) and isinstance(raw.get("attributes"), dict):
        raw_quantum = raw["attributes"].get("quantum")
    if not isinstance(raw_quantum, dict):
        raw_quantum = {}

    quantum = {
        "color_charge": raw_quantum.get("color_charge"),
        "isospin": _finite_float(raw_quantum["isospin"]) if _is_finite_number(raw_quantum.get("isospin")) else None,
        "hypercharge": (
            _finite_float(raw_quantum["hypercharge"]) if _is_finite_number(raw_quantum.get("hypercharge")) else None
        ),
        "baryon_number": (
            _finite_float(raw_quantum["baryon_number"])
            if _is_finite_number(raw_quantum.get("baryon_number"))
            else None
        ),
        "lepton_number": (
            _finite_float(raw_quantum["lepton_number"])
            if _is_finite_number(raw_quantum.get("lepton_number"))
            else None
        ),
        "parity": raw_quantum.get("parity"),
    }

    extensions = _sanitize_json_tree(raw["extensions"]) if isinstance(raw.get("extensions"), dict) else {}

    return {
        "id": node_id,
        "label": label,
        "species": species,
        "pdg_id": pdg_id,
        "tier": tier,
        "flags": flags,
        "position": pos,
        "momentum": momentum,
        "energy": _finite_float(raw["energy"]) if _is_finite_number(raw.get("energy")) else None,
        "mass": _finite_float(raw["mass"]) if _is_finite_number(raw.get("mass")) else None,
        "charge": _finite_float(raw["charge"]) if _is_finite_number(raw.get("charge")) else None,
        "spin": _finite_float(raw["spin"]) if _is_finite_number(raw.get("spin")) else None,
        "phase": _finite_float(raw.get("phase"), 0.0),
        "quantum": quantum,
        "extensions": extensions,
    }


def normalize_edge(raw: Dict[str, Any], index: int, valid_node_ids: set[str]) -> Optional[Dict[str, Any]]:
    source = str(raw.get("source", "")).strip()
    target = str(raw.get("target", "")).strip()
    if not source or not target or source not in valid_node_ids or target not in valid_node_ids:
        return None

    edge_id = (
        str(raw["id"])
        if raw.get("id") is not None and str(raw.get("id")).strip() != ""
        else f"edge_{index}"
    )
    interaction = str(raw.get("interaction") or raw.get("type") or "coupling")
    raw_weight = raw.get("weight") if "weight" in raw else raw.get("strength")
    weight = _finite_float(raw_weight, 1.0)
    phase = _finite_float(raw.get("phase"), 0.0)
    extensions = _sanitize_json_tree(raw["extensions"]) if isinstance(raw.get("extensions"), dict) else {}

    return {
        "id": edge_id,
        "source": source,
        "target": target,
        "interaction": interaction,
        "weight": weight,
        "phase": phase,
        "extensions": extensions,
    }


def build_default_canonical_model() -> Dict[str, Any]:
    """Construct a deterministic 12-node ring baseline model with explicit provenance."""
    n = 12
    radius = 4.0
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []

    for idx in range(n):
        angle = (2.0 * math.pi * idx) / n
        x = radius * math.cos(angle)
        y = radius * math.sin(angle)
        z = 0.0
        node_id = f"q_{idx:02d}"
        nodes.append(
            normalize_node(
                {
                    "id": node_id,
                    "label": f"Qubit {idx}",
                    "species": "qubit_register_node",
                    "tier": "BOUNDARY" if idx % 3 == 0 else "BULK_CORE",
                    "flags": {"is_core": idx % 3 != 0, "is_severed": False, "pinned": False},
                    "position": [x, y, z],
                    "momentum": [-math.sin(angle), math.cos(angle), 0.0],
                    "spin": 0.5,
                    "phase": angle,
                },
                idx,
            )
        )

    for idx in range(n):
        nxt = (idx + 1) % n
        edges.append(
            {
                "id": f"e_{idx:02d}_{nxt:02d}",
                "source": f"q_{idx:02d}",
                "target": f"q_{nxt:02d}",
                "interaction": "nearest_neighbor_coupling",
                "weight": 1.0,
                "phase": 0.0,
                "extensions": {},
            }
        )

    return {
        "schema_version": SCHEMA_VERSION,
        "model_id": "ring_12_baseline",
        "title": "12-Node Ring Topology Baseline",
        "mode": "live",
        "seq": 1,
        "step": 0,
        "timestamp": time.time(),
        "reference_frame": "lab_inertial",
        "units": dict(DEFAULT_UNITS),
        "domain_bounds": {
            "x": list(DEFAULT_BOUNDS["x"]),
            "y": list(DEFAULT_BOUNDS["y"]),
            "z": list(DEFAULT_BOUNDS["z"]),
        },
        "nodes": nodes,
        "edges": edges,
        "metric_spec": None,
        "state_manifold_spec": None,
        "extensions": {"origin": "default_baseline"},
    }


def pack_typed_tensor_binary(array_like: Any, dtype_str: str = "float32") -> Tuple[bytes, Dict[str, Any]]:
    """
    Pack a finite contiguous tensor into raw bytes with an explicit self-describing header.
    Header layout (little-endian):
      - 4 bytes magic: b'HTEF'
      - 1 byte version: 1
      - 1 byte ndim: up to 4
      - 2 bytes reserved: 0
      - 4 x uint32 dimensions (padded with 1s for unused axes)
    """
    if dtype_str == "float64":
        arr = np.asarray(array_like, dtype=np.float64)
        arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
        raw_bytes = np.ascontiguousarray(arr).tobytes()
        wire_dtype = "float64"
    else:
        arr = np.asarray(array_like, dtype=np.float32)
        arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
        raw_bytes = serialize_coords_to_binary(arr)
        wire_dtype = "float32"

    shape = list(arr.shape)
    ndim = len(shape)
    padded_dims = [int(shape[i]) if i < ndim else 1 for i in range(4)]
    header = struct.pack("<4sBBH4I", b"HTEF", 1, min(ndim, 4), 0, *padded_dims)
    meta = {
        "magic": "HTEF",
        "header_bytes": len(header),
        "payload_bytes": len(raw_bytes),
        "shape": shape,
        "dtype": wire_dtype,
    }
    return header + raw_bytes, meta


class ModelUpdateRequest(BaseModel):
    model_id: Optional[str] = None
    title: Optional[str] = None
    mode: Optional[str] = None
    step: Optional[int] = Field(default=None, ge=0)
    reference_frame: Optional[str] = None
    units: Optional[Dict[str, str]] = None
    domain_bounds: Optional[Dict[str, List[float]]] = None
    nodes: Optional[List[Dict[str, Any]]] = None
    edges: Optional[List[Dict[str, Any]]] = None
    metric_spec: Optional[Dict[str, Any]] = None
    state_manifold_spec: Optional[Dict[str, Any]] = None
    extensions: Optional[Dict[str, Any]] = None
    replace_graph: bool = True


class ComputeRequest(BaseModel):
    advance_steps: int = Field(default=1, ge=0, le=1000)
    dt: float = Field(default=0.05, gt=0.0, le=10.0)
    mode: Optional[str] = None
    grid_size: int = Field(default=32, ge=8, le=128)


class PipelineAuthority:
    """
    Single source of truth for canonical model state, JAX differential/information
    geometry & oscilloscope evaluation, and unified multi-channel frame assembly.
    """

    def __init__(self, max_workers: int = 2) -> None:
        self._lock = threading.RLock()
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="hte_compute")
        self._model: Dict[str, Any] = build_default_canonical_model()
        self._history: deque[Dict[str, Any]] = deque(maxlen=512)
        self._latest_frame: Dict[str, Any] = self._assemble_frame(self._model, grid_size=32, dt=0.05)
        self._subscribers: set[asyncio.Queue[Dict[str, Any]]] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def attach_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        with self._lock:
            self._loop = loop

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)

    def register_subscriber(self, queue: asyncio.Queue[Dict[str, Any]]) -> None:
        with self._lock:
            self._subscribers.add(queue)

    def unregister_subscriber(self, queue: asyncio.Queue[Dict[str, Any]]) -> None:
        with self._lock:
            self._subscribers.discard(queue)

    def _publish_frame_unlocked(self, frame: Dict[str, Any]) -> None:
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        for queue in list(self._subscribers):
            def _push(q: asyncio.Queue[Dict[str, Any]] = queue, f: Dict[str, Any] = frame) -> None:
                if q.full():
                    try:
                        q.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                try:
                    q.put_nowait(f)
                except asyncio.QueueFull:
                    pass

            loop.call_soon_threadsafe(_push)

    def _compute_canonical_observables(self, model: Dict[str, Any], grid_size: int = 32) -> Dict[str, Any]:
        """
        Compute deterministic observables directly from canonical nodes, edges, and
        JAX differential/information geometry kernels.
        """
        nodes = model["nodes"]
        edges = model["edges"]
        n_nodes = len(nodes)
        n_edges = len(edges)

        geometry = compute_model_geometry_suite(model)

        if n_nodes == 0:
            return {
                "node_count": 0,
                "edge_count": 0,
                "mean_degree": 0.0,
                "total_coupling_weight": 0.0,
                "mean_phase_rad": 0.0,
                "phase_coherence_r": 0.0,
                "kinetic_or_momentum_norm": None,
                "momentum_provenance": make_provenance(
                    "unpopulated",
                    "canonical_model.nodes.momentum",
                    missing_inputs=["nodes", "node.momentum"],
                    notes="No nodes or momentum vectors present.",
                ),
                "metric_curvature": geometry["metric_curvature"],
                "information_geometry": geometry["information_geometry"],
                "grid_resolution": grid_size,
            }

        id_to_idx = {n["id"]: idx for idx, n in enumerate(nodes)}
        degrees = np.zeros(n_nodes, dtype=np.float64)
        total_weight = 0.0
        for e in edges:
            i = id_to_idx.get(e["source"])
            j = id_to_idx.get(e["target"])
            if i is not None and j is not None:
                degrees[i] += 1.0
                degrees[j] += 1.0
                total_weight += abs(float(e["weight"]))

        phases = np.array([_finite_float(n.get("phase"), 0.0) for n in nodes], dtype=np.float64)
        mean_phase = float(np.mean(phases))
        coherence_r = float(np.abs(np.mean(np.exp(1j * phases))))

        momenta = [
            n["momentum"]
            for n in nodes
            if isinstance(n.get("momentum"), list) and len(n["momentum"]) >= 3
        ]
        if momenta:
            p_arr = np.asarray(momenta, dtype=np.float64)
            p_norm: Optional[float] = float(np.linalg.norm(p_arr))
            mom_prov = make_provenance("exact", "canonical_model.nodes.momentum")
        else:
            p_norm = None
            mom_prov = make_provenance(
                "unpopulated",
                "canonical_model.nodes.momentum",
                missing_inputs=["node.momentum"],
                notes="Momentum vectors not populated on active nodes.",
            )

        return {
            "node_count": n_nodes,
            "edge_count": n_edges,
            "mean_degree": float(np.mean(degrees)),
            "total_coupling_weight": float(total_weight),
            "mean_phase_rad": mean_phase,
            "phase_coherence_r": coherence_r,
            "kinetic_or_momentum_norm": p_norm,
            "momentum_provenance": mom_prov,
            "metric_curvature": geometry["metric_curvature"],
            "information_geometry": geometry["information_geometry"],
            "grid_resolution": grid_size,
        }

    def _assemble_frame(self, model: Dict[str, Any], grid_size: int = 32, dt: float = 0.05) -> Dict[str, Any]:
        """Build one self-describing authoritative frame snapshot across HUD and CH-01..CH-05."""
        observables = self._compute_canonical_observables(model, grid_size=grid_size)
        nodes = model["nodes"]
        edges = model["edges"]
        n_nodes = len(nodes)

        osc_sample = build_oscilloscope_sample(model, observables, dt=dt)
        self._history.append(osc_sample)
        ch01_projection = assemble_oscilloscope_projection(
            model, observables, list(self._history), dt=dt
        )

        # Bounded 2D topological field grid over explicit domain bounds
        xb = model["domain_bounds"]["x"]
        yb = model["domain_bounds"]["y"]
        xs = np.linspace(xb[0], xb[1], grid_size, dtype=np.float32)
        ys = np.linspace(yb[0], yb[1], grid_size, dtype=np.float32)
        xx, yy = np.meshgrid(xs, ys, indexing="ij")
        field_grid = np.zeros((grid_size, grid_size), dtype=np.float32)

        for n in nodes:
            nx, ny, _ = n["position"]
            w = _finite_float(n.get("mass"), 1.0)
            phase = _finite_float(n.get("phase"), 0.0)
            dist2 = (xx - float(nx)) ** 2 + (yy - float(ny)) ** 2 + 0.25
            field_grid += np.float32(w * math.cos(phase)) / dist2

        field_grid = np.nan_to_num(field_grid, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)

        # Canonical 32x32 matrix for CH-03 derived from edges, phases, and step
        matrix_size = 32
        matrix_32 = np.zeros((matrix_size, matrix_size), dtype=np.float32)
        id_to_idx = {n["id"]: idx for idx, n in enumerate(nodes)}
        limit = min(n_nodes, matrix_size)
        step_val = int(model.get("step", 0))
        step_phase = 0.15 * float(step_val)

        for e in edges:
            i = id_to_idx.get(e["source"])
            j = id_to_idx.get(e["target"])
            if i is not None and j is not None and i < limit and j < limit:
                w = _finite_float(e.get("weight"), 1.0)
                e_phase = _finite_float(e.get("phase"), 0.0)
                val = np.float32(w * math.cos(e_phase + 0.1 * float(step_val)))
                matrix_32[i, j] += val
                matrix_32[j, i] += val

        for r in range(matrix_size):
            r_phase = _finite_float(nodes[r % n_nodes].get("phase"), 0.0) if n_nodes > 0 else 0.0
            for c in range(matrix_size):
                if r >= limit or c >= limit or matrix_32[r, c] == 0.0:
                    wave = 0.25 * math.sin(step_phase + (r * 0.25) - (c * 0.2)) * math.cos(r_phase + (c * 0.12))
                    matrix_32[r, c] = np.float32(wave)

        matrix_32 = np.nan_to_num(matrix_32, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)

        # Explicit 6D state coordinates for CH-05: shape (N, 6)
        state_6d = np.zeros((n_nodes, 6), dtype=np.float32)
        for idx, n in enumerate(nodes):
            px, py, pz = (
                n["momentum"]
                if isinstance(n.get("momentum"), list)
                else [0.0, 0.0, _finite_float(n.get("phase"), 0.0)]
            )
            state_6d[idx, 0] = np.float32(n["position"][0])
            state_6d[idx, 1] = np.float32(n["position"][1])
            state_6d[idx, 2] = np.float32(n["position"][2])
            state_6d[idx, 3] = np.float32(px)
            state_6d[idx, 4] = np.float32(py)
            state_6d[idx, 5] = np.float32(pz)
        state_6d = np.nan_to_num(state_6d, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)

        frame = {
            "schema_version": SCHEMA_VERSION,
            "frame_contract_version": FRAME_CONTRACT_VERSION,
            "seq": model["seq"],
            "step": model["step"],
            "timestamp": model["timestamp"],
            "mode": model["mode"],
            "model_id": model["model_id"],
            "title": model["title"],
            "reference_frame": model["reference_frame"],
            "units": dict(model["units"]),
            "domain_bounds": {k: list(v) for k, v in model["domain_bounds"].items()},
            "observables": observables,
            "projections": {
                "HUD": {
                    "channel": "HUD",
                    "role": "master_hud",
                    "seq": model["seq"],
                    "step": model["step"],
                    "mode": model["mode"],
                    "model_id": model["model_id"],
                    "title": model["title"],
                    "node_count": n_nodes,
                    "edge_count": len(edges),
                    "observables": observables,
                },
                "CH-01": ch01_projection,
                "CH-02": {
                    "channel": "CH-02",
                    "role": "topological_lattice_3d",
                    "seq": model["seq"],
                    "step": model["step"],
                    "mode": model["mode"],
                    "grid_shape": [grid_size, grid_size],
                    "bounds": {
                        "x": list(xb),
                        "y": list(yb),
                        "z": list(model["domain_bounds"]["z"]),
                    },
                    "units": {
                        "x": model["units"]["length"],
                        "y": model["units"]["length"],
                        "z": model["units"]["length"],
                    },
                    "dtype": "float32",
                    "field_2d": field_grid.tolist(),
                    "nodes": nodes,
                    "edges": edges,
                    "provenance": make_provenance(
                        "exact",
                        "canonical_model.nodes_and_edges",
                        notes="Explicit grid_shape, bounds, and topology nodes/edges.",
                    ),
                },
                "CH-03": {
                    "channel": "CH-03",
                    "role": "matrix_tensor",
                    "seq": model["seq"],
                    "step": model["step"],
                    "mode": model["mode"],
                    "shape": [matrix_size, matrix_size],
                    "axes": ["matrix_row_i", "matrix_col_j"],
                    "dtype": "float32",
                    "matrix": matrix_32.tolist(),
                    "provenance": make_provenance(
                        "exact",
                        "canonical_model.edges.weight",
                        notes="32x32 coupling and phase-stepped matrix derived directly from canonical model.",
                    ),
                },
                "CH-04": {
                    "channel": "CH-04",
                    "role": "phase_space",
                    "seq": model["seq"],
                    "step": model["step"],
                    "mode": model["mode"],
                    "count": n_nodes,
                    "units": {
                        "position": model["units"]["length"],
                        "momentum": model["units"]["momentum"],
                        "phase": model["units"]["phase"],
                    },
                    "points": [
                        {
                            "id": n["id"],
                            "position": n["position"],
                            "momentum": n["momentum"],
                            "phase": n["phase"],
                        }
                        for n in nodes
                    ],
                    "provenance": observables["momentum_provenance"],
                },
                "CH-05": {
                    "channel": "CH-05",
                    "role": "holographic_topology_6d",
                    "seq": model["seq"],
                    "step": model["step"],
                    "mode": model["mode"],
                    "shape": [n_nodes, 6],
                    "dtype": "float32",
                    "dimensions": CH05_AXES,
                    "state_6d": state_6d.tolist(),
                    "provenance": make_provenance(
                        "exact",
                        "canonical_model.nodes",
                        notes="Named 6-axis state tensor [x, y, z, px, py, pz_or_phase].",
                    ),
                },
            },
        }
        return _sanitize_json_tree(frame)

    def get_model(self) -> Dict[str, Any]:
        with self._lock:
            return _sanitize_json_tree(self._model)

    def get_latest_frame(self) -> Dict[str, Any]:
        with self._lock:
            return _sanitize_json_tree(self._latest_frame)

    def get_channel_envelope(self, channel: str) -> Dict[str, Any]:
        with self._lock:
            frame = self._latest_frame
            proj = frame.get("projections", {}).get(channel)
            if proj is None:
                raise KeyError(f"Unknown channel: {channel}")
            return {
                "schema_version": frame["schema_version"],
                "frame_contract_version": frame["frame_contract_version"],
                "channel": channel,
                "seq": frame["seq"],
                "step": frame["step"],
                "timestamp": frame["timestamp"],
                "mode": frame["mode"],
                "model_id": frame["model_id"],
                "units": frame["units"],
                "domain_bounds": frame["domain_bounds"],
                "projection": _sanitize_json_tree(proj),
            }

    def get_channel_binary(self, channel: str) -> Tuple[bytes, Dict[str, Any]]:
        with self._lock:
            frame = self._latest_frame
            proj = frame.get("projections", {}).get(channel)
            if proj is None:
                raise KeyError(f"Unknown channel: {channel}")

            if channel == "CH-02":
                blob, meta = pack_typed_tensor_binary(proj.get("field_2d", []), dtype_str="float32")
            elif channel == "CH-03":
                blob, meta = pack_typed_tensor_binary(proj.get("matrix", []), dtype_str="float32")
            elif channel == "CH-05":
                blob, meta = pack_typed_tensor_binary(proj.get("state_6d", []), dtype_str="float32")
            elif channel == "CH-04":
                pts = [
                    p.get("position", [0.0, 0.0, 0.0]) + (p.get("momentum") or [0.0, 0.0, 0.0])
                    for p in proj.get("points", [])
                ]
                blob, meta = pack_typed_tensor_binary(pts, dtype_str="float32")
            else:
                # Default N x 3 node positions for HUD / CH-01 binary fallback
                pos_list = [n.get("position", [0.0, 0.0, 0.0]) for n in self._model.get("nodes", [])]
                blob, meta = pack_typed_tensor_binary(pos_list, dtype_str="float32")

            headers = {
                "X-HTE-Schema-Version": str(frame["schema_version"]),
                "X-HTE-Frame-Contract": str(frame["frame_contract_version"]),
                "X-HTE-Channel": str(channel),
                "X-HTE-Seq": str(frame["seq"]),
                "X-HTE-Step": str(frame["step"]),
                "X-HTE-Mode": str(frame["mode"]),
                "X-HTE-Shape": json.dumps(meta["shape"]),
                "X-HTE-Dtype": str(meta["dtype"]),
                "X-HTE-Header-Bytes": str(meta["header_bytes"]),
            }
            return blob, headers

    def update_model(self, req: ModelUpdateRequest, grid_size: int = 32) -> Dict[str, Any]:
        with self._lock:
            current = self._model
            next_seq = current["seq"] + 1
            now = time.time()

            mode = req.mode if req.mode in PIPELINE_MODES else current["mode"]
            step = req.step if req.step is not None else current["step"]

            if req.replace_graph:
                raw_nodes = req.nodes if req.nodes is not None else []
                nodes = [normalize_node(n, idx) for idx, n in enumerate(raw_nodes)]
                valid_ids = {n["id"] for n in nodes}
                raw_edges = req.edges if req.edges is not None else []
                edges = [
                    e
                    for idx, raw_e in enumerate(raw_edges)
                    if (e := normalize_edge(raw_e, idx, valid_ids)) is not None
                ]
            else:
                nodes = list(current["nodes"])
                if req.nodes is not None:
                    by_id = {n["id"]: n for n in nodes}
                    for idx, raw_n in enumerate(req.nodes):
                        norm_n = normalize_node(raw_n, idx)
                        by_id[norm_n["id"]] = norm_n
                    nodes = list(by_id.values())
                valid_ids = {n["id"] for n in nodes}
                edges = [e for e in current["edges"] if e["source"] in valid_ids and e["target"] in valid_ids]
                if req.edges is not None:
                    for idx, raw_e in enumerate(req.edges):
                        norm_e = normalize_edge(raw_e, idx, valid_ids)
                        if norm_e is not None:
                            edges.append(norm_e)

            units = dict(current["units"])
            if isinstance(req.units, dict):
                for k, v in req.units.items():
                    if isinstance(k, str) and isinstance(v, str) and v.strip():
                        units[k] = v.strip()

            bounds = {
                "x": _sanitize_bounds(
                    req.domain_bounds.get("x") if isinstance(req.domain_bounds, dict) else None,
                    current["domain_bounds"]["x"],
                ),
                "y": _sanitize_bounds(
                    req.domain_bounds.get("y") if isinstance(req.domain_bounds, dict) else None,
                    current["domain_bounds"]["y"],
                ),
                "z": _sanitize_bounds(
                    req.domain_bounds.get("z") if isinstance(req.domain_bounds, dict) else None,
                    current["domain_bounds"]["z"],
                ),
            }

            updated_model = {
                "schema_version": SCHEMA_VERSION,
                "model_id": str(req.model_id) if req.model_id else current["model_id"],
                "title": str(req.title) if req.title else current["title"],
                "mode": mode,
                "seq": next_seq,
                "step": int(step),
                "timestamp": now,
                "reference_frame": (
                    str(req.reference_frame) if req.reference_frame else current["reference_frame"]
                ),
                "units": units,
                "domain_bounds": bounds,
                "nodes": nodes,
                "edges": edges,
                "metric_spec": (
                    _sanitize_json_tree(req.metric_spec)
                    if req.metric_spec is not None
                    else current.get("metric_spec")
                ),
                "state_manifold_spec": (
                    _sanitize_json_tree(req.state_manifold_spec)
                    if req.state_manifold_spec is not None
                    else current.get("state_manifold_spec")
                ),
                "extensions": (
                    _sanitize_json_tree(req.extensions)
                    if req.extensions is not None
                    else current.get("extensions", {})
                ),
            }

            self._model = updated_model
            frame = self._assemble_frame(updated_model, grid_size=grid_size, dt=0.05)
            self._latest_frame = frame
            self._publish_frame_unlocked(frame)
            return _sanitize_json_tree(frame)

    def _run_step_sync(
        self,
        advance_steps: int,
        dt: float,
        mode_override: Optional[str],
        grid_size: int,
    ) -> Dict[str, Any]:
        with self._lock:
            current = self._model
            next_seq = current["seq"] + 1
            next_step = current["step"] + int(advance_steps)
            now = time.time()
            mode = mode_override if mode_override in PIPELINE_MODES else current["mode"]

            n_nodes = len(current["nodes"])
            id_to_idx = {n["id"]: idx for idx, n in enumerate(current["nodes"])}
            coupling_drive = np.zeros(n_nodes, dtype=np.float64)
            for e in current["edges"]:
                i = id_to_idx.get(e["source"])
                j = id_to_idx.get(e["target"])
                if i is not None and j is not None:
                    w = float(e["weight"])
                    p_diff = float(current["nodes"][j]["phase"]) - float(current["nodes"][i]["phase"])
                    coupling_drive[i] += w * math.sin(p_diff)

            updated_nodes: List[Dict[str, Any]] = []
            delta_t = float(advance_steps) * float(dt)
            for idx, node in enumerate(current["nodes"]):
                n_copy = dict(node)
                base_phase = _finite_float(node.get("phase"), 0.0)
                omega = _finite_float(node.get("energy"), 1.0)
                new_phase = (base_phase + delta_t * (omega + float(coupling_drive[idx]))) % (2.0 * math.pi)
                n_copy["phase"] = _finite_float(new_phase, 0.0)
                if isinstance(node.get("momentum"), list) and len(node["momentum"]) >= 3:
                    pos = list(node["position"])
                    mom = list(node["momentum"])
                    n_copy["position"] = [
                        _finite_float(pos[0] + mom[0] * delta_t, pos[0]),
                        _finite_float(pos[1] + mom[1] * delta_t, pos[1]),
                        _finite_float(pos[2] + mom[2] * delta_t, pos[2]),
                    ]
                updated_nodes.append(n_copy)

            updated_model = dict(current)
            updated_model["seq"] = next_seq
            updated_model["step"] = next_step
            updated_model["timestamp"] = now
            updated_model["mode"] = mode
            updated_model["nodes"] = updated_nodes

            self._model = updated_model
            frame = self._assemble_frame(updated_model, grid_size=grid_size, dt=dt)
            self._latest_frame = frame
            self._publish_frame_unlocked(frame)
            return _sanitize_json_tree(frame)

    async def step_async(
        self,
        advance_steps: int = 1,
        dt: float = 0.05,
        mode_override: Optional[str] = None,
        grid_size: int = 32,
    ) -> Dict[str, Any]:
        loop = asyncio.get_running_loop()
        self.attach_loop(loop)
        return await loop.run_in_executor(
            self._executor,
            self._run_step_sync,
            advance_steps,
            dt,
            mode_override,
            grid_size,
        )

    async def update_model_async(self, req: ModelUpdateRequest, grid_size: int = 32) -> Dict[str, Any]:
        loop = asyncio.get_running_loop()
        self.attach_loop(loop)
        return await loop.run_in_executor(
            self._executor,
            self.update_model,
            req,
            grid_size,
        )


pipeline = PipelineAuthority(max_workers=2)


def _try_include_router(app: FastAPI, module_path: str, attr_name: str = "router") -> None:
    try:
        mod = importlib.import_module(module_path)
        router = getattr(mod, attr_name, None)
        if router is not None:
            app.include_router(router)
    except Exception:
        pass


async def _pipeline_ticker(interval_s: float = 0.1, dt: float = 0.05) -> None:
    while True:
        await asyncio.sleep(interval_s)
        try:
            await pipeline.step_async(advance_steps=1, dt=dt)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"[HTE _pipeline_ticker error]: {exc}", flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    pipeline.attach_loop(asyncio.get_running_loop())
    ticker_task = asyncio.create_task(_pipeline_ticker())
    try:
        yield
    finally:
        ticker_task.cancel()
        try:
            await ticker_task
        except asyncio.CancelledError:
            pass
        pipeline.shutdown()


app = FastAPI(
    title="Holographic Topology Engine",
    version=SCHEMA_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if (FRONTEND_DIR / "css").exists():
    app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")

if (BACKEND_DIR / "js").exists():
    app.mount("/js", StaticFiles(directory=str(BACKEND_DIR / "js")), name="js")

if (BACKEND_DIR / "physics").exists():
    app.mount("/physics", StaticFiles(directory=str(BACKEND_DIR / "physics")), name="physics")

@app.get("/favicon.ico")
async def serve_favicon():
    ico_path = FRONTEND_DIR / "favicon.ico"
    return FileResponse(ico_path)

async def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")

_try_include_router(app, "backend.routes.test_suite_routes", "router")

@app.get("/api/health")
async def health():
    frame = pipeline.get_latest_frame()
    return {
        "status": "ok",
        "authority": "main.py",
        "schema_version": SCHEMA_VERSION,
        "frame_contract_version": FRAME_CONTRACT_VERSION,
        "seq": frame["seq"],
        "step": frame["step"],
        "mode": frame["mode"],
        "model_id": frame["model_id"],
    }


@app.get("/api/telemetry/model")
async def get_canonical_model():
    return pipeline.get_model()


@app.post("/api/telemetry/model")
async def set_canonical_model(req: ModelUpdateRequest):
    frame = await pipeline.update_model_async(req)
    return {
        "status": "ok",
        "seq": frame["seq"],
        "step": frame["step"],
        "mode": frame["mode"],
        "model": pipeline.get_model(),
        "frame": frame,
    }


@app.post("/api/compute")
async def trigger_compute(req: ComputeRequest):
    mode_override = req.mode if req.mode in PIPELINE_MODES else None
    frame = await pipeline.step_async(
        advance_steps=req.advance_steps,
        dt=req.dt,
        mode_override=mode_override,
        grid_size=req.grid_size,
    )
    return {
        "status": "ok",
        "seq": frame["seq"],
        "step": frame["step"],
        "mode": frame["mode"],
        "frame": frame,
    }


@app.get("/api/frame")
async def get_unified_frame():
    return pipeline.get_latest_frame()


@app.get("/api/channel/{channel_id}")
async def get_channel_slice(channel_id: str):
    try:
        return pipeline.get_channel_envelope(channel_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/channel/{channel_id}/binary")
async def get_channel_binary(channel_id: str):
    try:
        blob, headers = pipeline.get_channel_binary(channel_id)
        return Response(content=blob, media_type="application/octet-stream", headers=headers)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _build_ws_payload(frame: Dict[str, Any], channel_key: Optional[str]) -> Dict[str, Any]:
    if channel_key is None:
        return frame
    proj = frame.get("projections", {}).get(channel_key)
    return {
        "schema_version": frame["schema_version"],
        "frame_contract_version": frame["frame_contract_version"],
        "channel": channel_key,
        "seq": frame["seq"],
        "step": frame["step"],
        "timestamp": frame["timestamp"],
        "mode": frame["mode"],
        "model_id": frame["model_id"],
        "units": frame["units"],
        "domain_bounds": frame["domain_bounds"],
        "projection": proj,
    }


async def _stream_channel(
    websocket: WebSocket,
    channel_key: Optional[str] = None,
    interval_s: float = 0.05,
) -> None:
    await websocket.accept()
    pipeline.attach_loop(asyncio.get_running_loop())
    queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue(maxsize=8)
    pipeline.register_subscriber(queue)

    try:
        initial_frame = pipeline.get_latest_frame()
        await websocket.send_json(_build_ws_payload(initial_frame, channel_key))

        while True:
            try:
                frame = await asyncio.wait_for(queue.get(), timeout=interval_s)
            except asyncio.TimeoutError:
                frame = pipeline.get_latest_frame()

            await websocket.send_json(_build_ws_payload(frame, channel_key))

            try:
                incoming = await asyncio.wait_for(websocket.receive_json(), timeout=0.001)
                if isinstance(incoming, dict):
                    cmd = incoming.get("type") or incoming.get("action")
                    if cmd == "step":
                        await pipeline.step_async(
                            advance_steps=int(incoming.get("advance_steps", 1)),
                            dt=_finite_float(incoming.get("dt"), 0.05),
                            mode_override=(
                                incoming.get("mode") if incoming.get("mode") in PIPELINE_MODES else None
                            ),
                        )
                    elif cmd == "update_model" and isinstance(incoming.get("model"), dict):
                        req = ModelUpdateRequest(**incoming["model"])
                        await pipeline.update_model_async(req)
            except asyncio.TimeoutError:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        pipeline.unregister_subscriber(queue)


@app.websocket("/ws/telemetry")
async def ws_telemetry(websocket: WebSocket):
    await _stream_channel(websocket, channel_key=None)


@app.websocket("/ws/oscilloscope")
async def ws_oscilloscope(websocket: WebSocket):
    await _stream_channel(websocket, channel_key="CH-01")


@app.websocket("/ws/topology")
async def ws_topology(websocket: WebSocket):
    await _stream_channel(websocket, channel_key="CH-02")


@app.websocket("/ws/matrix")
async def ws_matrix(websocket: WebSocket):
    await _stream_channel(websocket, channel_key="CH-03")


@app.websocket("/ws/phasespace")
async def ws_phasespace(websocket: WebSocket):
    await _stream_channel(websocket, channel_key="CH-04")


@app.websocket("/ws/topology6d")
async def ws_topology6d(websocket: WebSocket):
    await _stream_channel(websocket, channel_key="CH-05")

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HTE_HOST", "0.0.0.0")
    port = int(os.getenv("HTE_PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=False)