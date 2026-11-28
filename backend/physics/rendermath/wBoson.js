// backend/physics/rendermath/wBoson.js
export const W_BOSON_SPEC = Object.freeze({
  symbol: "W",
  name: "W Boson",
  pdg_id: 24,
  spin: 1,
  mass_gev: 80.3692,
  width_gev: 2.085,
});

export function evaluateWBosonState({
  chargeSign = 1, // +1 for W+, -1 for W-
  position = [0, 0, 0],
  phase = 0,
} = {}) {
  const sign = chargeSign < 0 ? -1 : 1;
  const [x, y, z] = position;
  const r = Math.hypot(x, y, z);
  // Short-range Yukawa-like decay envelope scaled by electroweak scale
  const envelope = Math.exp(-r / 0.00246); // ~1 / M_W in natural/fm-scaled units
  return {
    particle: "w_boson",
    symbol: sign > 0 ? "W+" : "W-",
    pdg_id: sign > 0 ? 24 : -24,
    charge_e: sign,
    spin: W_BOSON_SPEC.spin,
    mass_gev: W_BOSON_SPEC.mass_gev,
    radius: r,
    amplitude: envelope,
    phase_value: sign * (phase + r),
  };
}