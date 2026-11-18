/**
 * Neutrino & Weak Isospin Render Module
 * Physics: Chiral left-handed interactions, PMNS matrix flavor oscillation (e -> mu -> tau).
 */
import * as THREE from 'three';

export class NeutrinoRenderer {
    constructor(group) {
        this.group = group;
        this.initLayers();
    }

    initLayers() {
        // Layer 1: Ghostly wireframe shell
        const geo = new THREE.IcosahedronGeometry(1.5, 1);
        this.mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.25 });
        this.mesh = new THREE.Mesh(geo, this.mat);
        this.group.add(this.mesh);
    }

    update(time, delta, layerStates, nodeCol) {
        if (nodeCol && this.mat) { // (or appropriate material reference)
            this.mat.color.copy(nodeCol);
        }
        if (layerStates.surfaceMesh) {
            this.mesh.rotation.y = time * 2.5;
            // Flavor oscillation color shift (Green -> Indigo -> Silver)
            const hue = (Math.sin(time * 0.5) + 1) * 0.5;
            if (hue < 0.33) this.mat.color.setHex(0x00ff88);
            else if (hue < 0.66) this.mat.color.setHex(0x4488ff);
            else this.mat.color.setHex(0xcccccc);
        }
    }
}
