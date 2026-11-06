/**
 * RyuTakayanagiCalculator.js
 * Computes holographic entanglement entropy S = Area(gamma_A) / (4 * G_N).
 */
class RyuTakayanagiCalculator {
    constructor(options = {}) {
        this.newtonConstant = options.newtonConstant || 1.0;
        this.AdSRadius = options.AdSRadius || 1.0;
    }

    /**
     * Computes the minimal surface area for a spherical boundary subregion of radius R in AdS_4.
     * Enforces strict regularization to prevent negative area/entropy anomalies.
     */
    calculateMinimalSurfaceArea(subregionRadius, cutoffEpsilon = 0.01) {
        if (subregionRadius <= cutoffEpsilon) {
            throw new Error("Subregion radius must strictly exceed UV cutoff epsilon.");
        }
        const L2 = Math.pow(this.AdSRadius, 2);
        const divergentTerm = (2 * Math.PI * L2) / cutoffEpsilon;
        const finiteTerm = (2 * Math.PI * L2) / subregionRadius;

        // Ensure strictly non-negative geometric area projection
        return Math.max(1e-7, divergentTerm - finiteTerm);
    }

    computeEntanglementEntropy(subregionRadius, cutoffEpsilon = 0.01) {
        const area = this.calculateMinimalSurfaceArea(subregionRadius, cutoffEpsilon);
        return area / (4.0 * this.newtonConstant);
    }

    generateSurfaceMesh(subregionRadius, resolution = 20) {
        const points = [];
        for (let i = 0; i <= resolution; i++) {
            const theta = (i / resolution) * Math.PI;
            const x = subregionRadius * Math.cos(theta);
            const z = subregionRadius * Math.sin(theta);
            points.push({ x, y: 0, z: Math.max(0.001, z) });
        }
        return points;
    }
}

module.exports = RyuTakayanagiCalculator;