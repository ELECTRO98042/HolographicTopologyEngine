// backend/physics/visuals/vacuum_fluctuations_engine.js
import * as THREE from 'three';

export const VACUUM_ENGINE_CONFIG = {
    baseLambdaDensity: 0.42,       // Baseline zero-point fluctuation density [0..1]
    dispersionRef: 140.0,          // Reference spatial radius for dispersion scaling
    strainVarianceRef: 0.25,       // Reference variance for pair strain / tension agitation
    minLambdaDensity: 0.05,        // Floor so field remains subtly alive
    maxLambdaDensity: 1.0,         // Ceiling for normalized density
    baseNoiseSpeed: 1.0,           // Base shimmer / 3D noise speed multiplier
    baseDispAmp: 1.0,              // Base displacement amplitude multiplier
    fallbackRingPairs: true        // Use adjacent ring edges if no explicit pairs are passed
};

const FRAME_SHAPES = {
    open: { sx: 1.0, sy: 1.0, sz: 1.0, outerMult: 1.0 },
    toroidal: { sx: 1.12, sy: 0.62, sz: 1.12, outerMult: 1.08 },
    hyperbolic: { sx: 1.22, sy: 0.85, sz: 1.22, outerMult: 1.18 }
};

export class VacuumFluctuationsEngine {
    constructor(config = {}) {
        this.cfg = { ...VACUUM_ENGINE_CONFIG, ...config };
        this._vA = new THREE.Vector3();
        this._vB = new THREE.Vector3();
        this._delta = new THREE.Vector3();
        this._centroid = new THREE.Vector3();
    }

    /**
     * Evaluates spatial dispersion, structural/pair agitation, reference frame hints,
     * and vacuum fluctuation telemetry from the current node & pair state.
     */
    evaluate({ nodes = [], pairs = [], worldScale = 1.0, referenceFrameManager = null, hudConfig = null }) {
        const cfg = this.cfg;
        const safeScale = Math.max(0.1, worldScale);
        const nodeCount = Array.isArray(nodes) ? nodes.length : 0;

        const centroid = this._centroid.set(0, 0, 0);
        const positions = new Array(nodeCount);

        for (let i = 0; i < nodeCount; i++) {
            const n = nodes[i];
            const p = n?.position || n?.pos || n;
            const x = p?.x ?? n?.x ?? 0;
            const y = p?.y ?? n?.y ?? 0;
            const z = p?.z ?? n?.z ?? 0;
            positions[i] = new THREE.Vector3(x, y, z);
            centroid.x += x;
            centroid.y += y;
            centroid.z += z;
        }

        if (nodeCount > 0) {
            centroid.multiplyScalar(1 / nodeCount);
        }

        // Mean radial dispersion around centroid (normalized by worldScale)
        let radialSum = 0;
        for (let i = 0; i < nodeCount; i++) {
            radialSum += positions[i].distanceTo(centroid);
        }
        const meanRadius = nodeCount > 0 ? (radialSum / nodeCount) / safeScale : 0;
        const dispersionNorm = Math.max(0, Math.min(1, meanRadius / Math.max(1e-5, cfg.dispersionRef)));

        // Pair extension / tension variance as structural fluctuation proxy
        const pairList = Array.isArray(pairs) ? pairs : [];
        const pairLoads = [];

        const pushPairLoad = (posA, posB, pair) => {
            if (typeof pair?.tension === 'number' && Number.isFinite(pair.tension)) {
                pairLoads.push(Math.abs(pair.tension));
                return;
            }
            if (!posA || !posB) return;
            this._vA.set(posA.x ?? 0, posA.y ?? 0, posA.z ?? 0);
            this._vB.set(posB.x ?? 0, posB.y ?? 0, posB.z ?? 0);
            this._delta.subVectors(this._vB, this._vA);
            const dist = this._delta.length() / safeScale;
            const rest = typeof pair?.restLength === 'number' && pair.restLength > 0
                ? pair.restLength
                : 90.0;
            pairLoads.push(Math.abs((dist - rest) / Math.max(1e-5, rest)));
        };

        for (let i = 0; i < pairList.length; i++) {
            const pair = pairList[i];
            const a = pair?.a || pair?.nodeA || nodes[pair?.i] || nodes[pair?.source];
            const b = pair?.b || pair?.nodeB || nodes[pair?.j] || nodes[pair?.target];
            const posA = a?.position || a?.pos || a;
            const posB = b?.position || b?.pos || b;
            pushPairLoad(posA, posB, pair);
        }

        if (pairLoads.length === 0 && cfg.fallbackRingPairs && nodeCount >= 3) {
            for (let i = 0; i < nodeCount; i++) {
                const next = (i + 1) % nodeCount;
                pushPairLoad(positions[i], positions[next], null);
            }
        }

        let strainVariance = 0;
        if (pairLoads.length > 1) {
            const meanLoad = pairLoads.reduce((acc, v) => acc + v, 0) / pairLoads.length;
            const sqDiffSum = pairLoads.reduce((acc, v) => acc + (v - meanLoad) ** 2, 0);
            strainVariance = sqDiffSum / pairLoads.length;
        }

        const agitationNorm = Math.max(
            0,
            Math.min(1, strainVariance / Math.max(1e-5, cfg.strainVarianceRef))
        );

        // Combine baseline density with spatial dispersion and structural agitation
        const rawDensity =
            (hudConfig?.lambdaDensity ?? cfg.baseLambdaDensity) +
            dispersionNorm * 0.28 +
            agitationNorm * 0.30;

        const lambdaDensity = Math.max(
            cfg.minLambdaDensity,
            Math.min(cfg.maxLambdaDensity, rawDensity)
        );

        const noiseSpeed =
            (hudConfig?.noiseSpeed ?? cfg.baseNoiseSpeed) * (0.75 + lambdaDensity * 0.85);
        const dispAmp =
            (hudConfig?.dispAmp ?? cfg.baseDispAmp) * (0.65 + lambdaDensity * 0.75 + agitationNorm * 0.25);

        const activeFrame = referenceFrameManager?.activeFrameType || 'open';
        const frameShape = FRAME_SHAPES[activeFrame] || FRAME_SHAPES.open;

        return {
            activeFrame,
            frameShape,
            centroid: centroid.clone(),
            nodeCount,
            evaluatedPairCount: pairLoads.length,
            meanRadius,
            dispersionNorm,
            strainVariance,
            agitationNorm,
            lambdaDensity,
            noiseSpeed,
            dispAmp
        };
    }
}