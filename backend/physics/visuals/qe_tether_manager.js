import * as THREE from 'three';
import { createQETetherMaterial } from './qe_tether_shader.js';

export class QETetherManager {
    constructor(scene) {
        this.scene = scene;
        this.meshPool = [];
        this.material = createQETetherMaterial();
    }

    update(pairs, time, active) {
        this.material.uniforms.uTime.value = time;

        // Manage mesh pool size based on active pairs count
        const requiredCount = active ? pairs.length : 0;

        while (this.meshPool.length < requiredCount) {
            const geometry = new THREE.CylinderGeometry(3.0, 3.0, 1, 8, 32);
            geometry.rotateX(Math.PI / 2);
            const mesh = new THREE.Mesh(geometry, this.material);
            mesh.visible = false;
            this.scene.add(mesh);
            this.meshPool.push(mesh);
        }

        // Update and position active tethers
        for (let i = 0; i < this.meshPool.length; i++) {
            const mesh = this.meshPool[i];
            if (i < requiredCount && active) {
                const pair = pairs[i];
                // Use precalculated world coordinates directly from buildPairList
                const posA = new THREE.Vector3(pair.ax, pair.ay, pair.az);
                const posB = new THREE.Vector3(pair.bx, pair.by, pair.bz);

                const midpoint = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);
                mesh.position.copy(midpoint);

                const distance = pair.dist; // Use precalculated distance
                mesh.scale.set(1, 1, distance);
                mesh.lookAt(posB);
                mesh.visible = true;
            } else {
                mesh.visible = false;
            }
        }
    }
}