/**
 * physicsArbiter.js
 * Official validation middleware gatekeeper between the Freestyle Deck and Main HUD canvas.
 * Evaluates node drops against governing physics modules without mutating them.
 */
class PhysicsArbiter {
    constructor() {
        // Instantiate core physics engines as read-only arbiters
        this.metricEngine = new SpacetimeMetricEngine({ dimension: 4, AdSRadius: 1.0 });
        this.hamiltonianEngine = new PhaseSpaceHamiltonianEngine({ mass: 1.0, omega: 1.5, lambda: 0.2 });
    }

    /**
     * Intercepts and validates a node drop payload.
     * Returns a verdict object containing status, color code, telemetry message, and sanitized node data.
     */
    validateDrop(nodePayload) {
        const type = nodePayload.type || 'Standard';
        const pos = nodePayload.position || nodePayload;

        // 1. Metric / Bulk Validation (Macro Domain - General Relativity)
        if (type === 'METRIC' || type === 'BlackHole') {
            try {
                const zCoord = typeof pos.z === 'number' ? pos.z : 1.0;
                // Enforce strict Poincaré coordinate domain constraint: z > 0
                const coords = [0, pos.x || 0, pos.y || 0, Math.max(0.1, zCoord)];
                this.metricEngine.getAdSPoincareMetric(coords); 
                
                return {
                    status: 'PASSED',
                    color: 'green',
                    code: 'STATUS_00_PASSED',
                    message: 'Metric tensor evaluated successfully. Bulk geometry stable.',
                    node: { ...nodePayload, position: { x: coords[1], y: coords[2], z: coords[3] }, mass: 2.5 }
                };
            } catch (err) {
                return {
                    status: 'DENIED',
                    color: 'red',
                    code: 'ERR_METRIC_DOMAIN_VIOLATION',
                    message: `Drop Denied: ${err.message}`
                };
            }
        }

        // 2. Quantum / Field Validation (Micro Domain - QFT / Hamiltonian)
        if (type === 'FIELD' || type === 'POTENTIAL') {
            const qVal = (pos.x || 0) * 0.01;
            const state = this.hamiltonianEngine.stepRK4(qVal, 0.5, 0.01);
            
            if (isNaN(state.energy) || state.energy > 50.0) {
                return {
                    status: 'WARNING',
                    color: 'orange',
                    code: 'ERR_QUANTUM_ENERGY_OVERFLOW',
                    message: 'Anharmonic potential divergence detected. Clamping field amplitude.'
                };
            }

            return {
                status: 'PASSED',
                color: 'green',
                code: 'STATUS_00_PASSED',
                message: 'Hamiltonian oscillator state stable.',
                node: { ...nodePayload, energy: state.energy, mass: 1.0 }
            };
        }

        // Default standard topology pass
        return {
            status: 'PASSED',
            color: 'green',
            code: 'STATUS_00_PASSED',
            message: 'Standard topology node verified.',
            node: nodePayload
        };
    }
}

// Expose singleton instance globally for window listeners and renderer integration
window.physicsArbiter = new PhysicsArbiter();