export const GLUON_SPEC = Object.freeze({
  symbol: "g",
  name: "Gluon",
  pdg_id: 21,
  charge_e: 0,
  spin: 1,
  mass_gev: 0.0,
  color_representation: "octet_8",
});

export const GLUON_BASIS_STATES = Object.freeze([
  "r_bbar",
  "r_gbar",
  "g_rbar",
  "g_bbar",
  "b_rbar",
  "b_gbar",
  "diag_3",
  "diag_8",
]);

export function evaluateGluonFlux({
  basisIndex = 0,
  position = [0, 0, 0],
  couplingAlphaS = 0.118,
  phase = 0,
} = {}) {
  const idx = Math.abs(Math.trunc(basisIndex)) % GLUON_BASIS_STATES.length;
  const [x, y, z] = position;
  const r = Math.hypot(x, y, z);
  const fluxTubeFactor = Math.exp(-0.25 * r * r);
  const angle = phase + (idx * Math.PI) / 4;

  return {
    particle: "gluon",
    spec: GLUON_SPEC,
    basis_state: GLUON_BASIS_STATES[idx],
    alpha_s: couplingAlphaS,
    radius: r,
    field_strength_proxy: couplingAlphaS * fluxTubeFactor,
    vector_component: {
      x: couplingAlphaS * fluxTubeFactor * Math.cos(angle),
      y: couplingAlphaS * fluxTubeFactor * Math.sin(angle),
      z: couplingAlphaS * fluxTubeFactor * Math.cos(r + phase),
    },
  };
}