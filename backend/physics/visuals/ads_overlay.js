// =============================================================================
// ads_overlay.js — Three.js AdS/CFT Holographic Manifold Visualizer
// =============================================================================

import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { ADSDualityMath } from '../rendermath/ads_duality.js';

const BASE_BOUNDARY_RADIUS = 220.0;
const BASE_OUTER_RADIUS = 235.0;
const BASE_DOME_RADIUS = 95.0;
const BASE_DOME_Y = -65.0;

export class AdSOverlay {
    constructor(scene, referenceFrameManager, containerSelector) {
        this.scene = scene;
        this.refManager = referenceFrameManager;
        this.containerSelector = containerSelector;
        this.math = new ADSDualityMath(BASE_BOUNDARY_RADIUS, 140.0);
        this.active = false;
        this.lastFrame = null;

        this.group = new THREE.Group();
        this.group.visible = false;
        this.scene.add(this.group);

        this.buildManifold();
        this.buildFrameConformingHelpers();
    }

    buildManifold() {
        // 1. Outer CFT Boundary Ring
        const ringGeo = new THREE.CylinderGeometry(BASE_BOUNDARY_RADIUS, BASE_BOUNDARY_RADIUS, 45, 64, 16, true);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x0ea5e9,
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
        const outerRingGeo = new THREE.CylinderGeometry(BASE_OUTER_RADIUS, BASE_OUTER_RADIUS, 10, 64, 4, true);
        const outerRingMat = new THREE.MeshBasicMaterial({
            color: 0xfacc15,
            wireframe: true,
            transparent: true,
            opacity: 0.25,
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
            opacity: 0.2,
            blending: THREE.AdditiveBlending,
            toneMapped: false
        });
        this.bulkMesh = new THREE.Mesh(bulkGeo, bulkMat);
        this.group.add(this.bulkMesh);

        // 3. The Entanglement Dome (Ryu-Takayanagi Minimal Surface)
        const domeGeo = new THREE.SphereGeometry(BASE_DOME_RADIUS, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
        const domeMat = new THREE.MeshBasicMaterial({
            color: 0x8b5cf6,
            wireframe: true,
            transparent: true,
            opacity: 0.35,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            toneMapped: false
        });
        this.entanglementDome = new THREE.Mesh(domeGeo, domeMat);
        this.entanglementDome.position.y = BASE_DOME_Y;
        this.group.add(this.entanglementDome);
    }

    buildFrameConformingHelpers() {
        // Toroidal conformal guide torus (visible in 'toroidal' frame)
        const torusGeo = new THREE.TorusGeometry(220, 42, 20, 64);
        torusGeo.rotateX(Math.PI * 0.5);
        const torusMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            wireframe: true,
            transparent: true,
            opacity: 0.22,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false
        });
        this.toroidalEnvelope = new THREE.Mesh(torusGeo, torusMat);
        this.toroidalEnvelope.visible = false;
        this.group.add(this.toroidalEnvelope);

        // Cubed conformal boundary cage (visible in 'cubed' frame)
        const boxGeo = new THREE.BoxGeometry(240, 240, 240);
        const edgesGeo = new THREE.EdgesGeometry(boxGeo);
        boxGeo.dispose();
        const edgesMat = new THREE.LineBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.35,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false
        });
        this.cubicCage = new THREE.LineSegments(edgesGeo, edgesMat);
        this.cubicCage.visible = false;
        this.group.add(this.cubicCage);
    }

    getFrameMetrics(activeFrame, worldScale) {
        const refMgr = this.refManager || window.referenceFrameManager;
        const topo = refMgr?.topologies?.[activeFrame] || null;

        let metrics = null;
        if (refMgr && typeof refMgr.getBoundaryMetrics === 'function') {
            try {
                metrics = refMgr.getBoundaryMetrics(activeFrame, worldScale);
            } catch (_) {
                metrics = null;
            }
        }

        const boundRadius =
            metrics?.boundingRadius ??
            topo?.boundingRadius ??
            topo?.radius ??
            topo?.outerRadius ??
            (activeFrame === 'toroidal' ? 240 : activeFrame === 'hyperbolic' ? 215 : BASE_BOUNDARY_RADIUS);

        return {
            frame: activeFrame,
            boundRadius: Number.isFinite(boundRadius) && boundRadius > 0 ? boundRadius : BASE_BOUNDARY_RADIUS
        };
    }

    computeNodeStats(nodes, worldScale) {
        const list = Array.isArray(nodes) ? nodes : [];
        if (list.length === 0) {
            return {
                count: 0,
                maxRadius: 90,
                avgRadius: 65,
                avgSpeed: 0,
                maxAxis: 90
            };
        }

        let sumR = 0;
        let maxR = 0;
        let sumSpeed = 0;
        let maxAxis = 0;
        let validCount = 0;

        for (let i = 0; i < list.length; i++) {
            const n = list[i];
            if (!n) continue;
            const x = (n.position && typeof n.position.x === 'number' ? n.position.x : (n.x ?? 0)) * worldScale;
            const y = (n.position && typeof n.position.y === 'number' ? n.position.y : (n.y ?? 0)) * worldScale;
            const z = (n.position && typeof n.position.z === 'number' ? n.position.z : (n.z ?? 0)) * worldScale;

            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
            validCount++;

            const r = Math.hypot(x, y, z);
            sumR += r;
            if (r > maxR) maxR = r;

            maxAxis = Math.max(maxAxis, Math.abs(x), Math.abs(y), Math.abs(z));

            const vx = n.vx ?? n.velocity?.x ?? 0;
            const vy = n.vy ?? n.velocity?.y ?? 0;
            const vz = n.vz ?? n.velocity?.z ?? 0;
            sumSpeed += Math.hypot(vx, vy, vz);
        }

        if (validCount === 0) {
            return { count: 0, maxRadius: 90, avgRadius: 65, avgSpeed: 0, maxAxis: 90 };
        }

        return {
            count: validCount,
            maxRadius: maxR,
            avgRadius: sumR / validCount,
            avgSpeed: sumSpeed / validCount,
            maxAxis
        };
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

        const safeScale = Number.isFinite(worldScale) && worldScale > 0 ? worldScale : 1.0;
        const activeFrame = this.refManager?.activeFrameType || window.hudMode || 'open';
        this.lastFrame = activeFrame;

        const frameInfo = this.getFrameMetrics(activeFrame, safeScale);
        const nodeStats = this.computeNodeStats(nodes, safeScale);

        // Keep group at world origin with worldScale; scale sub-elements to conform
        // to the active frame boundary and preserve relative proximity to live nodes.
        this.group.position.set(0, 0, 0);
        this.group.scale.setScalar(safeScale);

        // Node-relative scale factor: nodes typically sit around ~80-230 units;
        // blend frame boundary radius with live node extent so proximity tracks naturally.
        const targetExtent = Math.max(
            frameInfo.boundRadius / safeScale,
            nodeStats.maxRadius / safeScale * 1.15,
            85.0
        );
        const radialRatio = Math.max(0.45, Math.min(1.65, targetExtent / BASE_BOUNDARY_RADIUS));

        // Data-driven motion rate from live node speeds & intensity
        const activityFactor = 1.0 + Math.min(1.5, nodeStats.avgSpeed * 0.15);
        const baseAlpha = Math.max(0.1, Math.min(1.0, intensity ?? 1.0));

        const isToroidal = activeFrame === 'toroidal';
        const isCubed = activeFrame === 'cubed';
        const isHyperbolic = activeFrame === 'hyperbolic';

        // Toggle frame-specific conformal helpers
        if (this.toroidalEnvelope) {
            this.toroidalEnvelope.visible = isToroidal;
            if (isToroidal) {
                const torusScale = Math.max(0.85, (nodeStats.avgRadius / safeScale) / 175.0);
                this.toroidalEnvelope.scale.set(torusScale, Math.max(0.5, torusScale * 0.55), torusScale);
                this.toroidalEnvelope.rotation.y = -time * 0.08 * activityFactor;
                this.toroidalEnvelope.material.opacity = 0.25 * baseAlpha;
            }
        }

        if (this.cubicCage) {
            this.cubicCage.visible = isCubed;
            if (isCubed) {
                const cubeHalf = Math.max(95.0, (nodeStats.maxAxis / safeScale) * 1.15);
                const s = cubeHalf / 120.0;
                this.cubicCage.scale.set(s, s, s);
                this.cubicCage.material.opacity = 0.35 * baseAlpha;
            }
        }

        // Conform rings & bulk funnel per frame
        if (isToroidal) {
            // Widen out radially to match toroidal ring spread while flattening vertical cylinder height
            const widen = Math.max(1.0, radialRatio);
            this.boundaryRing.scale.set(widen, 0.55, widen);
            this.outerRing.scale.set(widen * 1.05, 0.45, widen * 1.05);
            this.bulkMesh.scale.set(widen * 0.95, 0.65, widen * 0.95);
        } else if (isCubed) {
            const boxFit = Math.min(1.0, Math.max(0.55, radialRatio * 0.85));
            this.boundaryRing.scale.set(boxFit, boxFit * 0.8, boxFit);
            this.outerRing.scale.set(boxFit * 1.02, boxFit * 0.8, boxFit * 1.02);
            this.bulkMesh.scale.set(boxFit * 0.85, boxFit * 0.85, boxFit * 0.85);
        } else if (isHyperbolic) {
            const throatFit = Math.max(0.8, Math.min(1.35, radialRatio));
            this.boundaryRing.scale.set(throatFit, 1.1, throatFit);
            this.outerRing.scale.set(throatFit * 1.04, 1.1, throatFit * 1.04);
            this.bulkMesh.scale.set(throatFit, 1.15, throatFit);
        } else {
            // 'open' and 'spheroid'
            const fit = Math.max(0.65, Math.min(1.25, radialRatio));
            this.boundaryRing.scale.set(fit, fit, fit);
            this.outerRing.scale.set(fit * 1.04, fit, fit * 1.04);
            this.bulkMesh.scale.set(fit, fit, fit);
        }

        this.boundaryRing.rotation.y = time * 0.15 * activityFactor;
        this.outerRing.rotation.y = -time * 0.1 * activityFactor;
        this.bulkMesh.rotation.y = time * 0.05 * activityFactor;

        this.boundaryRing.material.opacity = 0.12 * baseAlpha;
        this.outerRing.material.opacity = 0.08 * baseAlpha;
        this.bulkMesh.material.opacity = 0.08 * baseAlpha;
        this.entanglementDome.material.opacity = 0.35 * baseAlpha;

        // Dome scales with node spread and pulses from live node energy + time
        const domeScaleBase = isToroidal
            ? Math.max(0.75, (nodeStats.avgRadius / safeScale) / 140.0)
            : Math.max(0.55, Math.min(1.2, (nodeStats.maxRadius / safeScale) / BASE_DOME_RADIUS));
        const pulse = domeScaleBase * (1.0 + Math.sin(time * 2.0 * activityFactor) * 0.04);
        this.entanglementDome.scale.set(pulse, pulse, pulse);
        this.entanglementDome.position.y = BASE_DOME_Y * Math.min(1.15, Math.max(0.6, domeScaleBase));
    }
}