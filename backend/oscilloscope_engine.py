"""
backend/oscilloscope_engine.py
Stage 2 State-Coupled Oscilloscope & Time-Series Engine for CH-01.

Derives deterministic step/time series strictly from canonical model state,
evolution history, and explicit units/provenance without random fills or
uncoupled synthetic oscillators.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional


PROVENANCE_STATUSES = ("exact", "reduced_order", "unpopulated", "degenerate")


def _finite_float(val: Any, fallback: Optional[float] = None) -> Optional[float]:
    if isinstance(val, bool) or val is None:
        return fallback
    try:
        f = float(val)
        return f if math.isfinite(f) else fallback
    except (TypeError, ValueError):
        return fallback


def make_provenance(
    status: str,
    source: str,
    missing_inputs: Optional[List[str]] = None,
    notes: str = "",
) -> Dict[str, Any]:
    norm_status = status if status in PROVENANCE_STATUSES else "unpopulated"
    return {
        "status": norm_status,
        "source": source,
        "missing_inputs": list(missing_inputs) if missing_inputs else [],
        "notes": notes,
    }


def _extract_node_phases_and_energies(nodes: List[Dict[str, Any]]) -> tuple[List[float], List[float]]:
    phases: List[float] = []
    energies: List[float] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        ph = _finite_float(node.get("phase"), 0.0)
        if ph is not None:
            phases.append(ph)
        en = _finite_float(node.get("energy"), None)
        if en is not None:
            energies.append(en)
    return phases, energies


def build_oscilloscope_sample(
    model: Dict[str, Any],
    observables: Dict[str, Any],
    dt: float = 0.05,
) -> Dict[str, Any]:
    """
    Build a single state-coupled oscilloscope sample tied directly to the
    canonical model's seq, step, timestamp, phases, couplings, and geometry suite.
    """
    seq = int(model.get("seq", 0))
    step = int(model.get("step", 0))
    timestamp = _finite_float(model.get("timestamp"), 0.0) or 0.0
    dt_val = _finite_float(dt, 0.05) or 0.05
    sim_time = float(step) * dt_val

    nodes = model.get("nodes") if isinstance(model.get("nodes"), list) else []
    edges = model.get("edges") if isinstance(model.get("edges"), list) else []
    phases, energies = _extract_node_phases_and_energies(nodes)

    mean_phase = _finite_float(observables.get("mean_phase_rad"), None)
    coherence_r = _finite_float(observables.get("phase_coherence_r"), None)
    total_coupling = _finite_float(observables.get("total_coupling_weight"), 0.0) or 0.0

    if len(nodes) == 0:
        phase_prov = make_provenance(
            "unpopulated",
            "canonical_model.nodes.phase",
            missing_inputs=["nodes"],
            notes="Canonical model contains zero nodes; phase series unpopulated.",
        )
    else:
        phase_prov = make_provenance(
            "exact",
            "canonical_model.nodes.phase",
            notes="Derived directly from canonical node phases and coupling weights.",
        )

    mean_energy = (sum(energies) / len(energies)) if energies else None
    energy_prov = (
        make_provenance("exact", "canonical_model.nodes.energy")
        if mean_energy is not None
        else make_provenance(
            "unpopulated",
            "canonical_model.nodes.energy",
            missing_inputs=["node.energy"],
            notes="No explicit node energies populated on canonical nodes.",
        )
    )

    metric_block = observables.get("metric_curvature") if isinstance(observables.get("metric_curvature"), dict) else {}
    ricci_scalar = _finite_float(metric_block.get("ricci_scalar"), None)
    metric_prov = (
        metric_block.get("provenance")
        if isinstance(metric_block.get("provenance"), dict)
        else make_provenance("unpopulated", "backend.compute_engine.metric_curvature", ["metric_spec"])
    )

    info_block = observables.get("information_geometry") if isinstance(observables.get("information_geometry"), dict) else {}
    fs_trace = _finite_float(info_block.get("fubini_study_trace"), None)
    info_prov = (
        info_block.get("provenance")
        if isinstance(info_block.get("provenance"), dict)
        else make_provenance("unpopulated", "backend.compute_engine.information_geometry", ["state_manifold_spec"])
    )

    # Per-node phase waveform values (ordered slice for oscilloscope multi-trace inspection)
    node_phase_series = [
        {
            "id": str(n.get("id", f"node_{i}")),
            "phase_rad": _finite_float(n.get("phase"), 0.0),
        }
        for i, n in enumerate(nodes[:32])
        if isinstance(n, dict)
    ]

    return {
        "seq": seq,
        "step": step,
        "timestamp": timestamp,
        "sim_time": sim_time,
        "dt": dt_val,
        "mode": model.get("mode", "live"),
        "node_count": len(nodes),
        "edge_count": len(edges),
        "traces": {
            "mean_phase_rad": {
                "value": mean_phase,
                "unit": model.get("units", {}).get("phase", "rad"),
                "provenance": phase_prov,
            },
            "phase_coherence_r": {
                "value": coherence_r,
                "unit": "dimensionless",
                "provenance": phase_prov,
            },
            "total_coupling_weight": {
                "value": total_coupling,
                "unit": "dimensionless",
                "provenance": make_provenance("exact", "canonical_model.edges.weight"),
            },
            "mean_energy": {
                "value": mean_energy,
                "unit": model.get("units", {}).get("energy", "GeV"),
                "provenance": energy_prov,
            },
            "ricci_scalar": {
                "value": ricci_scalar,
                "unit": "curvature_scalar",
                "provenance": metric_prov,
            },
            "fubini_study_trace": {
                "value": fs_trace,
                "unit": "info_metric_trace",
                "provenance": info_prov,
            },
        },
        "node_phases": node_phase_series,
        "sample_count_phases": len(phases),
    }


def assemble_oscilloscope_projection(
    model: Dict[str, Any],
    observables: Dict[str, Any],
    history: List[Dict[str, Any]],
    dt: float = 0.05,
) -> Dict[str, Any]:
    """
    Package the complete CH-01 oscilloscope payload with explicit axes, units,
    provenance, and bounded history window.
    """
    latest_sample = build_oscilloscope_sample(model, observables, dt=dt)
    bounded_history = list(history[-256:]) if isinstance(history, list) else []

    return {
        "channel": "CH-01",
        "role": "oscilloscope",
        "seq": model.get("seq", 0),
        "step": model.get("step", 0),
        "timestamp": model.get("timestamp", 0.0),
        "mode": model.get("mode", "live"),
        "model_id": model.get("model_id", "unknown"),
        "axes": {
            "x": {"name": "step", "unit": "step"},
            "x_secondary": {"name": "sim_time", "unit": model.get("units", {}).get("time", "fm/c")},
            "y_primary": {"name": "mean_phase_rad", "unit": model.get("units", {}).get("phase", "rad")},
            "y_secondary": {"name": "phase_coherence_r", "unit": "dimensionless"},
        },
        "latest": latest_sample,
        "history": bounded_history,
        "provenance": make_provenance(
            "exact",
            "backend.oscilloscope_engine.assemble_oscilloscope_projection",
            notes="Series reflects canonical model states and step history without synthetic waveform generation.",
        ),
    }