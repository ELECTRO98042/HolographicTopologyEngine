// =============================================================================
// ads_duality.js — Anti-de Sitter Bulk-Boundary Correspondence Mathematics
// =============================================================================

export class ADSDualityMath {
    constructor(radius = 200.0, throatDepth = 120.0) {
        this.radius = radius;
        this.throatDepth = throatDepth;
    }

    /**
     * Calculates the bulk coordinate (x, y, z) given cylindrical parameters (u, theta).
     * u ranges from 0 (center) to 1 (boundary ring).
     * theta ranges from 0 to 2*PI.
     */
    getBulkCoordinates(u, theta, time = 0) {
        const r = u * this.radius;
        const x = r * Math.sin(theta);
        const z = r * Math.cos(theta);
        
        // Anti-de Sitter hyperbolic flare (negative cosmological constant metric warp)
        // As u approaches 1 (boundary), y rises; as u approaches 0, y dips into the bulk throat.
        const safeU = Math.max(0.01, Math.min(0.99, u));
        const y = -Math.log(1.0 / safeU - 1.0) * (this.throatDepth * 0.35) - (this.throatDepth * 0.5);

        return { x, y, z };
    }

    /**
     * Computes the Ryu-Takayanagi minimal surface (the entanglement dome) arc height
     * based on the separation distance between boundary subregions A and B.
     */
    getEntanglementDomeRadius(angularSeparation) {
        // The larger the boundary region, the deeper and wider the bulk dome dips.
        return Math.sin(Math.min(Math.PI, angularSeparation * 0.5)) * (this.radius * 0.55);
    }
}