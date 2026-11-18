/**
 * Electron & Electromagnetic Spin Render Module
 * Physics: Dirac Equation, Zitterbewegung Compton frequency jitter, Larmor precession.
 */
import * as THREE from 'three';

export class ElectronRenderer {
    constructor(group) {
        this.group = group;
        this.initLayers();
    }

    initLayers() {
        // Layer 1: Animated Surface Mesh (Flickering Dirac skin)
        const geo = new THREE.SphereGeometry(1.0, 32, 32);
        this.surfaceMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.3 });
        this.surfaceMesh = new THREE.Mesh(geo, this.surfaceMat);
        this.group.add(this.surfaceMesh);

        // Layer 2: Sub-models (Orbiting virtual photon dipole sparks)
        this.subModelGroup = new THREE.Group();
        const sparkGeo = new THREE.SphereGeometry(0.12, 8, 8);
        const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.spark1 = new THREE.Mesh(sparkGeo, sparkMat);
        this.spark2 = new THREE.Mesh(sparkGeo, sparkMat);
        this.subModelGroup.add(this.spark1, this.spark2);
        this.group.add(this.subModelGroup);

        // Layer 3: Ghost Mesh (Dirac probability cloud |psi|^2)
        const cloudGeo = new THREE.BufferGeometry();
        const count = 64;
        const positions = new Float32Array(count * 3);
        this.baseCloudPos = new Float32Array(count * 3);
        for(let i=0; i<count; i++) {
            const u = Math.random(), v = Math.random();
            const theta = u * 2 * Math.PI, phi = Math.acos(2 * v - 1);
            const r = Math.pow(Math.random(), 0.5) * 2.0;
            this.baseCloudPos[i*3] = r * Math.sin(phi) * Math.cos(theta);
            this.baseCloudPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
            this.baseCloudPos[i*3+2] = r * Math.cos(phi);
        }
        cloudGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const cloudMat = new THREE.PointsMaterial({ color: 0x0088ff, size: 0.15, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
        this.ghostCloud = new THREE.Points(cloudGeo, cloudMat);
        this.group.add(this.ghostCloud);

        // Layer 6: Tensor Vector Lines (Electric & Magnetic field tensors F_mu_nu)
        const lineGeo = new THREE.BufferGeometry();
        const linePos = new Float32Array([0,0,0, 0,2.5,0, 0,0,0, 0,-2.5,0, 0,0,0, 2.5,0,0, 0,0,0, -2.5,0,0]);
        lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
        const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
        this.tensorLines = new THREE.LineSegments(lineGeo, lineMat);
        this.group.add(this.tensorLines);
    }

    update(time, delta, layerStates, distanceToCamera, palette, nodeCol) {
        if (nodeCol && this.surfaceMat) {
            this.surfaceMat.color.copy(nodeCol);
        }
        if (nodeCol && this.tensorLines && this.tensorLines.material) {
            this.tensorLines.material.color.copy(nodeCol);
        }
        // Zitterbewegung high-frequency jitter
        if (layerStates.surfaceMesh) {
            this.surfaceMesh.rotation.y = time * 2.0;
            this.surfaceMat.opacity = 0.2 + 0.15 * Math.sin(time * 40.0);
        }

        // Sub-model orbiting
        if (layerStates.subModels) {
            const a = time * 5.0;
            this.spark1.position.set(Math.cos(a)*1.4, Math.sin(a*1.5)*0.5, Math.sin(a)*1.4);
            this.spark2.position.set(-Math.cos(a)*1.4, -Math.sin(a*1.5)*0.5, -Math.sin(a)*1.4);
        }

        // Ghost cloud wavefunction collapse near observer
        if (layerStates.ghostMesh) {
            const posAttr = this.ghostCloud.geometry.attributes.position;
            const collapseFactor = distanceToCamera < 5.0 ? 0.4 : 1.0;
            for(let i=0; i<64; i++) {
                const jx = Math.sin(time * 30.0 + i) * 0.1 * collapseFactor;
                const jy = Math.cos(time * 33.0 + i) * 0.1 * collapseFactor;
                const jz = Math.sin(time * 28.0 + i) * 0.1 * collapseFactor;
                posAttr.setXYZ(i, this.baseCloudPos[i*3]*collapseFactor + jx, this.baseCloudPos[i*3+1]*collapseFactor + jy, this.baseCloudPos[i*3+2]*collapseFactor + jz);
            }
            posAttr.needsUpdate = true;
            this.ghostCloud.visible = true;
        } else {
            this.ghostCloud.visible = false;
        }

        // Tensors visibility
        this.tensorLines.visible = !!layerStates.tensors;
    }
}
