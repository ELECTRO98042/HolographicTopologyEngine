// backend/physics/rendermath/muon.js
export const MUON_SPEC = Object.freeze({
  symbol: "mu",
  name: "Muon",
  pdg_id: 13,
  generation: 2,
  spin: 0.5,
  lepton_number: 1,
  mass_gev: 0.1056583755,
  mean_lifetime_s: 2.1969811e-6,
  anomalous_magnetic_moment_a_mu: 0.00116592059,
});

export function evaluateMuonState({
  chargeSign = -1, // -1 for mu-, +1 for mu+
  position = [0, 0, 0],
  momentum = [0, 0, 0],
  phase = 0,
} = {}) {
  const sign = chargeSign > 0 ? 1 : -1;
  const [x, y, z] = position;
  const [px, py, pz] = momentum;
  const pMag = Math.hypot(px, py, pz);
  const energyGeV = Math.hypot(pMag, MUON_SPEC.mass_gev);
  const gamma = energyGeV / MUON_SPEC.mass_gev;

  return {
    particle: "muon",
    symbol: sign < 0 ? "mu-" : "mu+",
    pdg_id: sign < 0 ? 13 : -13,
    charge_e: sign,
    spin: MUON_SPEC.spin,
    mass_gev: MUON_SPEC.mass_gev,
    lorentz_gamma: gamma,
    energy_gev: energyGeV,
    position_radius: Math.hypot(x, y, z),
    spin_phase: phase + 0.5 * MUON_SPEC.anomalous_magnetic_moment_a_mu * gamma,
  };
}