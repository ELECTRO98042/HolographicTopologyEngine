// backend/physics/rendermath/higgsBoson.js
export const HIGGS_BOSON_SPEC = Object.freeze({
  symbol: "H0",
  name: "Higgs Boson",
  pdg_id: 25,
  charge_e: 0,
  spin: 0,
  mass_gev: 125.25,
  vev_gev: 246.22,
});

export function evaluateHiggsBosonState({
  position = [0, 0, 0],
  excitation = 1.0,
  phase = 0,
} = {}) {
  const [x, y, z] = position;
  const r = Math.hypot(x, y, z);
  const scalarField =
    HIGGS_BOSON_SPEC.vev_gev + excitation * Math.exp(-r * r) * Math.cos(phase);
  return {
    particle: "higgs_boson",
    spec: HIGGS_BOSON_SPEC,
    radius: r,
    vev_gev: HIGGS_BOSON_SPEC.vev_gev,
    field_value: scalarField,
  };
}