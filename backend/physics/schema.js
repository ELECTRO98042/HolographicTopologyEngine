/**
 * backend/physics/schema.js
 * Canonical research model schema, provenance/validity states, and multi-channel
 * projection helpers for Holographic Topology Engine.
 */

export const SCHEMA_VERSION = "1.0.0";

export const PIPELINE_MODES = Object.freeze({
  LIVE: "live",
  BENCHMARK_SYNTHETIC: "benchmark/synthetic",
});

export const PROVENANCE_STATUS = Object.freeze({
  EXACT: "exact",
  REDUCED_ORDER: "reduced_order",
  UNPOPULATED: "unpopulated",
  DEGENERATE: "degenerate",
});

export const CHANNEL_IDS = Object.freeze({
  HUD: "HUD",
  CH_01: "CH-01", // Oscilloscope / time-step series
  CH_02: "CH-02", // 3D Topological Lattice
  CH_03: "CH-03", // Matrix / Tensor view
  CH_04: "CH-04", // Phase Space view
  CH_05: "CH-05", // 6D Holographic Topology view
});

export const CH05_DEFAULT_AXES = Object.freeze([
  { index: 0, name: "x", label: "Position X", unit: "m" },
  { index: 1, name: "y", label: "Position Y", unit: "m" },
  { index: 2, name: "z", label: "Position Z", unit: "m" },
  { index: 3, name: "px", label: "Momentum / State Axis 3", unit: "GeV/c" },
  { index: 4, name: "py", label: "Momentum / State Axis 4", unit: "GeV/c" },
  { index: 5, name: "pz_or_phase", label: "Momentum Z / Phase Axis 5", unit: "GeV/c or rad" },
]);

export function isFiniteNumber(val) {
  return typeof val === "number" && Number.isFinite(val);
}

export function sanitizeVec3(vec, fallback = [0, 0, 0]) {
  if (!Array.isArray(vec) || vec.length < 3) {
    return [...fallback];
  }
  return [
    isFiniteNumber(vec[0]) ? vec[0] : fallback[0],
    isFiniteNumber(vec[1]) ? vec[1] : fallback[1],
    isFiniteNumber(vec[2]) ? vec[2] : fallback[2],
  ];
}

export function createProvenance(
  status = PROVENANCE_STATUS.UNPOPULATED,
  source = "canonical_model",
  missingInputs = [],
  notes = ""
) {
  return {
    status,
    source,
    missing_inputs: Array.isArray(missingInputs) ? [...missingInputs] : [],
    notes: typeof notes === "string" ? notes : "",
  };
}

export function createCanonicalModel({
  modelId = "untitled_model",
  title = "Untitled Research Model",
  mode = PIPELINE_MODES.LIVE,
  seq = 0,
  step = 0,
  timestamp = Date.now() / 1000,
  referenceFrame = "lab_inertial",
  units = {
    length: "fm",
    energy: "GeV",
    momentum: "GeV/c",
    mass: "GeV/c^2",
    charge: "e",
    time: "fm/c",
    phase: "rad",
  },
  domainBounds = {
    x: [-10, 10],
    y: [-10, 10],
    z: [-10, 10],
  },
  nodes = [],
  edges = [],
  metricSpec = null,
  stateManifoldSpec = null,
  extensions = {},
} = {}) {
  const normalizedNodes = Array.isArray(nodes)
    ? nodes.map((node, idx) => normalizeNode(node, idx))
    : [];
  const nodeIdSet = new Set(normalizedNodes.map((n) => n.id));
  const normalizedEdges = Array.isArray(edges)
    ? edges
        .map((edge, idx) => normalizeEdge(edge, idx))
        .filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
    : [];

  return {
    schema_version: SCHEMA_VERSION,
    model_id: String(modelId),
    title: String(title),
    mode:
      mode === PIPELINE_MODES.BENCHMARK_SYNTHETIC
        ? PIPELINE_MODES.BENCHMARK_SYNTHETIC
        : PIPELINE_MODES.LIVE,
    seq: Number.isInteger(seq) && seq >= 0 ? seq : 0,
    step: Number.isInteger(step) && step >= 0 ? step : 0,
    timestamp: isFiniteNumber(timestamp) ? timestamp : Date.now() / 1000,
    reference_frame: String(referenceFrame),
    units: { ...units },
    domain_bounds: {
      x: sanitizeBounds(domainBounds?.x, [-10, 10]),
      y: sanitizeBounds(domainBounds?.y, [-10, 10]),
      z: sanitizeBounds(domainBounds?.z, [-10, 10]),
    },
    nodes: normalizedNodes,
    edges: normalizedEdges,
    metric_spec: metricSpec && typeof metricSpec === "object" ? { ...metricSpec } : null,
    state_manifold_spec:
      stateManifoldSpec && typeof stateManifoldSpec === "object"
        ? { ...stateManifoldSpec }
        : null,
    extensions: extensions && typeof extensions === "object" ? { ...extensions } : {},
  };
}

export function sanitizeBounds(pair, fallback = [-10, 10]) {
  if (!Array.isArray(pair) || pair.length < 2) return [...fallback];
  const a = isFiniteNumber(pair[0]) ? pair[0] : fallback[0];
  const b = isFiniteNumber(pair[1]) ? pair[1] : fallback[1];
  return a <= b ? [a, b] : [b, a];
}

export function normalizeNode(raw, index = 0) {
  const id = raw?.id !== undefined && raw?.id !== null ? String(raw.id) : `node_${index}`;
  const quantum = raw?.quantum || raw?.attributes?.quantum || {};
  return {
    id,
    label: String(raw?.label ?? id),
    species: String(raw?.species ?? raw?.particle ?? "generic_entity"),
    pdg_id: isFiniteNumber(raw?.pdg_id) ? raw.pdg_id : null,
    tier: String(raw?.tier ?? "BULK_CORE"),
    flags: {
      is_core: Boolean(raw?.flags?.is_core ?? raw?.isCore ?? false),
      is_severed: Boolean(raw?.flags?.is_severed ?? raw?.isSevered ?? false),
      pinned: Boolean(raw?.flags?.pinned ?? false),
    },
    position: sanitizeVec3(
      raw?.position ?? [raw?.x, raw?.y, raw?.z],
      [0, 0, 0]
    ),
    momentum:
      Array.isArray(raw?.momentum) || Array.isArray(raw?.velocity)
        ? sanitizeVec3(raw?.momentum ?? raw?.velocity, [0, 0, 0])
        : null,
    energy: isFiniteNumber(raw?.energy) ? raw.energy : null,
    mass: isFiniteNumber(raw?.mass) ? raw.mass : null,
    charge: isFiniteNumber(raw?.charge) ? raw.charge : null,
    spin: isFiniteNumber(raw?.spin) ? raw.spin : null,
    phase: isFiniteNumber(raw?.phase) ? raw.phase : 0.0,
    quantum: {
      color_charge: quantum.color_charge ?? null,
      isospin: isFiniteNumber(quantum.isospin) ? quantum.isospin : null,
      hypercharge: isFiniteNumber(quantum.hypercharge) ? quantum.hypercharge : null,
      baryon_number: isFiniteNumber(quantum.baryon_number) ? quantum.baryon_number : null,
      lepton_number: isFiniteNumber(quantum.lepton_number) ? quantum.lepton_number : null,
      parity: quantum.parity ?? null,
    },
    extensions:
      raw?.extensions && typeof raw.extensions === "object"
        ? { ...raw.extensions }
        : {},
  };
}

export function normalizeEdge(raw, index = 0) {
  return {
    id: raw?.id !== undefined && raw?.id !== null ? String(raw.id) : `edge_${index}`,
    source: String(raw?.source),
    target: String(raw?.target),
    interaction: String(raw?.interaction ?? raw?.type ?? "coupling"),
    weight: isFiniteNumber(raw?.weight)
      ? raw.weight
      : isFiniteNumber(raw?.strength)
      ? raw.strength
      : 1.0,
    phase: isFiniteNumber(raw?.phase) ? raw.phase : 0.0,
    extensions:
      raw?.extensions && typeof raw.extensions === "object"
        ? { ...raw.extensions }
        : {},
  };
}