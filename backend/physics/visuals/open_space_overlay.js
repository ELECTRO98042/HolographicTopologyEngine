// =============================================================================
// open_space_overlay.js — Euclidean Open Space Reference Frame & Boundary Manager
// -----------------------------------------------------------------------------
// Manages open space Euclidean boundaries, baseline coordinate caching, 
// and prevents collapse when returning from non-Euclidean reference frames.
// =============================================================================

import * as THREE from '/js/vendor/graphics/three.js';

export class OpenSpaceOverlay {
    constructor(scene, referenceFrameManager, containerSelector) {
        this.scene = scene;
        this.referenceFrameManager = referenceFrameManager;
        this.container = document.querySelector(containerSelector);
        this.active = false;
        this.group = new THREE.Group();
        this.group.name = 'overlay_open_space';
        this.scene.add(this.group);
        this.group.visible = false;

        this.pristinePositions = new Map();
    }

    enable() {
        if (this.active) return;
        this.active = true;
        this.group.visible = true;
    }

    disable() {
        if (!this.active) return;
        this.active = false;
        this.group.visible = false;
    }

    /**
     * Caches pristine world coordinates when entering open space
     * to prevent coordinate drift or node collapse.
     */
    captureBaseline(nodes) {
        if (!nodes || !Array.isArray(nodes)) return;
        nodes.forEach((node, idx) => {
            const key = node.id || node.name || `node-${idx}`;
            const x = node.position ? node.position.x : (node.x ?? 0);
            const y = node.position ? node.position.y : (node.y ?? 0);
            const z = node.position ? node.position.z : (node.z ?? 0);

            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;

            if (!this.pristinePositions.has(key)) {
                this.pristinePositions.set(key, { x, y, z });
            }
        });
    }

    /**
     * Restores pristine baseline positions when switching back to Open Space
     */
    restoreBaseline(nodes) {
        if (!nodes || !Array.isArray(nodes)) return;
        nodes.forEach((node, idx) => {
            const key = node.id || node.name || `node-${idx}`;
            const base = this.pristinePositions.get(key);
            if (!base) return;

            const x = node.position ? node.position.x : (node.x ?? 0);
            const y = node.position ? node.position.y : (node.y ?? 0);
            const z = node.position ? node.position.z : (node.z ?? 0);

            // Only recover nodes with invalid/non-finite coordinates instead of snapping valid positions
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
                if (node.position) {
                    node.position.set(base.x, base.y, base.z);
                }
                node.x = base.x;
                node.y = base.y;
                node.z = base.z;
                node.vx = 0;
                node.vy = 0;
                node.vz = 0;
            }
        });
    }

    update(nodes, time, intensity, worldScale) {
        if (!this.active) return;
        // Optional subtle boundary pulse or ambient open space telemetry animations
        const pulse = Math.sin(time * 1.5) * 0.04 + 0.18;
        if (this.boundaryBox && this.boundaryBox.material) {
            this.boundaryBox.material.opacity = pulse * Math.max(0.2, intensity);
        }
    }

    dispose() {
        this.scene.remove(this.group);
        this.group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        this.pristinePositions.clear();
    }
}