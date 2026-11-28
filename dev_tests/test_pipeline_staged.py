"""
test_pipeline_staged.py
Sequential bring-up and dependency verification across Phases 1 through 5
for the Holographic Topology Engine pipeline.
"""

from __future__ import annotations

from pathlib import Path
import sys
from typing import Any, Dict, List

from fastapi.testclient import TestClient
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
for p in (str(ROOT), str(BACKEND_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

import backend.main as hte_main

from backend.compute_engine import (
    compute_model_geometry_suite,
    evaluate_differential_geometry,
    evaluate_fubini_study_geometry,
    serialize_coords_to_binary,
)
from backend.oscilloscope_engine import (
    assemble_oscilloscope_projection,
    build_oscilloscope_sample,
)


# ==============================================================================
# Phase 1: Schema, Particle Registry & Static Symbol Audit
# ==============================================================================


def test_phase1_schema_and_particle_modules_present():
    """Verify canonical schema and expanded particle modules exist on disk."""
    expected_files = [
        ROOT / "backend" / "physics" / "schema.js",
        ROOT / "backend" / "physics" / "reference_frames.js",
        ROOT / "backend" / "physics" / "rendermath" / "index.js",
        ROOT / "backend" / "physics" / "rendermath" / "quark.js",
        ROOT / "backend" / "physics" / "rendermath" / "gluon.js",
        ROOT / "backend" / "physics" / "rendermath" / "wBoson.js",
        ROOT / "backend" / "physics" / "rendermath" / "zBoson.js",
        ROOT / "backend" / "physics" / "rendermath" / "higgsBoson.js",
        ROOT / "backend" / "physics" / "rendermath" / "muon.js",
        ROOT / "backend" / "physics" / "rendermath" / "tau.js",
        ROOT / "backend" / "physics" / "rendermath" / "hadron.js",
    ]
    missing = [str(p.relative_to(ROOT)) for p in expected_files if not p.exists()]
    assert not missing, f"Missing expected physics modules: {missing}"


def test_phase1_static_legacy_symbol_audit():
    """Audit active backend/JS files for removed compute/oscilloscope symbols and random fills."""
    forbidden_backend_tokens = [
        "compute_advanced_tensors",
        "compute_topology_metrics",
        "optimized_step_telemetry",
        "oscilloscope_websocket_endpoint",
        "np.random.uniform",
        "np.random.normal",
    ]
    backend_targets = [
        ROOT / "backend" / "compute_engine.py",
        ROOT / "backend" / "oscilloscope_engine.py",
        ROOT / "backend" / "routers" / "websocket_telemetry.py",
        ROOT / "backend" / "routes" / "test_suite_routes.py",
    ]
    for path in backend_targets:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for token in forbidden_backend_tokens:
            assert token not in text, f"Found deprecated/forbidden token '{token}' in {path.name}"

    js_targets = [
        ROOT / "backend" / "js" / "telemetryStream.js",
        ROOT / "backend" / "js" / "controlDeck.js",
        ROOT / "backend" / "js" / "channelAlignment.js",
    ]
    for path in js_targets:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        assert "hasHudModel" not in text, f"Found stale freeze guard 'hasHudModel' in {path.name}"
        assert "Math.random" not in text, f"Found random fill 'Math.random' in {path.name}"


# ==============================================================================
# Phase 2: Physics & Oscilloscope Compute Engines
# ==============================================================================


def test_phase2_compute_engine_provenance_and_kernels():
    """Verify unpopulated, exact JAX differential/Fubini-Study, and degenerate metric handling."""
    # 1. Unpopulated inputs must not fake 0.0 curvature or entropy
    empty_diff = evaluate_differential_geometry(None)
    assert empty_diff["provenance"]["status"] == "unpopulated"
    assert empty_diff["ricci_scalar_mean"] is None

    empty_fs = evaluate_fubini_study_geometry(None)
    assert empty_fs["provenance"]["status"] == "unpopulated"
    assert empty_fs["fubini_study_trace"] is None

    # 2. Exact AdS Poincare metric + Bloch qubit manifold via JAX
    ads_res = evaluate_differential_geometry(
        {"type": "ads_poincare", "ell": 1.0, "z_min": 0.5},
        sample_points=[[0.0, 0.0, 1.0], [0.2, -0.1, 1.5]],
    )
    assert ads_res["provenance"]["status"] == "exact"
    assert ads_res["ricci_scalar_mean"] is not None
    assert np.isfinite(ads_res["ricci_scalar_mean"])

    fs_res = evaluate_fubini_study_geometry(
        {"type": "bloch_qubit", "theta": [0.7, 1.2]}
    )
    assert fs_res["provenance"]["status"] == "exact"
    assert fs_res["fubini_study_trace"] is not None
    assert np.isfinite(fs_res["fubini_study_trace"])

    # 3. Degenerate metric guard (zero diagonal weight -> singular metric)
    deg_res = evaluate_differential_geometry(
        {"type": "diagonal", "weights": [0.0, 1.0, 1.0]},
        sample_points=[[1.0, 1.0, 1.0]],
    )
    assert deg_res["provenance"]["status"] == "degenerate"
    assert deg_res["ricci_scalar_mean"] is None

    # 4. Binary serializer sanitizes NaN/Inf and produces contiguous float32 bytes
    raw_coords = np.array([[1.0, np.nan, 3.0], [np.inf, -2.0, 0.5]], dtype=np.float32)
    packed = serialize_coords_to_binary(raw_coords)
    unpacked = np.frombuffer(packed, dtype=np.float32)
    assert unpacked.size == 6
    assert np.all(np.isfinite(unpacked))


def test_phase2_oscilloscope_engine_coupled_to_model():
    """Verify CH-01 sample & projection couple directly to canonical model state and step."""
    model = hte_main.build_default_canonical_model()
    model["step"] = 4
    model["seq"] = 9
    suite = compute_model_geometry_suite(model)
    obs = {
        "mean_phase_rad": 0.5,
        "phase_coherence_r": 0.85,
        "total_coupling_weight": 12.0,
        "metric_curvature": suite["metric_curvature"],
        "information_geometry": suite["information_geometry"],
    }
    sample = build_oscilloscope_sample(model, obs, dt=0.05)
    assert sample["step"] == 4
    assert sample["seq"] == 9
    assert np.isclose(sample["sim_time"], 0.2)
    assert sample["traces"]["ricci_scalar"]["provenance"]["status"] == "unpopulated"

    proj = assemble_oscilloscope_projection(model, obs, [sample], dt=0.05)
    assert proj["channel"] == "CH-01"
    assert proj["latest"]["step"] == 4
    assert len(proj["history"]) == 1


# ==============================================================================
# Phase 3: Single-Source-of-Truth Authority, Endpoints & WebSockets
# ==============================================================================


def test_phase3_api_authority_seq_and_channels():
    """Verify health, frame, model update, compute stepping, provenance transitions, and WS fan-out."""
    with TestClient(hte_main.app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        h_json = health.json()
        assert h_json["authority"] == "main.py"
        seq_start = h_json["seq"]

        # Update model with metric_spec & state_manifold_spec + invalid edge endpoint
        model_resp = client.post(
            "/api/telemetry/model",
            json={
                "model_id": "verify_ads_bloch",
                "title": "AdS + Bloch Verification Model",
                "mode": "live",
                "nodes": [
                    {"id": "n0", "position": [0.0, 0.0, 1.0], "momentum": [0.1, 0.0, 0.0], "phase": 0.2},
                    {"id": "n1", "position": [1.0, 0.0, 1.0], "momentum": [-0.1, 0.0, 0.0], "phase": 0.4},
                ],
                "edges": [
                    {"id": "e_valid", "source": "n0", "target": "n1", "weight": 1.5},
                    {"id": "e_dangling", "source": "n0", "target": "nonexistent", "weight": 9.0},
                ],
                "metric_spec": {"type": "ads_poincare", "ell": 1.0, "z_min": 0.5},
                "state_manifold_spec": {"type": "bloch_qubit", "theta": [0.8, 0.5]},
            },
        )
        assert model_resp.status_code == 200
        m_json = model_resp.json()
        assert m_json["seq"] > seq_start
        assert len(m_json["model"]["edges"]) == 1
        assert m_json["frame"]["observables"]["metric_curvature"]["provenance"]["status"] == "exact"
        assert m_json["frame"]["observables"]["information_geometry"]["provenance"]["status"] == "exact"

        # Step compute forward and verify step & seq increment
        step_resp = client.post(
            "/api/compute",
            json={"advance_steps": 3, "dt": 0.05, "grid_size": 16},
        )
        assert step_resp.status_code == 200
        s_json = step_resp.json()
        assert s_json["seq"] > m_json["seq"]
        assert s_json["step"] == m_json["step"] + 3

        # Check all channel slices CH-01..CH-05
        for ch in ("CH-01", "CH-02", "CH-03", "CH-04", "CH-05"):
            ch_resp = client.get(f"/api/channel/{ch}")
            assert ch_resp.status_code == 200
            ch_data = ch_resp.json()
            assert ch_data["seq"] == s_json["seq"]
            assert ch_data["step"] == s_json["step"]

        # Check benchmark/synthetic mode tagging isolation
        bench_resp = client.post(
            "/api/compute",
            json={"advance_steps": 1, "dt": 0.05, "mode": "benchmark/synthetic"},
        )
        assert bench_resp.status_code == 200
        assert bench_resp.json()["mode"] == "benchmark/synthetic"

        # Restore live baseline for subsequent checks
        client.post(
            "/api/telemetry/model",
            json={
                "model_id": "ring_12_baseline",
                "title": "12-Node Ring Topology Baseline",
                "mode": "live",
                "step": 0,
                "nodes": hte_main.build_default_canonical_model()["nodes"],
                "edges": hte_main.build_default_canonical_model()["edges"],
                "metric_spec": None,
                "state_manifold_spec": None,
            },
        )

        # Verify WebSocket stream delivers matching seq frame
        with client.websocket_connect("/ws/telemetry") as ws:
            ws_msg = ws.receive_json()
            assert "seq" in ws_msg
            assert "projections" in ws_msg
            assert set(["HUD", "CH-01", "CH-02", "CH-03", "CH-04", "CH-05"]).issubset(
                ws_msg["projections"].keys()
            )


# ==============================================================================
# Phases 4 & 5: JS Layer Contracts & Full End-to-End Smoke Runner
# ==============================================================================


def test_phases4_and_5_js_modules_exist():
    """Confirm Stage 3 & Stage 4 JS modules are in place for HUD and channel alignment."""
    for rel in (
        "backend/js/telemetryStream.js",
        "backend/js/controlDeck.js",
        "backend/js/channelAlignment.js",
    ):
        assert (ROOT / rel).exists(), f"Missing frontend module: {rel}"


def run_all() -> List[str]:
    checks = [
        test_phase1_schema_and_particle_modules_present,
        test_phase1_static_legacy_symbol_audit,
        test_phase2_compute_engine_provenance_and_kernels,
        test_phase2_oscilloscope_engine_coupled_to_model,
        test_phase3_api_authority_seq_and_channels,
        test_phases4_and_5_js_modules_exist,
    ]
    completed: List[str] = []
    for fn in checks:
        fn()
        completed.append(fn.__name__)
    return completed


if __name__ == "__main__":
    executed = run_all()
    print(f"All {len(executed)} staged verification checks passed:")
    for name in executed:
        print(f"  - {name}")