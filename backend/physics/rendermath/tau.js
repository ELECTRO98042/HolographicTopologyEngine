// backend/physics/rendermath/tau.js
export const TAU_SPEC = Object.freeze({
  symbol: "tau",
  name: "Tau Lepton",
  pdg_id: 15,
  generation: 3,
  spin: 0.5,
  lepton_number: 1,
  mass_gev: 1.77686,
  mean_lifetime_s: 2.903e-13,
});

export function evaluateTauState({
  chargeSign = -1,
  position = [0, 0, 0],
  momentum = [0, 0, 0],
  phase = 0,
} = {}) {
  const sign = chargeSign > 0 ? 1 : -1;
  const pMag = Math.hypot(momentum[0] ?? 0, momentum[1] ?? 0, momentum[2] ?? 0);
  const energyGeV = Math.hypot(pMag, TAU_SPEC.mass_gev);
  return {
    particle: "tau",
    symbol: sign < 0 ? "tau-" : "tau+",
    pdg_id: sign < 0 ? 15 : -15,
    charge_e: sign,
    spin: TAU_SPEC.spin,
    mass_gev: TAU_SPEC.mass_gev,
    energy_gev: energyGeV,
    lorentz_gamma: energyGeV / TAU_SPEC.mass_gev,
    phase,
  };
}