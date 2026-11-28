export const QUARK_CATALOG = Object.freeze({
  up: {
    symbol: "u",
    name: "Up Quark",
    pdg_id: 2,
    generation: 1,
    charge_e: 2 / 3,
    spin: 0.5,
    baryon_number: 1 / 3,
    mass_gev: 0.00216, // PDG MS-bar scale reference (GeV/c^2)
    isospin_t3: 0.5,
  },
  down: {
    symbol: "d",
    name: "Down Quark",
    pdg_id: 1,
    generation: 1,
    charge_e: -1 / 3,
    spin: 0.5,
    baryon_number: 1 / 3,
    mass_gev: 0.00467,
    isospin_t3: -0.5,
  },
  charm: {
    symbol: "c",
    name: "Charm Quark",
    pdg_id: 4,
    generation: 2,
    charge_e: 2 / 3,
    spin: 0.5,
    baryon_number: 1 / 3,
    mass_gev: 1.27,
    isospin_t3: 0.5,
  },
  strange: {
    symbol: "s",
    name: "Strange Quark",
    pdg_id: 3,
    generation: 2,
    charge_e: -1 / 3,
    spin: 0.5,
    baryon_number: 1 / 3,
    mass_gev: 0.0934,
    isospin_t3: -0.5,
  },
  top: {
    symbol: "t",
    name: "Top Quark",
    pdg_id: 6,
    generation: 3,
    charge_e: 2 / 3,
    spin: 0.5,
    baryon_number: 1 / 3,
    mass_gev: 172.69,
    isospin_t3: 0.5,
  },
  bottom: {
    symbol: "b",
    name: "Bottom Quark",
    pdg_id: 5,
    generation: 3,
    charge_e: -1 / 3,
    spin: 0.5,
    baryon_number: 1 / 3,
    mass_gev: 4.18,
    isospin_t3: -0.5,
  },
});

export const COLOR_STATES = Object.freeze(["red", "green", "blue"]);

export function resolveQuarkSpec(flavorOrSymbol = "up") {
  const key = String(flavorOrSymbol).toLowerCase();
  if (QUARK_CATALOG[key]) return QUARK_CATALOG[key];
  return (
    Object.values(QUARK_CATALOG).find(
      (q) => q.symbol.toLowerCase() === key || String(q.pdg_id) === key
    ) || QUARK_CATALOG.up
  );
}

export function evaluateQuarkField({
  flavor = "up",
  color = "red",
  position = [0, 0, 0],
  phase = 0,
  confinementRadiusFm = 1.0,
} = {}) {
  const spec = resolveQuarkSpec(flavor);
  const [x, y, z] = position;
  const r = Math.hypot(x, y, z);
  const rNorm = r / Math.max(confinementRadiusFm, 1e-6);
  // Cornell-style linear confinement + Coulombic short-range profile amplitude
  const profileAmplitude = Math.exp(-0.5 * rNorm * rNorm) * (1 + 0.5 * rNorm);
  const colorIndex = Math.max(0, COLOR_STATES.indexOf(String(color).toLowerCase()));
  const colorPhaseOffset = (colorIndex * 2 * Math.PI) / 3;
  const theta = phase + colorPhaseOffset;

  return {
    particle: "quark",
    spec,
    color: COLOR_STATES[colorIndex] ?? "red",
    radius: r,
    amplitude: profileAmplitude,
    complex_state: {
      re: profileAmplitude * Math.cos(theta),
      im: profileAmplitude * Math.sin(theta),
    },
  };
}