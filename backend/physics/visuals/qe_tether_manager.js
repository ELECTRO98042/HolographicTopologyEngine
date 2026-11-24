import * as THREE from '/js/vendor/graphics/three.js';
import { createQETetherMaterial } from './qe_tether_shader.js';
export class QETetherManager {
    constructor(scene) {
        this.scene = scene;
        this.meshPool = [];
        this.material = createQETetherMaterial();
        this._posA = new THREE.Vector3();
        this._posB = new THREE.Vector3();
        this._midpoint = new THREE.Vector3();
    }

    update(pairs, time, active, worldScale = 1.0) {
        this.material.uniforms.uTime.value = time;

        const safePairs = Array.isArray(pairs) ? pairs : [];
        const requiredCount = active ? safePairs.length : 0;

        while (this.meshPool.length < requiredCount) {
            const geometry = new THREE.CylinderGeometry(3.0, 3.0, 1, 8, 32);
            geometry.rotateX(Math.PI / 2);
            const mesh = new THREE.Mesh(geometry, this.material);
            mesh.visible = false;
            this.scene.add(mesh);
            this.meshPool.push(mesh);
        }

        const baseRadialScale = Math.max(0.4, worldScale);

        // Update and position active tethers
        for (let i = 0; i < this.meshPool.length; i++) {
            const mesh = this.meshPool[i];
            if (i < requiredCount && active) {
                const pair = safePairs[i];
                this._posA.set(pair.ax, pair.ay, pair.az);
                this._posB.set(pair.bx, pair.by, pair.bz);

                this._midpoint.addVectors(this._posA, this._posB).multiplyScalar(0.5);
                mesh.position.copy(this._midpoint);

                const distance = Math.max(1e-4, pair.dist);
                const tensionBoost = typeof pair.tension === 'number'
                    ? 0.85 + 0.45 * (1.0 - Math.exp(-Math.abs(pair.tension)))
                    : 1.0;
                const stretchTaper = Math.max(0.65, Math.min(1.25, 140.0 / distance));
                const radialScale = baseRadialScale * tensionBoost * stretchTaper;

                mesh.scale.set(radialScale, radialScale, distance);
                mesh.lookAt(this._posB);
                mesh.visible = true;
            } else {
                mesh.visible = false;
            }
        }
    }
}