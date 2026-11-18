/**
 * Higgs Condensate & Yukawa Coupling Render Module
 * Physics: Non-zero VEV scalar field potential, refractive mass drag, chirality flipping.
 */
import * as THREE from 'three';

export class HiggsCondensateRenderer {
    constructor(group) {
        this.group = group;
        this.initLayers();
    }

    initLayers() {
        // Layer 1: Refractive gold-amber core lens
        const geo = new THREE.IcosahedronGeometry(1.2, 3);
        this.mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true, transparent: true, opacity: 0.4 });
        this.mesh = new THREE.Mesh(geo, this.mat);
        this.group.add(this.mesh);

        // Layer 3: Scalar field aura / viscous ripple shells
        const auraGeo = new THREE.SphereGeometry(2.2, 16, 16);
        this.auraMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, wireframe: true, transparent: true, opacity: 0.1 });
        this.aura = new THREE.Mesh(auraGeo, this.auraMat);
        this.group.add(this.aura);
    }

    update(time, delta, layerStates, nodeCol) {
        if (nodeCol && this.mat) { // (or appropriate material reference)
            this.mat.color.copy(nodeCol);
        }
        if (layerStates.surfaceMesh) {
            this.mesh.rotation.x = time * 0.8;
            this.mesh.rotation.y = time * 1.2;
        }
        if (layerStates.ghostMesh) {
            this.aura.scale.setScalar(1.0 + 0.15 * Math.sin(time * 3.0));
            this.aura.visible = true;
        } else {
            this.aura.visible = false;
        }
    }
}
