/**
 * Vacuum Fluctuations & Zero-Point Foam Render Module
 * Physics: Heisenberg uncertainty delta E delta t >= hbar/2, virtual dipole loop creation/annihilation.
 */
import * as THREE from 'three';

export class VacuumFluctuationsRenderer {
    constructor(group) {
        this.group = group;
        this.initLayers();
    }

    initLayers() {
        // Layer 1: Stochastic bubbling vertex displacement points
        const count = 48;
        const geo = new THREE.BufferGeometry();
        this.basePos = new Float32Array(count * 3);
        const pos = new Float32Array(count * 3);
        for(let i=0; i<count; i++) {
            const u = Math.random(), v = Math.random();
            const theta = u * 2 * Math.PI, phi = Math.acos(2 * v - 1);
            const r = 1.2;
            this.basePos[i*3] = r * Math.sin(phi) * Math.cos(theta);
            this.basePos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
            this.basePos[i*3+2] = r * Math.cos(phi);
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.particles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending }));
        this.group.add(this.particles);
    }

    update(time, delta, layerStates, distanceToCamera, palette, nodeCol) {
        if (nodeCol && this.particles && this.particles.material) {
            this.particles.material.color.copy(nodeCol);
        }
        if (layerStates.surfaceMesh) {
            const pos = this.particles.geometry.attributes.position;
            for (let i = 0; i < 48; i++) {
                const burst = Math.sin(time * 20.0 + i * 3.7) * 0.25;
                pos.setXYZ(i, this.basePos[i * 3] * (1 + burst), this.basePos[i * 3 + 1] * (1 + burst), this.basePos[i * 3 + 2] * (1 + burst));
            }
            pos.needsUpdate = true;
        }
    }
}
