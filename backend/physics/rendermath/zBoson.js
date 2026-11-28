// backend/physics/rendermath/zBoson.js
export const Z_BOSON_SPEC = Object.freeze({
  symbol: "Z0",
  name: "Z Boson",
  pdg_id: 23,
  charge_e: 0,
  spin: 1,
  mass_gev: 91.1876,
  width_gev: 2.4952,
});

export function evaluateZBosonState({
  position = [0, 0, 0],
  phase = 0,
} = {}) {
  const [x, y, z] = position;
  const r = Math.hypot(x, y, z);
  const envelope = Math.exp(-r / 0.00216);
  return {
    particle: "z_boson",
    spec: Z_BOSON_SPEC,
    radius: r,
    amplitude: envelope,
    neutral_current_phase: Math.cos(phase + r),
  };
}