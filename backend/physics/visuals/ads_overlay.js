// =============================================================================
// ads_overlay.js — Three.js AdS/CFT Holographic Manifold Visualizer
// =============================================================================

import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { ADSDualityMath } from '../rendermath/ads_duality.js';

export class AdSOverlay {
    constructor(scene, referenceFrameManager, containerSelector) {
        this.scene = scene;
        this.refManager = referenceFrameManager;
        this.math = new ADSDualityMath(220.0, 140.0);
        this.active = false;

        this.group = new THREE.Group();
        this.group.visible = false;
        this.scene.add(this.group);

        this.buildManifold();
    }

    buildManifold() {
        // 1. Outer CFT Boundary Ring (Shifted from bright cyan to refined Holographic Blue/Amber)
        const ringGeo = new THREE.CylinderGeometry(220, 220, 45, 64, 16, true);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x0ea5e9, // Sophisticated holographic blue (replaces 0x00ffcc cyan)
            wireframe: true,
            transparent: true,
            opacity: 0.15,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            toneMapped: false
        });
        this.boundaryRing = new THREE.Mesh(ringGeo, ringMat);
        this.group.add(this.boundaryRing);

        // Secondary outer gold glow ring
        const outerRingGeo = new THREE.CylinderGeometry(235, 235, 10, 64, 4, true);
        const outerRingMat = new THREE.MeshBasicMaterial({
            color: 0xfacc15,
            wireframe: true,
            transparent: true,
            opacity: 1.80,
            blending: THREE.AdditiveBlending,
            toneMapped: false
        });
        this.outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
        this.group.add(this.outerRing);

        // 2. The Bulk Funnel (Negative Curvature Spacetime Geometry)
        const bulkFunc = (u, v, target) => {
            const theta = v * Math.PI * 2.0;
            const coords = this.math.getBulkCoordinates(u, theta);
            target.set(coords.x, coords.y, coords.z);
        };
        const bulkGeo = new ParametricGeometry(bulkFunc, 48, 48);
        const bulkMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            wireframe: true,
            transparent: true,
            opacity: 1.95,
            blending: THREE.AdditiveBlending,
            toneMapped: false
        });
        this.bulkMesh = new THREE.Mesh(bulkGeo, bulkMat);
        this.group.add(this.bulkMesh);

        // 3. The Entanglement Dome (Ryu-Takayanagi Minimal Surface)
        const domeGeo = new THREE.SphereGeometry(95, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
        const domeMat = new THREE.MeshBasicMaterial({
            color: 0x2e1065, // Luminous QE Purple
            wireframe: true,
            transparent: true,
            opacity: 0.05,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            toneMapped: false
        });
        this.entanglementDome = new THREE.Mesh(domeGeo, domeMat);
        this.entanglementDome.position.y = -65;
        this.group.add(this.entanglementDome);
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

    update(nodes, time, intensity, worldScale = 1.0) {
        if (!this.active) return;

        this.group.scale.setScalar(worldScale);

        this.boundaryRing.rotation.y = time * 0.15;
        this.outerRing.rotation.y = -time * 0.1;
        this.bulkMesh.rotation.y = time * 0.05;

        const baseAlpha = Math.max(0.1, Math.min(1.0, intensity));
        this.boundaryRing.material.opacity = 0.12 * baseAlpha;
        this.outerRing.material.opacity = 0.08 * baseAlpha;
        this.bulkMesh.material.opacity = 0.07 * baseAlpha;
        this.entanglementDome.material.opacity = 0.35 * baseAlpha;

        const pulse = 1.0 + Math.sin(time * 2.0) * 0.03;
        this.entanglementDome.scale.set(pulse, pulse, pulse);
    }
}