// backend/physics/visuals/tensegrity_tension_engine.js
import * as THREE from 'three';

export const TENSEGRITY_ENGINE_CONFIG = {
    defaultRestLength: 90.0,        // Fallback L0 when pair/config doesn't specify one
    stiffnessK: 1.35,               // Hookean k scaling
    equilibriumStress: 0.35,        // Baseline stress threshold for shell/ghost shift
    maxStressRef: 4.50,             // Headroom so ~3.0 effectiveStress maps ~0.67 instead of clamping at 1.0
    imbalanceRef: 600.0,            // Reference scale for meanImbalance (~536 on 12-qbit ring -> ~0.89)
    minActiveTension: 0.015         // Cull negligible pairs
};

export class TensegrityTensionEngine {
    constructor(config = {}) {
        this.cfg = { ...TENSEGRITY_ENGINE_CONFIG, ...config };
        this._vA = new THREE.Vector3();
        this._vB = new THREE.Vector3();
        this._delta = new THREE.Vector3();
        this._dir = new THREE.Vector3();
        this._centroid = new THREE.Vector3();
    }

    /**
     * Evaluates real Hookean spring-mass mechanics and directional stress balance
     * from the current node & pair state.
     */
    evaluate({ nodes = [], pairs = [], worldScale = 1.0, referenceFrameManager = null, hudConfig = null }) {
        const cfg = this.cfg;
        const k = hudConfig?.springStiffnessK ?? cfg.stiffnessK;
        const restLengthBase = (hudConfig?.restLength ?? cfg.defaultRestLength) * Math.max(0.1, worldScale);
        const eqStress = hudConfig?.equilibriumTension ?? cfg.equilibriumStress;
        const maxRef = hudConfig?.maxNormalizedLoad ?? cfg.maxStressRef;

        const nodeCount = Array.isArray(nodes) ? nodes.length : 0;
        const centroid = this._centroid.set(0, 0, 0);
        const nodeIndexByRef = new Map();
        const nodeNetForce = new Array(nodeCount);
        const nodeStrainAccum = new Array(nodeCount);
        const nodePairCount = new Array(nodeCount);

        for (let i = 0; i < nodeCount; i++) {
            const n = nodes[i];
            const p = n?.position || n?.pos || n;
            const x = p?.x ?? n?.x ?? 0;
            const y = p?.y ?? n?.y ?? 0;
            const z = p?.z ?? n?.z ?? 0;
            centroid.x += x;
            centroid.y += y;
            centroid.z += z;

            nodeIndexByRef.set(n, i);
            if (n?.id !== undefined) nodeIndexByRef.set(String(n.id), i);
            if (n?.name !== undefined) nodeIndexByRef.set(String(n.name), i);

            nodeNetForce[i] = new THREE.Vector3();
            nodeStrainAccum[i] = 0;
            nodePairCount[i] = 0;
        }

        if (nodeCount > 0) {
            centroid.multiplyScalar(1 / nodeCount);
        }

        // Accumulate directional stress tensor outer-product / axial components
        // Tensor order: [xx, xy, xz, yy, yz, zz]
        let sXX = 0, sXY = 0, sXZ = 0, sYY = 0, sYZ = 0, sZZ = 0;
        let sumNormalizedStress = 0;
        let maxPairStress = 0;
        let activePairCount = 0;
        const evaluatedPairs = [];

        const pairList = Array.isArray(pairs) ? pairs : [];
        for (let i = 0; i < pairList.length; i++) {
            const pair = pairList[i];
            const a = pair?.a || pair?.nodeA || nodes[pair?.i];
            const b = pair?.b || pair?.nodeB || nodes[pair?.j];
            const posA = a?.position || a?.pos || a;
            const posB = b?.position || b?.pos || b;
            if (!posA || !posB) continue;

            this._vA.set(posA.x ?? a?.x ?? 0, posA.y ?? a?.y ?? 0, posA.z ?? a?.z ?? 0);
            this._vB.set(posB.x ?? b?.x ?? 0, posB.y ?? b?.y ?? 0, posB.z ?? b?.z ?? 0);
            this._delta.subVectors(this._vB, this._vA);

            const dist = this._delta.length();
            if (dist < 1e-5) continue;

            this._dir.copy(this._delta).multiplyScalar(1 / dist);

            // Prefer explicit pair restLength / equilibrium length when provided
            const l0 = typeof pair.restLength === 'number' && pair.restLength > 0
                ? pair.restLength * Math.max(0.1, worldScale)
                : restLengthBase;

            const extension = dist - l0;
            const strain = l0 > 1e-5 ? extension / l0 : 0;

            // Hookean restoring magnitude: F = -k * extension (positive magnitude = restoring effort)
            const hookeanForceMag = -k * extension;
            const absHookean = Math.abs(hookeanForceMag);

            // Combine explicit telemetry tension/strain with computed Hookean load
            const telemetryTension = typeof pair.tension === 'number'
                ? pair.tension
                : Math.abs(strain) * k;

            const effectiveStress = Math.max(telemetryTension, absHookean / Math.max(1.0, restLengthBase * 0.25));
            if (effectiveStress < cfg.minActiveTension) continue;

            const normalizedStress = Math.max(0, Math.min(1, effectiveStress / maxRef));
            sumNormalizedStress += normalizedStress;
            if (normalizedStress > maxPairStress) maxPairStress = normalizedStress;
            activePairCount++;

            // Restoring force vector from A toward B: f_AB = -k * (x_B - x_A - L0 * dir)
            const fx = -k * (this._delta.x - this._dir.x * l0);
            const fy = -k * (this._delta.y - this._dir.y * l0);
            const fz = -k * (this._delta.z - this._dir.z * l0);

            const idxA = nodeIndexByRef.get(a) ?? nodeIndexByRef.get(String(a?.id ?? a?.name));
            const idxB = nodeIndexByRef.get(b) ?? nodeIndexByRef.get(String(b?.id ?? b?.name));

            if (idxA !== undefined && nodeNetForce[idxA]) {
                nodeNetForce[idxA].x += fx;
                nodeNetForce[idxA].y += fy;
                nodeNetForce[idxA].z += fz;
                nodeStrainAccum[idxA] += Math.abs(strain);
                nodePairCount[idxA]++;
            }
            if (idxB !== undefined && nodeNetForce[idxB]) {
                nodeNetForce[idxB].x -= fx;
                nodeNetForce[idxB].y -= fy;
                nodeNetForce[idxB].z -= fz;
                nodeStrainAccum[idxB] += Math.abs(strain);
                nodePairCount[idxB]++;
            }

            // Axial stress contribution weighted by signed strain
            const w = strain * k;
            sXX += this._dir.x * this._dir.x * w;
            sXY += this._dir.x * this._dir.y * w;
            sXZ += this._dir.x * this._dir.z * w;
            sYY += this._dir.y * this._dir.y * w;
            sYZ += this._dir.y * this._dir.z * w;
            sZZ += this._dir.z * this._dir.z * w;

            evaluatedPairs.push({
                pair,
                posA: this._vA.clone(),
                posB: this._vB.clone(),
                midpoint: new THREE.Vector3().addVectors(this._vA, this._vB).multiplyScalar(0.5),
                axis: this._dir.clone(),
                dist,
                restLength: l0,
                extension,
                strain,
                hookeanForceMag,
                telemetryTension,
                effectiveStress,
                normalizedStress
            });
        }

        // Net nodal force imbalance across the network (0 = static equilibrium, >0 = net residual force)
        let netImbalanceMag = 0;
        for (let i = 0; i < nodeCount; i++) {
            netImbalanceMag += nodeNetForce[i].length();
        }
        const meanImbalance = nodeCount > 0 ? netImbalanceMag / nodeCount : 0;
        const imbalanceRef = hudConfig?.imbalanceReference ?? cfg.imbalanceRef ?? 600.0;
        const imbalanceNorm = Math.max(0, Math.min(1, meanImbalance / Math.max(1e-5, imbalanceRef)));

        const meanNormalizedStress = activePairCount > 0 ? sumNormalizedStress / activePairCount : 0;
        const overEquilibrium = meanNormalizedStress - eqStress;

        // Directional & anisotropic tensor response
        const trace = sXX + sYY + sZZ;
        const anisotropicMag = Math.sqrt(
            (sXX - sYY) ** 2 + (sYY - sZZ) ** 2 + (sZZ - sXX) ** 2 +
            6 * (sXY ** 2 + sXZ ** 2 + sYZ ** 2)
        ) / Math.max(1, activePairCount);

        // Optional frame context hook if available
        const activeFrame = referenceFrameManager?.activeFrameType || 'open';

        return {
            activeFrame,
            centroid: centroid.clone(),
            activePairCount,
            meanNormalizedStress,
            maxPairStress,
            overEquilibrium,
            imbalanceNorm,
            meanImbalance,
            tensor: {
                xx: sXX,
                xy: sXY,
                xz: sXZ,
                yy: sYY,
                yz: sYZ,
                zz: sZZ,
                trace,
                anisotropicMag
            },
            pairs: evaluatedPairs,
            nodeNetForce,
            nodeStrainAccum,
            nodePairCount
        };
    }
}