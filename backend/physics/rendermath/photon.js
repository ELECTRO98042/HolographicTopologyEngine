/**
 * Photon & Gauge Boson Render Module
 * Physics: Massless spin-1 transverse waves, Lorentz contraction, Doppler shifts.
 */
import * as THREE from 'three';

export class PhotonRenderer {
    constructor(group) {
        this.group = group;
        this.initLayers();
    }

    initLayers() {
        // Layer 1: Surface Mesh (Elongated velocity ellipsoid)
        const geo = new THREE.SphereGeometry(0.8, 24, 24);
        geo.scale(0.5, 0.5, 1.8);
        this.mat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.5 });
        this.mesh = new THREE.Mesh(geo, this.mat);
        this.group.add(this.mesh);

        // Layer 2: Sub-models (Orthogonal E and B transverse wave ribbons)
        const segments = 40;
        const eGeo = new THREE.BufferGeometry();
        eGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segments * 3), 3));
        this.eWave = new THREE.Line(eGeo, new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 }));
        
        const bGeo = new THREE.BufferGeometry();
        bGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segments * 3), 3));
        this.bWave = new THREE.Line(bGeo, new THREE.LineBasicMaterial({ color: 0xaa44ff, linewidth: 2 }));
        
        this.subGroup = new THREE.Group();
        this.subGroup.add(this.eWave, this.bWave);
        this.group.add(this.subGroup);
    }

    update(time, delta, layerStates, nodeCol) {
        if (nodeCol && this.mat) { // (or appropriate material reference)
            this.mat.color.copy(nodeCol);
        }
        if (layerStates.surfaceMesh) {
            this.mesh.rotation.z = time * 3.0;
        }

        if (layerStates.subModels) {
            this.subGroup.visible = true;
            const ePos = this.eWave.geometry.attributes.position;
            const bPos = this.bWave.geometry.attributes.position;
            const segments = 40;
            for(let i=0; i<segments; i++) {
                const z = (i / segments - 0.5) * 4.0;
                const env = Math.exp(-Math.pow(z * 0.6, 2));
                const amp = Math.sin(z * 5.0 - time * 15.0) * 1.2 * env;
                ePos.setXYZ(i, amp, 0, z);
                bPos.setXYZ(i, 0, amp, z);
            }
            ePos.needsUpdate = true;
            bPos.needsUpdate = true;
        } else {
            this.subGroup.visible = false;
        }
    }
}
