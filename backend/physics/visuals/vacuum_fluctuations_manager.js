// backend/physics/visuals/vacuum_fluctuations_manager.js
import * as THREE from 'three';
import { createVacuumFoamMaterial } from './vacuum_fluctuations_shader.js';
import { VacuumFluctuationsEngine } from './vacuum_fluctuations_engine.js';

export const VACUUM_VISUAL_CONFIG = {
    // --- Background Vacuum Density (Lambda) & Ghost Aura Pulse Coupling ---
    lambdaDensity: 1.0,             // [↑] Denser vacuum medium & faster aura pulse | [↓] Sparser zero-point medium & slower pulse
    auraBasePulseHz: 1.35,          // [↑] Faster baseline node ghost-aura pulse    | [↓] Calmer, slower aura breathing
    auraPulseGain: 0.45,            // [↑] Stronger aura pulse swing from Lambda    | [↓] Gentler aura modulation
    auraRingOpacity: 0.16,          // [↑] More visible node ghost aura halo         | [↓] Subtler ghost aura around nodes

    // --- Volumetric Simplex/Perlin-Style Displacement & Inter-Shell Shimmer ---
    noiseFreq: 0.022,               // [↑] Finer-grained quantum foam cells           | [↓] Broader, smoother volumetric waves
    noiseSpeed: 0.32,               // [↑] Faster evolving background fluctuations    | [↓] Slower drift
    dispAmp: 12.0,                  // [↑] Deeper volumetric displacement             | [↓] Lighter micro-displacement
    shimmerOpacity: 0.18,           // [↑] Brighter inter-shell zero-point shimmer    | [↓] Softer background veil (keeps core clear)
    innerClearRadius: 48.0,         // [↑] Larger clear zone around inner core        | [↓] Closer zero-point field to center
    outerFieldRadius: 165.0         // [↑] Wider inter-shell outer reach             | [↓] Tighter outer field boundary
};

export class VacuumFluctuationsManager {
    constructor(scene, referenceFrameManager, containerSelector, config = {}) {
        this.scene = scene;
        this.referenceFrameManager = referenceFrameManager || window.referenceFrameManager || null;
        this.containerSelector = containerSelector;
        this.cfg = { ...VACUUM_VISUAL_CONFIG, ...config };
        this.group = new THREE.Group();
        this.group.name = 'VacuumFluctuationsLambdaGroup';
        this.group.visible = false;
        this.engine = new VacuumFluctuationsEngine();

        this._time = 0;
        this._maxAuras = 128;

        this._buildVolumetricField();
        this._buildNodeGhostAuras();

        if (this.scene) {
            this.scene.add(this.group);
        }
    }

    _buildVolumetricField() {
        const cfg = this.cfg;
        this.uniforms = {
            uTime: { value: 0 },
            uNoiseFreq: { value: cfg.noiseFreq },
            uNoiseSpeed: { value: cfg.noiseSpeed },
            uDispAmp: { value: cfg.dispAmp },
            uInnerRadius: { value: cfg.innerClearRadius },
            uOuterRadius: { value: cfg.outerFieldRadius },
            uLambdaDensity: { value: cfg.lambdaDensity },
            uShimmerOpacity: { value: cfg.shimmerOpacity },
            uIntensity: { value: 1.0 }
        };

        // Layered inter-shell spherical shells displaced by procedural noise
        const geo = new THREE.IcosahedronGeometry(118, 4);
        const mat = createVacuumFoamMaterial(this.uniforms);
        this.foamShell = new THREE.Mesh(geo, mat);
        this.group.add(this.foamShell);
    }

    _buildNodeGhostAuras() {
        const cfg = this.cfg;
        const ringGeo = new THREE.RingGeometry(4.5, 8.2, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x7dd3fc,
            transparent: true,
            opacity: cfg.auraRingOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.ghostAuraInstanced = new THREE.InstancedMesh(ringGeo, ringMat, this._maxAuras);
        this.ghostAuraInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.ghostAuraInstanced.frustumCulled = false;
        this.ghostAuraInstanced.count = 0;
        this.group.add(this.ghostAuraInstanced);
    }

    setVisible(visible) {
        this.group.visible = Boolean(visible);
        if (!visible && this.ghostAuraInstanced) {
            this.ghostAuraInstanced.count = 0;
        }
    }

    update({ nodes = [], pairs = [], worldScale = 1.0, dt = 0.016, intensity = 1.0, active = true, camera = null, referenceFrameManager = null, hudConfig = null }) {
        if (!active || !Array.isArray(nodes) || nodes.length === 0) {
            this.setVisible(false);
            return;
        }
        const safeDt = Math.min(0.05, Math.max(0.001, dt || 0.016));
        this._time += safeDt;
        const cfg = this.cfg;

        const telemetry = this.engine
            ? this.engine.evaluate({ nodes, pairs, worldScale, referenceFrameManager, hudConfig })
            : null;

        const lambdaDensity = telemetry?.lambdaDensity ?? cfg.lambdaDensity;
        const noiseSpeed = telemetry?.noiseSpeed ?? cfg.noiseSpeed;
        const dispAmp = telemetry?.dispAmp ?? cfg.dispAmp;
        const shimmerBrightnessBoost = 1.10;
        const pulseBrightnessBoost = 1.10;

        this.setVisible(true);

        // Use engine centroid if available, otherwise compute from nodes
        const center = telemetry?.centroid
            ? telemetry.centroid.clone()
            : (() => {
                const c = new THREE.Vector3();
                for (let i = 0; i < nodes.length; i++) {
                    const p = nodes[i]?.position || nodes[i]?.pos || nodes[i];
                    if (p && typeof p.x === 'number') c.add(p);
                }
                return c.multiplyScalar(1 / nodes.length);
            })();

        // Update volumetric inter-shell zero-point field uniforms
        this.uniforms.uTime.value = this._time;
        this.uniforms.uNoiseFreq.value = cfg.noiseFreq / Math.max(0.4, worldScale);
        this.uniforms.uNoiseSpeed.value = noiseSpeed;
        this.uniforms.uDispAmp.value = dispAmp * worldScale;
        this.uniforms.uInnerRadius.value = cfg.innerClearRadius * worldScale;
        this.uniforms.uOuterRadius.value = cfg.outerFieldRadius * worldScale;
        this.uniforms.uLambdaDensity.value = lambdaDensity;
        this.uniforms.uShimmerOpacity.value = Math.min(1.0, cfg.shimmerOpacity * shimmerBrightnessBoost);
        this.uniforms.uIntensity.value = intensity * shimmerBrightnessBoost;

        this.foamShell.position.copy(center);
        this.foamShell.rotation.y += safeDt * 0.05 * lambdaDensity;

        // Vacuum density governs baseline pulse rate across all node ghost auras
        const pulseRate = cfg.auraBasePulseHz * (0.5 + lambdaDensity * cfg.auraPulseGain);
        const pulseWave = 0.7 + 0.3 * Math.sin(this._time * Math.PI * 2.0 * pulseRate);
        this.ghostAuraInstanced.material.opacity = Math.min(
            0.31, // ~10% above the prior 0.28 ceiling
            cfg.auraRingOpacity * pulseBrightnessBoost * Math.max(0.25, intensity) * pulseWave
        );

        const count = Math.min(nodes.length, this._maxAuras);
        this.ghostAuraInstanced.count = count;

        const dummy = new THREE.Object3D();
        const nodePos = new THREE.Vector3();

        for (let i = 0; i < count; i++) {
            const p = nodes[i]?.position || nodes[i]?.pos || nodes[i];
            if (!p) continue;
            nodePos.set((p.x || 0) * worldScale, (p.y || 0) * worldScale, (p.z || 0) * worldScale);

            const phase = i * 0.73;
            const pulse = 0.5 + 0.5 * Math.sin(this._time * Math.PI * 2.0 * pulseRate + phase);
            const auraScale = (0.85 + pulse * 0.45) * Math.max(0.5, worldScale);

            dummy.position.copy(nodePos);
            if (camera) {
                dummy.lookAt(camera.position);
            }
            dummy.scale.setScalar(auraScale);
            dummy.updateMatrix();
            this.ghostAuraInstanced.setMatrixAt(i, dummy.matrix);
        }
        this.ghostAuraInstanced.instanceMatrix.needsUpdate = true;
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