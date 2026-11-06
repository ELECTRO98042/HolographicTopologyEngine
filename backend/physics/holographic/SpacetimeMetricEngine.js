/**
 * SpacetimeMetricEngine.js
 * Computes metric tensors, curvature, and geodesic trajectories in AdS and curved spacetimes.
 */
class SpacetimeMetricEngine {
    constructor(options = {}) {
        this.dimension = options.dimension || 4; // Default to 4D bulk (AdS_4 / BTZ style)
        this.AdSRadius = options.AdSRadius || 1.0; // AdS curvature radius (L)
    }

    /**
     * Calculates the AdS metric tensor g_mu_nu in Poincaré coordinates.
     * ds^2 = (L^2 / z^2) * (-dt^2 + dx^2 + dy^2 + dz^2)
     */
    getAdSPoincareMetric(coords) {
        const [t, x, y, z] = coords;
        // Enforce safe boundary cutoff to prevent infinite metric expansion
        const safeZ = Math.max(1e-4, z);

        const factor = Math.pow(this.AdSRadius / safeZ, 2);
        return [-factor, factor, factor, factor];
    }

    /**
     * Computes the Christoffel symbols Gamma^i_{jk} for AdS Poincaré metric.
     */
    computeChristoffelSymbols(coords) {
        const [t, x, y, z] = coords;
        const safeZ = Math.max(1e-4, z);
        const gamma = {};
        const invZ = 1.0 / safeZ;

        gamma['t_tz'] = -invZ;
        gamma['x_xz'] = -invZ;
        gamma['y_yz'] = -invZ;
        gamma['z_zz'] = -invZ;

        const L2 = Math.pow(this.AdSRadius, 2);
        gamma['z_tt'] = -safeZ / L2;
        gamma['z_xx'] = safeZ / L2;
        gamma['z_yy'] = safeZ / L2;

        return gamma;
    }

    /**
     * Integrates a null or timelike geodesic step with clamped boundary protection.
     */
    stepGeodesic(position, momentum, stepSize = 0.01) {
        const [t, x, y, z] = position;
        const [pt, px, py, pz] = momentum;
        const gamma = this.computeChristoffelSymbols(position);

        const scale = Math.pow(Math.max(1e-4, z) / this.AdSRadius, 2);
        const dt = pt * scale;
        const dx = px * scale;
        const dy = py * scale;
        const dz = pz * scale;

        // Bounded position update preventing boundary collapse
        const newPos = [
            t + dt * stepSize,
            x + dx * stepSize,
            y + dy * stepSize,
            Math.max(0.001, z + dz * stepSize)
        ];

        const dpz = - (gamma['z_tt'] * pt * pt + gamma['z_xx'] * px * px + gamma['z_yy'] * py * py + 2 * gamma['z_zz'] * pz * pz);
        const newMom = [pt, px, py, pz + dpz * stepSize];

        return { position: newPos, momentum: newMom };
    }
}

window.SpacetimeMetricEngine = SpacetimeMetricEngine;