/**
 * Graviton & Metric Tensor Strain Render Module
 * Physics: Linearized Einstein field equations, spin-2 tensor quadupole tidal strain.
 */
import * as THREE from 'three';

export class GravitonRenderer {
    constructor(group) {
        this.group = group;
        this.initLayers();
    }

    initLayers() {
        // Layer 1: Singular dense core surrounded by geodesic tidal cage
        const geo = new THREE.DodecahedronGeometry(1.3, 1);
        this.mat = new THREE.MeshBasicMaterial({ color: 0x8844ff, wireframe: true, transparent: true, opacity: 0.5 });
        this.mesh = new THREE.Mesh(geo, this.mat);
        this.group.add(this.mesh);
    }

    update(time, delta, layerStates, nodeCol) {
        if (nodeCol && this.mat) { // (or appropriate material reference)
            this.mat.color.copy(nodeCol);
        }
        if (layerStates.surfaceMesh) {
            // Quadrupole tidal strain stretching (+ and x polarizations)
            const sx = 1.0 + 0.3 * Math.sin(time * 3.0);
            const sy = 1.0 - 0.3 * Math.sin(time * 3.0);
            this.mesh.scale.set(sx, sy, 1.0);
            this.mesh.rotation.z = time * 1.0;
        }
    }
}
