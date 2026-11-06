// physics/reference_frames.js
import { ToroidalTopology } from './topologies/toroidal.js';
import { CubicLatticeTopology } from './topologies/cubic_lattice.js';
import { SphericalTopology } from './topologies/spherical.js';
import { HyperbolicTopology } from './topologies/hyperbolic.js';

export class ReferenceFrameManager {
    constructor() {
        this.activeMode = 'open';
        // Map UI dropdown keys directly to topology implementations
        this.topologies = {
            'toroidal': new ToroidalTopology(),
            'cubed': new CubicLatticeTopology(),
            'spheroid': new SphericalTopology(),
            'hyperbolic': new HyperbolicTopology()
        };
    }
    setMode(mode, nodes) {
        this.activeFrameType = mode;
        this.activeMode = mode; // Keep activeMode and activeFrameType in sync

        if (this.topologies[mode] && typeof this.topologies[mode].calculateTargets === 'function') {
            this.topologies[mode].calculateTargets(nodes);
        } else {
            // Silently pass for frames that manage targets on the frontend (like Open, Spheroid, etc.)
        }
    }

    renderActiveBoundary(ctx, canvas, project3D, scaleMultiplier) {
        //if (this.topologies[this.activeMode]) {
        //    this.topologies[this.activeMode].renderBoundary(ctx, canvas, project3D, scaleMultiplier);
        //}
    }
    async switchFrame(frameType) {
        if (this.activeFrameType === frameType) return;
        
        console.log(`[ReferenceFrame] Transitioning from ${this.activeFrameType} to ${frameType}...`);
        
        // 1. Teardown current geometry mesh
        if (this.currentGeometryMesh) {
            this.scene.remove(this.currentGeometryMesh);
            this.currentGeometryMesh.geometry.dispose();
            this.currentGeometryMesh = null;
        }

        this.activeFrameType = frameType;

        // 2. Load and attach new boundary geometry if not open space
        if (this.topologies[frameType]) {
            this.currentGeometryMesh = this.topologies[frameType].createMesh();
            this.scene.add(this.currentGeometryMesh);
        }

        console.log(`[ReferenceFrame] Successfully active: ${frameType}`);
    }

    applyConstraints(nodePositions) {
        if (this.activeFrameType === 'open_space' || !this.topologies[this.activeFrameType]) {
            return nodePositions;
        }
        // Delegate coordinate wrapping/clamping to the active topology solver
        return this.topologies[this.activeFrameType].enforceConstraints(nodePositions);
    }
}