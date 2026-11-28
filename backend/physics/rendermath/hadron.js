// backend/physics/rendermath/hadron.js
export const HADRON_CATALOG = Object.freeze({
  proton: {
    symbol: "p",
    name: "Proton",
    pdg_id: 2212,
    constituents: ["u", "u", "d"],
    charge_e: 1,
    spin: 0.5,
    baryon_number: 1,
    mass_gev: 0.938272088,
  },
  neutron: {
    symbol: "n",
    name: "Neutron",
    pdg_id: 2112,
    constituents: ["u", "d", "d"],
    charge_e: 0,
    spin: 0.5,
    baryon_number: 1,
    mass_gev: 0.939565421,
  },
  pion_plus: {
    symbol: "pi+",
    name: "Charged Pion (+)",
    pdg_id: 211,
    constituents: ["u", "dbar"],
    charge_e: 1,
    spin: 0,
    baryon_number: 0,
    mass_gev: 0.13957039,
  },
  pion_zero: {
    symbol: "pi0",
    name: "Neutral Pion",
    pdg_id: 111,
    constituents: ["u_ubar_d_dbar"],
    charge_e: 0,
    spin: 0,
    baryon_number: 0,
    mass_gev: 0.1349768,
  },
  kaon_plus: {
    symbol: "K+",
    name: "Charged Kaon (+)",
    pdg_id: 321,
    constituents: ["u", "sbar"],
    charge_e: 1,
    spin: 0,
    baryon_number: 0,
    mass_gev: 0.493677,
  },
});

export function resolveHadronSpec(nameOrSymbol = "proton") {
  const key = String(nameOrSymbol).toLowerCase();
  return (
    HADRON_CATALOG[key] ||
    Object.values(HADRON_CATALOG).find(
      (h) => h.symbol.toLowerCase() === key || String(h.pdg_id) === key
    ) ||
    HADRON_CATALOG.proton
  );
}