/**
 * Quantum Entanglement & Non-Locality Render Module
 * Physics: Non-separable Bell state wavefunction, instantaneous correlation bridge.
 */
import * as THREE from 'three';

export class EntanglementRenderer {
    constructor(group) {
        this.group = group;
        this.initLayers();
    }

    initLayers() {
        // Layer 2: Interlocked Möbius/Torus rings in anti-phase
        const ringGeo = new THREE.TorusGeometry(1.2, 0.05, 8, 32);
        this.ring1 = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
        this.ring2 = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 }));
        this.ring2.rotation.x = Math.PI / 2;
        this.group.add(this.ring1, this.ring2);
    }

    update(time, delta, layerStates, distanceToCamera, palette, nodeCol) {
        if (nodeCol) {
            this.ring1.material.color.copy(nodeCol);
            this.ring2.material.color.copy(nodeCol);
        }
        if (layerStates.subModels) {
            this.ring1.rotation.z = time * 4.0;
            this.ring2.rotation.y = -time * 4.0;
        }
    }
}
