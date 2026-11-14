import * as THREE from 'three';
import { ToroidalTopology } from './topologies/toroidal.js';
import { CubicLatticeTopology } from './topologies/cubic_lattice.js';
import { SphericalTopology } from './topologies/spherical.js';
import { HyperbolicTopology } from './topologies/hyperbolic.js';
import { OpenSpaceTopology } from './topologies/open_space.js';

export class ReferenceFrameManager {
    constructor(scene) {
        this.scene = scene; // <--- Store scene reference
        this.activeMode = 'open';
        this.activeFrameType = 'open';
        this.currentGeometryMesh = null;
        this.currentScale = 1.0;
        this.topologies = {
            'open': new OpenSpaceTopology(),
            'spheroid': new SphericalTopology(),
            'cubed': new CubicLatticeTopology(),
            'toroidal': new ToroidalTopology(),
            'hyperbolic': new HyperbolicTopology()
        };
    }

    setMode(mode, nodes) {
        this.activeFrameType = mode;
        this.activeMode = mode;

        if (this.topologies[mode] && typeof this.topologies[mode].calculateTargets === 'function') {
            this.topologies[mode].calculateTargets(nodes);
        }
    }

    setScale(scale) {
        this.currentScale = scale;
        if (this.currentGeometryMesh) {
            this.currentGeometryMesh.scale.set(scale, scale, scale);
        }
    }

    update(time = 0) {
        if (this.currentGeometryMesh && typeof this.currentGeometryMesh.updateMatrixWorld === 'function') {
            this.currentGeometryMesh.updateMatrixWorld(true);
        }

        // If active topology has a custom per-frame update, safely invoke it
        if (this.topologies[this.activeFrameType] && typeof this.topologies[this.activeFrameType].update === 'function') {
            this.topologies[this.activeFrameType].update(time);
        }
    }

    async switchFrame(frameType, scale = this.currentScale || 1.0) {
        const targetType = this.topologies[frameType] ? frameType : 'open';
        console.log(`[ReferenceFrameManager] Switching frame to: ${targetType} at scale ${scale}`);

        // 1. Unconditionally remove and dispose of any existing mesh/group from the scene
        if (this.currentGeometryMesh && this.scene) {
            this.scene.remove(this.currentGeometryMesh);
            this.currentGeometryMesh.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            this.currentGeometryMesh = null;
        }

        this.activeFrameType = targetType;
        this.activeMode = targetType;
        this.currentScale = scale;

        // 2. Instantiate and attach the requested topology
        if (this.topologies[targetType] && this.scene) {
            try {
                const newMesh = this.topologies[targetType].createMesh(scale);
                if (newMesh) {
                    newMesh.traverse((child) => {
                        if (child.isMesh || child.isLine || child.isPoints) {
                            child.frustumCulled = false;
                            if (child.material) {
                                child.material.transparent = true;
                                child.material.depthWrite = false;
                                if ('side' in child.material) {
                                    child.material.side = THREE.DoubleSide;
                                }
                            }
                        }
                    });
                }
                this.currentGeometryMesh = newMesh;
                this.scene.add(this.currentGeometryMesh);
                console.log(`[ReferenceFrameManager] Successfully attached "${targetType}" to scene.`);
            } catch (err) {
                console.error(`[ReferenceFrameManager] EXCEPTION for ${targetType}:`, err);
            }
        }
    }

    applyConstraints(nodePositions) {
        if (this.activeFrameType === 'open' || !this.topologies[this.activeFrameType]) {
            return nodePositions;
        }
        return this.topologies[this.activeFrameType].enforceConstraints(nodePositions);
    }
}