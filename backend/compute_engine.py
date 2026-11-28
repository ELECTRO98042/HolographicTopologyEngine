"""
backend/compute_engine.py
Stage 2 Physics, Differential Geometry & Information Geometry Engine
for the Holographic Topology Engine.

Uses @jax.jit, jax.vmap, and jax.jacfwd for deterministic metric, connection,
curvature, and Fubini-Study geometry calculations with explicit provenance and
conditioning/singularity guards.
"""

from __future__ import annotations

from functools import lru_cache
import math
from typing import Any, Callable, Dict, List, Optional, Tuple

import jax
import jax.numpy as jnp
import numpy as np

def serialize_coords_to_binary(coords) -> bytes:
    arr = np.asarray(coords, dtype=np.float32)
    arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
    return np.ascontiguousarray(arr).tobytes()

PROVENANCE_STATUSES = ("exact", "reduced_order", "unpopulated", "degenerate")

_X64_INITIALIZED = False


def configure_jax_precision(enable_x64: bool = True) -> bool:
    """Configure JAX 64-bit precision safely when supported by the backend."""
    global _X64_INITIALIZED
    try:
        jax.config.update("jax_enable_x64", bool(enable_x64))
        _X64_INITIALIZED = bool(jax.config.read("jax_enable_x64"))
    except Exception:
        _X64_INITIALIZED = False
    return _X64_INITIALIZED


def _default_dtype() -> Any:
    configure_jax_precision(True)
    if _X64_INITIALIZED:
        return jnp.float64
    return jnp.float32


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


def _to_finite_float(val: Any, fallback: float = 0.0) -> float:
    try:
        f = float(val)
        return f if math.isfinite(f) else float(fallback)
    except (TypeError, ValueError):
        return float(fallback)


def _sanitize_array(arr: np.ndarray, fallback: float = 0.0) -> np.ndarray:
    out = np.asarray(arr, dtype=np.float64)
    return np.nan_to_num(out, nan=fallback, posinf=fallback, neginf=fallback)


# ==============================================================================
# Analytical Metric & State-Manifold Builders (Deterministic, No Random Fills)
# ==============================================================================


def _make_metric_callable(metric_spec: Optional[Dict[str, Any]]) -> Tuple[Optional[Callable[[jnp.ndarray], jnp.ndarray]], int, str, List[str]]:
    """
    Build a JAX-differentiable metric tensor function g(x) -> (dim, dim) from a
    validated metric_spec dictionary.

    Supported metric_spec types:
      - {"type": "euclidean", "dim": d}
      - {"type": "minkowski", "dim": d}
      - {"type": "diagonal", "weights": [...]}  (position-dependent weights optional)
      - {"type": "conformal_spherical", "scale_param": alpha, "r0": r0}
          g_ij(x) = Omega(r)^2 * delta_ij, Omega(r) = 1 + alpha / (r^2 + r0^2)
      - {"type": "ads_poincare", "ell": L, "z_min": z_min}
          ds^2 = (L^2 / z^2) * (dx^2 + dy^2 + dz^2) for coordinates (x, y, z)
      - {"type": "schwarzschild_isotropic", "mass": M}
          g_ij(x) = (1 + M / (2*r))^4 * delta_ij on spatial coords (x, y, z)
    """
    if not isinstance(metric_spec, dict) or not metric_spec:
        return None, 0, "unpopulated", ["metric_spec"]

    mtype = str(metric_spec.get("type", "")).strip().lower()
    if not mtype:
        return None, 0, "unpopulated", ["metric_spec.type"]

    if mtype in ("euclidean", "flat_euclidean"):
        dim = int(metric_spec.get("dim", 3))
        dim = max(1, min(dim, 6))
        dtype = _default_dtype()
        eye = jnp.eye(dim, dtype=dtype)

        def g_flat(_x: jnp.ndarray) -> jnp.ndarray:
            return eye

        return g_flat, dim, "exact", []

    if mtype in ("minkowski", "flat_minkowski"):
        dim = int(metric_spec.get("dim", 4))
        dim = max(2, min(dim, 6))
        dtype = _default_dtype()
        diag_vals = jnp.concatenate([jnp.array([-1.0], dtype=dtype), jnp.ones(dim - 1, dtype=dtype)])
        eta = jnp.diag(diag_vals)

        def g_mink(_x: jnp.ndarray) -> jnp.ndarray:
            return eta

        return g_mink, dim, "exact", []

    if mtype == "diagonal":
        raw_weights = metric_spec.get("weights")
        if not isinstance(raw_weights, list) or len(raw_weights) == 0:
            return None, 0, "unpopulated", ["metric_spec.weights"]
        weights = jnp.asarray([_to_finite_float(w, 1.0) for w in raw_weights[:6]], dtype=_default_dtype())
        dim = int(weights.shape[0])
        diag_mat = jnp.diag(weights)

        def g_diag(_x: jnp.ndarray) -> jnp.ndarray:
            return diag_mat

        return g_diag, dim, "exact", []

    if mtype == "conformal_spherical":
        alpha = _to_finite_float(metric_spec.get("scale_param", metric_spec.get("alpha", 1.0)), 1.0)
        r0 = max(1e-3, abs(_to_finite_float(metric_spec.get("r0", 1.0), 1.0)))
        dim = int(metric_spec.get("dim", 3))
        dim = max(2, min(dim, 6))
        dtype = _default_dtype()
        eye = jnp.eye(dim, dtype=dtype)

        def g_conf(x: jnp.ndarray) -> jnp.ndarray:
            r2 = jnp.dot(x, x)
            omega = 1.0 + alpha / (r2 + r0 * r0)
            return (omega * omega) * eye

        return g_conf, dim, "exact", []

    if mtype == "ads_poincare":
        ell = max(1e-4, abs(_to_finite_float(metric_spec.get("ell", metric_spec.get("L", 1.0)), 1.0)))
        z_floor = max(1e-4, abs(_to_finite_float(metric_spec.get("z_min", 0.25), 0.25)))
        dim = 3
        dtype = _default_dtype()
        eye = jnp.eye(dim, dtype=dtype)

        def g_ads(x: jnp.ndarray) -> jnp.ndarray:
            z = jnp.maximum(jnp.abs(x[2]), z_floor)
            factor = (ell * ell) / (z * z)
            return factor * eye

        return g_ads, dim, "exact", []

    if mtype == "schwarzschild_isotropic":
        mass = max(0.0, _to_finite_float(metric_spec.get("mass", 1.0), 1.0))
        dim = 3
        dtype = _default_dtype()
        eye = jnp.eye(dim, dtype=dtype)

        def g_schw(x: jnp.ndarray) -> jnp.ndarray:
            r = jnp.sqrt(jnp.dot(x, x) + 1e-8)
            psi = 1.0 + 0.5 * mass / r
            return (psi ** 4) * eye

        return g_schw, dim, "exact", []

    return None, 0, "unpopulated", [f"unsupported_metric_type:{mtype}"]


def _make_state_manifold_callable(
    manifold_spec: Optional[Dict[str, Any]],
) -> Tuple[Optional[Callable[[jnp.ndarray], jnp.ndarray]], Optional[jnp.ndarray], str, List[str]]:
    """
    Build a normalized complex state vector |psi(theta)> -> C^n and parameter vector theta -> R^k
    for Fubini-Study / quantum Fisher metric evaluation.

    Supported state_manifold_spec types:
      - {"type": "bloch_qubit", "theta": [polar_theta, azim_phi]}
          |psi(theta, phi)> = cos(theta/2)|0> + exp(i*phi)*sin(theta/2)|1>
      - {"type": "coupled_oscillator_2d", "theta": [g1, g2]}
          Normalized 2-mode coherent/phase state parameterized by couplings (g1, g2).
    """
    if not isinstance(manifold_spec, dict) or not manifold_spec:
        return None, None, "unpopulated", ["state_manifold_spec"]

    stype = str(manifold_spec.get("type", "")).strip().lower()
    raw_theta = manifold_spec.get("theta", manifold_spec.get("parameters"))
    if not isinstance(raw_theta, list) or len(raw_theta) == 0:
        return None, None, "unpopulated", ["state_manifold_spec.theta"]

    theta0 = jnp.asarray([_to_finite_float(v, 0.0) for v in raw_theta[:6]], dtype=_default_dtype())

    if stype == "bloch_qubit":
        if theta0.shape[0] < 2:
            return None, None, "unpopulated", ["state_manifold_spec.theta[0..1]"]

        def psi_bloch(th: jnp.ndarray) -> jnp.ndarray:
            t = th[0]
            p = th[1]
            c = jnp.cos(0.5 * t).astype(jnp.complex128)
            s = (jnp.sin(0.5 * t) * jnp.exp(1j * p)).astype(jnp.complex128)
            vec = jnp.stack([c, s])
            norm = jnp.linalg.norm(vec) + 1e-15
            return vec / norm

        return psi_bloch, theta0[:2], "exact", []

    if stype == "coupled_oscillator_2d":
        if theta0.shape[0] < 2:
            return None, None, "unpopulated", ["state_manifold_spec.theta[0..1]"]

        def psi_osc(th: jnp.ndarray) -> jnp.ndarray:
            g1 = th[0]
            g2 = th[1]
            a0 = jnp.cos(g1).astype(jnp.complex128)
            a1 = (jnp.sin(g1) * jnp.exp(1j * g2)).astype(jnp.complex128)
            a2 = (0.5 * jnp.sin(g1 + g2) * jnp.exp(-1j * g1)).astype(jnp.complex128)
            vec = jnp.stack([a0, a1, a2])
            norm = jnp.linalg.norm(vec) + 1e-15
            return vec / norm

        return psi_osc, theta0[:2], "exact", []

    return None, None, "unpopulated", [f"unsupported_state_manifold_type:{stype}"]


# ==============================================================================
# Core JAX Differential & Information Geometry Kernels
# ==============================================================================


def _build_point_geometry_kernel(g_fn: Callable[[jnp.ndarray], jnp.ndarray], dim: int) -> Callable[[jnp.ndarray], Dict[str, jnp.ndarray]]:
    """
    Construct a single-point JAX kernel using jax.jacfwd to compute:
      - g: (dim, dim)
      - g_inv: (dim, dim)
      - det_g: scalar
      - cond_est: scalar conditioning proxy
      - christoffel: (dim, dim, dim) -> Gamma^lambda_{mu, nu}
      - riemann: (dim, dim, dim, dim) -> R^rho_{sigma, mu, nu}
      - ricci: (dim, dim) -> R_{sigma, nu}
      - ricci_scalar: scalar -> R
    """
    dg_dx_fn = jax.jacfwd(g_fn)

    def christoffel_fn(x: jnp.ndarray) -> jnp.ndarray:
        g = g_fn(x)
        g_inv = jnp.linalg.inv(g)
        # dg[mu, nu, alpha] = d g_{mu, nu} / d x^alpha
        dg = dg_dx_fn(x)
        # term = d_{nu} g_{sigma, mu} + d_{mu} g_{sigma, nu} - d_{sigma} g_{mu, nu}
        # Reorder indices cleanly: dg_s_m_n = dg[sigma, mu, nu]
        dg_s_m_n = dg
        dg_s_n_m = jnp.swapaxes(dg, 1, 2)
        dg_m_n_s = jnp.moveaxis(dg, 2, 0)
        bracket = dg_s_m_n + dg_s_n_m - dg_m_n_s
        # Gamma^lam_{mu, nu} = 0.5 * g_inv^{lam, sigma} * bracket_{sigma, mu, nu}
        return 0.5 * jnp.einsum("ls,smn->lmn", g_inv, bracket)

    dgamma_dx_fn = jax.jacfwd(christoffel_fn)

    def point_kernel(x: jnp.ndarray) -> Dict[str, jnp.ndarray]:
        g = g_fn(x)
        det_g = jnp.linalg.det(g)
        svals = jnp.linalg.svd(g, compute_uv=False)
        min_sv = jnp.maximum(jnp.min(svals), 1e-30)
        max_sv = jnp.max(svals)
        cond_est = max_sv / min_sv

        g_inv = jnp.linalg.inv(g)
        gamma = christoffel_fn(x)
        # dgamma[rho, sigma, mu, alpha] = d Gamma^rho_{sigma, mu} / d x^alpha
        dgamma = dgamma_dx_fn(x)

        # R^rho_{sigma, mu, nu} = d_mu Gamma^rho_{nu, sigma} - d_nu Gamma^rho_{mu, sigma}
        #                       + Gamma^rho_{mu, lam} Gamma^lam_{nu, sigma} - Gamma^rho_{nu, lam} Gamma^lam_{mu, sigma}
        term1 = jnp.einsum("rsnm->rsmn", dgamma)
        term2 = jnp.einsum("rsmn->rsmn", dgamma)
        # Note: dgamma[rho, sigma, mu, nu] has derivative wrt nu in last axis;
        # for d_mu Gamma^rho_{nu, sigma}, swap nu<->sigma and mu<->nu appropriately:
        dgamma_r_n_s_m = jnp.swapaxes(jnp.swapaxes(dgamma, 1, 2), 2, 3)
        dgamma_r_m_s_n = jnp.swapaxes(dgamma, 1, 2)
        quad1 = jnp.einsum("rml,lns->rsmn", gamma, gamma)
        quad2 = jnp.einsum("rnl,lms->rsmn", gamma, gamma)
        riemann = (dgamma_r_n_s_m - dgamma_r_m_s_n) + (quad1 - quad2)

        # Ricci tensor R_{sigma, nu} = R^rho_{sigma, rho, nu}
        ricci = jnp.einsum("rsrn->sn", riemann)
        # Ricci scalar R = g^{sigma, nu} R_{sigma, nu}
        ricci_scalar = jnp.einsum("sn,sn->", g_inv, ricci)

        return {
            "g": g,
            "g_inv": g_inv,
            "det_g": det_g,
            "cond_est": cond_est,
            "christoffel": gamma,
            "riemann": riemann,
            "ricci": ricci,
            "ricci_scalar": ricci_scalar,
        }

    return point_kernel


@lru_cache(maxsize=32)
def _cached_fubini_study_jit(manifold_kind: str) -> Callable[[jnp.ndarray], Tuple[jnp.ndarray, jnp.ndarray]]:
    """
    Compile a Fubini-Study metric evaluator g^{FS}_{ij}(theta) using JAX forward/reverse
    derivatives of a normalized complex state vector |psi(theta)>.
    """
    if manifold_kind == "bloch_qubit":
        def psi_fn(th: jnp.ndarray) -> jnp.ndarray:
            t = th[0]
            p = th[1]
            c = jnp.cos(0.5 * t).astype(jnp.complex128)
            s = (jnp.sin(0.5 * t) * jnp.exp(1j * p)).astype(jnp.complex128)
            vec = jnp.stack([c, s])
            return vec / (jnp.linalg.norm(vec) + 1e-15)
    else:
        def psi_fn(th: jnp.ndarray) -> jnp.ndarray:
            g1 = th[0]
            g2 = th[1]
            a0 = jnp.cos(g1).astype(jnp.complex128)
            a1 = (jnp.sin(g1) * jnp.exp(1j * g2)).astype(jnp.complex128)
            a2 = (0.5 * jnp.sin(g1 + g2) * jnp.exp(-1j * g1)).astype(jnp.complex128)
            vec = jnp.stack([a0, a1, a2])
            return vec / (jnp.linalg.norm(vec) + 1e-15)

    # dpsi[k, i] = d psi_k / d theta_i
    jac_psi_fn = jax.jacfwd(psi_fn)

    @jax.jit
    def fs_kernel(theta: jnp.ndarray) -> Tuple[jnp.ndarray, jnp.ndarray]:
        psi = psi_fn(theta)           # (n,)
        dpsi = jac_psi_fn(theta)      # (n, p)
        # <d_i psi | d_j psi> = sum_k conj(dpsi[k, i]) * dpsi[k, j]
        overlap_deriv = jnp.einsum("ki,kj->ij", jnp.conj(dpsi), dpsi)
        # <d_i psi | psi> = sum_k conj(dpsi[k, i]) * psi[k]
        dpsi_psi = jnp.einsum("ki,k->i", jnp.conj(dpsi), psi)
        # <psi | d_j psi> = sum_k conj(psi[k]) * dpsi[k, j]
        psi_dpsi = jnp.einsum("k,kj->j", jnp.conj(psi), dpsi)
        qgt = overlap_deriv - jnp.outer(dpsi_psi, psi_dpsi)
        g_fs = jnp.real(qgt)
        trace_val = jnp.trace(g_fs)
        return g_fs, trace_val

    return fs_kernel


# ==============================================================================
# Public Compute Engine API Called by main.py
# ==============================================================================


def evaluate_differential_geometry(
    metric_spec: Optional[Dict[str, Any]],
    sample_points: Optional[List[List[float]]] = None,
    cond_threshold: float = 1e8,
) -> Dict[str, Any]:
    """
    Evaluate metric, Christoffel symbols, Riemann/Ricci tensors, and Ricci scalar
    over a batch of coordinate points using jax.vmap and @jax.jit.
    """
    g_fn, dim, init_status, missing = _make_metric_callable(metric_spec)
    if g_fn is None or dim <= 0:
        return {
            "status": "unpopulated",
            "dim": 0,
            "ricci_scalar_mean": None,
            "ricci_scalar_samples": [],
            "christoffel_norm": None,
            "max_condition_number": None,
            "provenance": make_provenance(
                "unpopulated",
                "backend.compute_engine.evaluate_differential_geometry",
                missing_inputs=missing,
                notes="No valid metric_spec provided; differential geometry not evaluated.",
            ),
        }

    dtype = _default_dtype()
    if sample_points and len(sample_points) > 0:
        pts_list = []
        for row in sample_points:
            if isinstance(row, (list, tuple)) and len(row) >= dim:
                pts_list.append([_to_finite_float(row[i], 0.0) for i in range(dim)])
        if not pts_list:
            pts_list = [[0.5 * (i + 1) for i in range(dim)]]
    else:
        pts_list = [[0.5 * (i + 1) for i in range(dim)]]

    pts_arr = jnp.asarray(pts_list, dtype=dtype)
    point_kernel = _build_point_geometry_kernel(g_fn, dim)
    batched_kernel = jax.jit(jax.vmap(point_kernel, in_axes=0))

    try:
        res = batched_kernel(pts_arr)
        det_np = _sanitize_array(np.asarray(res["det_g"]), fallback=0.0)
        cond_np = _sanitize_array(np.asarray(res["cond_est"]), fallback=math.inf)
        gamma_np = _sanitize_array(np.asarray(res["christoffel"]), fallback=0.0)
        ricci_np = _sanitize_array(np.asarray(res["ricci"]), fallback=0.0)
        scalar_np = _sanitize_array(np.asarray(res["ricci_scalar"]), fallback=0.0)

        min_abs_det = float(np.min(np.abs(det_np))) if det_np.size > 0 else 0.0
        max_cond = float(np.max(cond_np)) if cond_np.size > 0 else math.inf

        if min_abs_det < 1e-12 or not math.isfinite(max_cond) or max_cond > cond_threshold:
            return {
                "status": "degenerate",
                "dim": dim,
                "ricci_scalar_mean": None,
                "ricci_scalar_samples": [],
                "christoffel_norm": None,
                "max_condition_number": max_cond if math.isfinite(max_cond) else None,
                "min_abs_det_g": min_abs_det,
                "provenance": make_provenance(
                    "degenerate",
                    "backend.compute_engine.evaluate_differential_geometry",
                    notes=f"Metric near-singular or ill-conditioned (min|det(g)|={min_abs_det:.3e}, max_cond={max_cond:.3e}).",
                ),
            }

        scalar_mean = float(np.mean(scalar_np))
        gamma_norm = float(np.linalg.norm(gamma_np))
        ricci_norm = float(np.linalg.norm(ricci_np))

        return {
            "status": init_status,
            "dim": dim,
            "ricci_scalar_mean": scalar_mean if math.isfinite(scalar_mean) else None,
            "ricci_scalar_samples": [float(v) for v in scalar_np.tolist() if math.isfinite(float(v))],
            "christoffel_norm": gamma_norm if math.isfinite(gamma_norm) else None,
            "ricci_tensor_norm": ricci_norm if math.isfinite(ricci_norm) else None,
            "max_condition_number": max_cond,
            "min_abs_det_g": min_abs_det,
            "provenance": make_provenance(
                init_status,
                "backend.compute_engine.evaluate_differential_geometry",
                notes=f"Evaluated via JAX jacfwd+vmap across {pts_arr.shape[0]} sample point(s) in {dim}D.",
            ),
        }
    except Exception as exc:
        return {
            "status": "degenerate",
            "dim": dim,
            "ricci_scalar_mean": None,
            "ricci_scalar_samples": [],
            "christoffel_norm": None,
            "max_condition_number": None,
            "provenance": make_provenance(
                "degenerate",
                "backend.compute_engine.evaluate_differential_geometry",
                notes=f"Differential geometry evaluation encountered numerical/runtime guard: {exc}",
            ),
        }


def evaluate_fubini_study_geometry(manifold_spec: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Evaluate Fubini-Study metric tensor g^{FS}_{ij}(theta) and trace for a
    parameterized quantum/state manifold when specified.
    """
    _, theta0, status, missing = _make_state_manifold_callable(manifold_spec)
    if theta0 is None:
        return {
            "status": "unpopulated",
            "fubini_study_metric": None,
            "fubini_study_trace": None,
            "provenance": make_provenance(
                "unpopulated",
                "backend.compute_engine.evaluate_fubini_study_geometry",
                missing_inputs=missing,
                notes="No state_manifold_spec provided; Fubini-Study metric unpopulated.",
            ),
        }

    stype = str(manifold_spec.get("type", "bloch_qubit")).strip().lower() if isinstance(manifold_spec, dict) else "bloch_qubit"
    kernel = _cached_fubini_study_jit(stype)

    try:
        g_fs_jax, tr_jax = kernel(theta0)
        g_fs_np = _sanitize_array(np.asarray(g_fs_jax), fallback=0.0)
        tr_val = _to_finite_float(np.asarray(tr_jax).item(), 0.0)

        return {
            "status": status,
            "manifold_type": stype,
            "theta": [float(v) for v in np.asarray(theta0).tolist()],
            "fubini_study_metric": g_fs_np.tolist(),
            "fubini_study_trace": tr_val,
            "provenance": make_provenance(
                status,
                "backend.compute_engine.evaluate_fubini_study_geometry",
                notes=f"Evaluated Fubini-Study metric via JAX for manifold '{stype}'.",
            ),
        }
    except Exception as exc:
        return {
            "status": "degenerate",
            "fubini_study_metric": None,
            "fubini_study_trace": None,
            "provenance": make_provenance(
                "degenerate",
                "backend.compute_engine.evaluate_fubini_study_geometry",
                notes=f"Fubini-Study evaluation guard triggered: {exc}",
            ),
        }


def compute_model_geometry_suite(canonical_model: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run differential geometry and Fubini-Study geometry for a canonical model dict
    and return structured observables + provenance blocks for main.py.
    """
    nodes = canonical_model.get("nodes") if isinstance(canonical_model, dict) else []
    sample_pts: List[List[float]] = []
    if isinstance(nodes, list):
        for n in nodes[:32]:
            if isinstance(n, dict) and isinstance(n.get("position"), list):
                sample_pts.append(n["position"])

    diff_geo = evaluate_differential_geometry(
        canonical_model.get("metric_spec") if isinstance(canonical_model, dict) else None,
        sample_points=sample_pts if sample_pts else None,
    )
    info_geo = evaluate_fubini_study_geometry(
        canonical_model.get("state_manifold_spec") if isinstance(canonical_model, dict) else None,
    )

    return {
        "metric_curvature": {
            "ricci_scalar": diff_geo.get("ricci_scalar_mean"),
            "christoffel_norm": diff_geo.get("christoffel_norm"),
            "ricci_tensor_norm": diff_geo.get("ricci_tensor_norm"),
            "max_condition_number": diff_geo.get("max_condition_number"),
            "dim": diff_geo.get("dim", 0),
            "provenance": diff_geo["provenance"],
        },
        "information_geometry": {
            "fubini_study_trace": info_geo.get("fubini_study_trace"),
            "fubini_study_metric": info_geo.get("fubini_study_metric"),
            "provenance": info_geo["provenance"],
        },
    }