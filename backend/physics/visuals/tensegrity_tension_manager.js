// backend/physics/visuals/tensegrity_tension_manager.js
import * as THREE from 'three';
import { TensegrityTensionEngine } from './tensegrity_tension_engine.js';

export const TENSEGRITY_VISUAL_CONFIG = {
    // --- Equilibrium & Hookean Spring-Mass Coupling ---
    equilibriumTension: 0.35,       // [↑] Higher load needed before shell/ghost reacts | [↓] More sensitive to light tension
    springStiffnessK: 1.35,         // [↑] Stronger Hookean restoring force response   | [↓] Softer spring response
    maxNormalizedLoad: 4.50,        // [↑] Wider range before clamping max stress color   | [↓] Reaches deep orange sooner
    imbalanceRef: 600.0,            // [↑] Higher meanImbalance needed for full shell/ghost drive

    // --- Elastic Shell Deformation ---
    shellDeformAmp: 0.22,           // [↑] Stronger radial shell bulge/pinch on load   | [↓] Subtler shell deformation
    shellWireOpacity: 0.24,         // [↑] More prominent deformed shell cage         | [↓] Lighter shell cage (preserves center)

    // --- Symmetric Stress-Tensor Ghost Meshes ---
    ghostBaseScale: 1.0,            // [↑] Larger baseline ghost shell envelope         | [↓] Tighter ghost shell around core
    ghostStressScaleGain: 0.36,     // [↑] More expansion/compression from stress/imbalance | [↓] Gentler ghost breathing
    ghostOpacity: 0.11,             // [↑] Stronger ghost mesh tint                   | [↓] Cleaner see-through over interior nodes

    // --- Spring-Mass Connectors (Cyan -> Deep Orange) ---
    connectorBaseOpacity: 0.36,     // [↑] Stronger baseline connector lines           | [↓] Clearer interior node sightlines
    connectorPeakOpacity: 0.72,     // [↑] Brighter high-load struts                  | [↓] Controlled peak brightness (less glare)
    minActiveTension: 0.015,        // [↑] Cull near-zero tension pairs               | [↓] Keep subtle low-load links

    // --- Stress Tensor Vector Field ---
    vectorFieldScale: 18.0,         // [↑] Longer Hookean stress vector ticks          | [↓] Shorter, tighter stress ticks
    maxVectorLength: 28.0,          // [↑] Allow longer vector ticks                  | [↓] Prevent giant cross-viewport spikes
    vectorFieldOpacity: 0.45        // [↑] Stronger stress vector visibility            | [↓] Subtler vector overlay
};

export class TensegrityTensionManager {
    constructor(scene, referenceFrameManager, containerSelector, config = {}) {
        this.scene = scene;
        this.referenceFrameManager = referenceFrameManager || window.referenceFrameManager || null;
        this.containerSelector = containerSelector;
        this.cfg = { ...TENSEGRITY_VISUAL_CONFIG, ...config };
        this.group = new THREE.Group();
        this.group.name = 'TensegrityTensionSigmaGroup';
        this.group.visible = false;

        this._time = 0;
        this._maxPairs = 256;
        this._shellBasePositions = null;

        this._buildShellAndGhosts();
        this._buildConnectors();
        this._buildStressVectors();

        if (this.scene) {
            this.scene.add(this.group);
        }
        this.engine = new TensegrityTensionEngine({
            stiffnessK: this.cfg.springStiffnessK,
            equilibriumStress: this.cfg.equilibriumTension,
            maxStressRef: this.cfg.maxNormalizedLoad,
            imbalanceRef: this.cfg.imbalanceRef,
            minActiveTension: this.cfg.minActiveTension
        });
    }

    _buildShellAndGhosts() {
        const cfg = this.cfg;

        // Deformable structural shell cage
        const shellGeo = new THREE.IcosahedronGeometry(78, 2);
        this._shellBasePositions = new Float32Array(shellGeo.attributes.position.array);
        const shellMat = new THREE.MeshBasicMaterial({
            color: 0x00e5ff,
            wireframe: true,
            transparent: true,
            opacity: cfg.shellWireOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.shellMesh = new THREE.Mesh(shellGeo, shellMat);
        this.group.add(this.shellMesh);

        // Inner & outer symmetric ghost shells driven by local stress tensor
        const ghostGeo = new THREE.OctahedronGeometry(62, 2);
        const innerGhostMat = new THREE.MeshBasicMaterial({
            color: 0x22d3ee,
            wireframe: false,
            transparent: true,
            opacity: cfg.ghostOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this.innerGhost = new THREE.Mesh(ghostGeo, innerGhostMat);

        const outerGhostGeo = new THREE.OctahedronGeometry(92, 2);
        const outerGhostMat = new THREE.MeshBasicMaterial({
            color: 0xff6a1a,
            wireframe: true,
            transparent: true,
            opacity: cfg.ghostOpacity * 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.outerGhost = new THREE.Mesh(outerGhostGeo, outerGhostMat);

        this.group.add(this.innerGhost, this.outerGhost);
    }

    _buildConnectors() {
        const cfg = this.cfg;
        const vertCount = this._maxPairs * 2;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
        geo.setDrawRange(0, 0);

        const mat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: cfg.connectorBaseOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.connectorLines = new THREE.LineSegments(geo, mat);
        this.connectorLines.frustumCulled = false;
        this.group.add(this.connectorLines);
    }

    _buildStressVectors() {
        const cfg = this.cfg;
        const vertCount = this._maxPairs * 2;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
        geo.setDrawRange(0, 0);

        const mat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: cfg.vectorFieldOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.vectorLines = new THREE.LineSegments(geo, mat);
        this.vectorLines.frustumCulled = false;
        this.group.add(this.vectorLines);
    }

    _sampleStressColor(normLoad, targetColor) {
        const t = Math.max(0, Math.min(1, normLoad));
        if (t < 0.45) {
            const k = t / 0.45;
            targetColor.setRGB(
                k * 1.0,
                0.94 + k * (0.55 - 0.94),
                1.0 + k * (0.10 - 1.0)
            );
        } else if (t < 0.85) {
            const k = (t - 0.45) / 0.40;
            targetColor.setRGB(
                1.0,
                0.55 + k * (0.22 - 0.55),
                0.10 + k * (0.0 - 0.10)
            );
        } else {
            // High / ceiling band: Deep Orange (1.0, 0.22, 0.0) -> Hot Magenta (1.0, 0.08, 0.42)
            const k = (t - 0.85) / 0.15;
            targetColor.setRGB(
                1.0,
                0.22 + k * (0.08 - 0.22),
                0.0 + k * (0.42 - 0.0)
            );
        }
        return targetColor;
    }

    setVisible(visible) {
        this.group.visible = Boolean(visible);
        if (!visible) {
            this.connectorLines.geometry.setDrawRange(0, 0);
            this.vectorLines.geometry.setDrawRange(0, 0);
        }
    }

    update({ nodes = [], pairs = [], worldScale = 1.0, dt = 0.016, intensity = 1.0, active = true }) {
        if (!active || !Array.isArray(nodes) || nodes.length === 0) {
            this.setVisible(false);
            return;
        }

        const telemetry = this.engine.evaluate({
            nodes,
            pairs,
            worldScale,
            referenceFrameManager: this.referenceFrameManager,
            hudConfig: window.hudConfig || null
        });

        this.setVisible(true);
        const safeDt = Math.min(0.05, Math.max(0.001, dt || 0.016));
        const cfg = this.cfg;
        const gain = Math.max(0.15, intensity);

        const meanLoad = telemetry.meanNormalizedStress;
        const imbalanceNorm = telemetry.imbalanceNorm ?? 0;
        const overEquilibrium = Math.max(-0.5, telemetry.overEquilibrium);
        const stressDrive = Math.max(0, overEquilibrium) * 0.6 + imbalanceNorm * 0.4;
        const anisoRate = Math.min(2.5, (telemetry.tensor?.anisotropicMag ?? 0) * 0.5);

        // Advance internal time proportionally to stress & imbalance so wave motion reflects mechanical energy
        const dynamicTimeStep = safeDt * (0.65 + stressDrive * 1.45 + anisoRate * 0.35);
        this._time += dynamicTimeStep;

        // Keep group at world origin so world-space connectors & vectors align with posA/posB/midpoint
        this.group.position.set(0, 0, 0);
        const center = telemetry.centroid;

        const posAttr = this.connectorLines.geometry.getAttribute('position');
        const colAttr = this.connectorLines.geometry.getAttribute('color');
        const vecPosAttr = this.vectorLines.geometry.getAttribute('position');
        const vecColAttr = this.vectorLines.geometry.getAttribute('color');

        const stressCol = new THREE.Color();
        const pairLimit = Math.min(telemetry.pairs.length, this._maxPairs);
        let drawVerts = 0;
        let vecVerts = 0;

        for (let i = 0; i < pairLimit; i++) {
            const p = telemetry.pairs[i];
            this._sampleStressColor(p.normalizedStress, stressCol);

            posAttr.setXYZ(drawVerts, p.posA.x, p.posA.y, p.posA.z);
            posAttr.setXYZ(drawVerts + 1, p.posB.x, p.posB.y, p.posB.z);
            colAttr.setXYZ(drawVerts, stressCol.r, stressCol.g, stressCol.b);
            colAttr.setXYZ(drawVerts + 1, stressCol.r, stressCol.g, stressCol.b);
            drawVerts += 2;

            // Smooth saturating curve from Hookean restoring force magnitude (avoids hard ceiling clipping)
            const rawVecLen = Math.abs(p.hookeanForceMag) * cfg.vectorFieldScale * gain * 0.05;
            const vecLen = cfg.maxVectorLength * (1.0 - Math.exp(-rawVecLen / Math.max(1e-4, cfg.maxVectorLength)));

            vecPosAttr.setXYZ(
                vecVerts,
                p.midpoint.x - p.axis.x * vecLen * 0.5,
                p.midpoint.y - p.axis.y * vecLen * 0.5,
                p.midpoint.z - p.axis.z * vecLen * 0.5
            );
            vecPosAttr.setXYZ(
                vecVerts + 1,
                p.midpoint.x + p.axis.x * vecLen * 0.5,
                p.midpoint.y + p.axis.y * vecLen * 0.5,
                p.midpoint.z + p.axis.z * vecLen * 0.5
            );
            vecColAttr.setXYZ(vecVerts, stressCol.r, stressCol.g, stressCol.b);
            vecColAttr.setXYZ(vecVerts + 1, stressCol.r, stressCol.g, stressCol.b);
            vecVerts += 2;
        }

        // Frame-aware deformation scaling for curved/warped reference frames
        const frameFactor = (telemetry.activeFrame === 'toroidal' || telemetry.activeFrame === 'hyperbolic')
            ? 0.85
            : 1.0;
        const deformMag = stressDrive * cfg.shellDeformAmp * frameFactor;

        // Elastic shell vertex deformation driven by stress excess & residual imbalance
        const shellPosAttr = this.shellMesh.geometry.getAttribute('position');
        const baseArr = this._shellBasePositions;
        for (let v = 0; v < shellPosAttr.count; v++) {
            const idx = v * 3;
            const bx = baseArr[idx];
            const by = baseArr[idx + 1];
            const bz = baseArr[idx + 2];
            const wave = 1.0 + deformMag * Math.sin(bx * 0.06 + by * 0.06 + this._time * 2.4);
            shellPosAttr.setXYZ(v, bx * wave, by * wave, bz * wave);
        }
        shellPosAttr.needsUpdate = true;

        const spinScale = 0.25 + stressDrive * 1.75 + anisoRate * 0.4;
        this.shellMesh.position.copy(center);
        this.shellMesh.scale.setScalar(worldScale);
        this.shellMesh.rotation.y += safeDt * 0.14 * spinScale;
        this.shellMesh.material.opacity = Math.min(
            0.48,
            (cfg.shellWireOpacity * (0.7 + stressDrive * 0.6)) * gain
        );

        // Symmetric stress-tensor ghost compression / expansion driven by stress & net force imbalance
        const tensorDelta = stressDrive * cfg.ghostStressScaleGain * frameFactor;
        this.innerGhost.position.copy(center);
        this.outerGhost.position.copy(center);
        this.innerGhost.scale.setScalar(Math.max(0.45, (cfg.ghostBaseScale - tensorDelta) * worldScale));
        this.outerGhost.scale.setScalar(Math.max(0.65, (cfg.ghostBaseScale + tensorDelta) * worldScale));
        this.innerGhost.rotation.y -= safeDt * 0.18 * (0.3 + stressDrive * 1.5);
        this.outerGhost.rotation.x += safeDt * 0.12 * (0.3 + imbalanceNorm * 1.6);
        this.innerGhost.material.opacity = Math.min(
            0.26,
            (cfg.ghostOpacity * (0.75 + imbalanceNorm * 0.5)) * gain
        );
        this.outerGhost.material.opacity = Math.min(
            0.24,
            (cfg.ghostOpacity * 0.85 * (0.75 + meanLoad * 0.5)) * gain
        );

        this.connectorLines.geometry.setDrawRange(0, drawVerts);
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        this.connectorLines.material.opacity = Math.min(
            cfg.connectorPeakOpacity,
            (cfg.connectorBaseOpacity + meanLoad * 0.25 + imbalanceNorm * 0.12) * gain
        );

        this.vectorLines.geometry.setDrawRange(0, vecVerts);
        vecPosAttr.needsUpdate = true;
        vecColAttr.needsUpdate = true;
        this.vectorLines.material.opacity = Math.min(
            0.68,
            (cfg.vectorFieldOpacity * (0.7 + stressDrive * 0.5)) * gain
        );
    }

    dispose() {
        if (this.group && this.scene) {
            this.scene.remove(this.group);
        }
        this.group.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    }
}