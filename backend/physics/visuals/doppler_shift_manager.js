import * as THREE from 'three';
import {
    createDopplerShiftMaterial,
    createSearchlightBeamMaterial,
    createPairwiseTubuleMaterial,
    createDipoleCylinderMaterial
} from './doppler_shift_shader.js';

// =============================================================================
// DOPPLER_VISUAL_CONFIG — MASTER TUNING GUIDE
// =============================================================================
// Every parameter below is read live in update().
//   [↑] = What happens when you RAISE the value
//   [↓] = What happens when you LOWER the value
// =============================================================================
export const DOPPLER_VISUAL_CONFIG = {
    // --- Reference Wave Speed ---
    waveSpeed: 12.0,                // [↑] Smaller shift / wider cones      | [↓] Stronger shift / narrower cones

    // --- 1. Observer Rings (camera-facing Doppler rings on each node) ---
    observerBaseScale: 24.0,        // [↑] Larger ring around each node     | [↓] Tighter ring near node
    observerSpeedScale: 4.0,        // [↑] More ring growth with speed      | [↓] Steadier ring size

    // --- 2. Volumetric Cylindrical Dipoles (radial vectors around each node) ---
    dipoleRadius: 2.6,              // [↑] Thicker cylindrical dipole shaft | [↓] Slimmer cylindrical shaft
    dipoleBaseLength: 16.0,         // [↑] Longer dipole reach from node    | [↓] Shorter dipole shaft
    dipoleLengthSpeedGain: 22.0,    // [↑] Stretches more with radial speed | [↓] More uniform dipole length
    dipoleOpacity: 0.45,            // [↑] More opaque / solid cylinder     | [↓] More transparent / ghosted
    dipoleRadialSegments: 12,       // [↑] Smoother round cross-section     | [↓] Faster / more faceted cylinder

    // --- 3. Pairwise Undulating Tubules (wide sleeves between node pairs) ---
    tubuleBaseRadius: 7.5,         // [↑] Wider sleeve around node pairs     | [↓] Slimmer sleeve
    tubuleSpeedRadiusGain: 3.0,     // [↑] More radius change from closing/sep | [↓] Steadier radius
    tubuleZoomThinning: 0.70,       // [↑] Thinner when zoomed out (less blob)| [↓] Stays thicker when zoomed out
    tubuleMinRadius: 2.5,           // [↑] Minimum radius floor when zoomed out| [↓] Finer minimum sleeve
    tubuleWorldScaleFactor: 0.65,   // [↑] Scales thicker with worldScale  | [↓] Stays finer relative to frame (prevents blobbing)
    tubuleOpacity: 0.22,            // [↑] Stronger tubule visibility        | [↓] Softer translucent sleeve
    tubuleTwistSpeed: 2.2,          // [↑] Faster helical twist              | [↓] Slower twist
    tubuleWaveSpeed: 2.5,           // [↑] Faster wave undulation            | [↓] Slower undulation
    tubuleRibContrast: 0.55,        // [↑] Stronger moving wave rings        | [↓] Smoother gradient
    tubuleWaveAmp: 0.30,            // [↑] Deeper wave bend along span       | [↓] Gentler bend
    tubuleMinClosingVel: 0.015,     // [↑] Hide weaker closing/separating pairs | [↓] Show subtler relative motion
    tubuleMaxDist: 420.0,           // [↑] Allow wider-spaced pair tubules     | [↓] Drop distant pairs sooner

    // --- 4. 3D Searchlight Beam Cones (directional radial glow from nodes) ---
    beamBaseLength: 210.0,          // [↑] Longer physics cone throw        | [↓] Shorter cone throw
    beamSpeedLengthGain: 65.0,      // [↑] Fast nodes throw longer cones     | [↓] More uniform cone length
    beamWorldScaleInfluence: 0.0,   // [↑] Zoom slider stretches cone (0=off)| [↓] 0.0 = zoom-agnostic physics track
    beamWideSpread: 0.48,           // [↑] Wider cone angle at low speed     | [↓] Narrower spotlight cone
    beamNarrowingFactor: 0.24,      // [↑] Sharpens cone at high speed       | [↓] Keeps cone wider at high speed
    beamOpacity: 0.48,              // [↑] Brighter 3D cone glow             | [↓] Subtler cone glow
    beamAxialFalloff: 1.35,         // [↑] Fades sooner along beam axis      | [↓] Glow carries further out
    beamRadialFalloff: 1.10,        // [↑] Tighter inner beam core           | [↓] Wider radial glow across cone

    // --- 5. Reference Frame Mesh Highlights (synced to cone direction & spread) ---
    refMaxReach: 340.0,             // [↑] Highlights reach outer frame     | [↓] Highlights stay closer to node
    refReflectionStrength: 0.45,    // [↑] Stronger teal/red frame tint     | [↓] Lighter frame tint
    refAlphaBoost: 0.18             // [↑] Brighter frame lines under beam  | [↓] Less line brightness boost
};

const MAX_DOPPLER_NODES = 64;
const MAX_DOPPLER_PAIRS = 512;
const MAX_REF_BEAMS = 8;
const APEX_BEAM_RADIUS = 4.0; // [↑] Wider beam origin at node | [↓] Tighter pinhole apex at node

export class DopplerShiftManager {
    constructor(scene, referenceFrameManager = null) {
        this.scene = scene;
        this.refManager = referenceFrameManager;
        this.cfg = DOPPLER_VISUAL_CONFIG;
        this.waveSpeed = this.cfg.waveSpeed;

        this.subRenders = {
            observer: true,
            origin: true,
            pairwise: true,
            wavefront: true
        };

        this.group = new THREE.Group();
        this.group.name = 'doppler_shift_suite';
        this.group.visible = false;
        this.scene.add(this.group);

        this._camFallback = new THREE.Vector3(0, 180, 480);
        this._posA = new THREE.Vector3();
        this._posB = new THREE.Vector3();
        this._mid = new THREE.Vector3();
        this._dir = new THREE.Vector3();
        this._negDir = new THREE.Vector3();
        this._upAxis = new THREE.Vector3(0, 1, 0);
        this._quat = new THREE.Quaternion();
        this._dummy = new THREE.Object3D();
        this._color = new THREE.Color();

        this._beamOrigins = Array.from({ length: MAX_REF_BEAMS }, () => new THREE.Vector3());
        this._beamDirs = Array.from({ length: MAX_REF_BEAMS }, () => new THREE.Vector3(0, 0, 1));
        this._beamPolarities = new Float32Array(MAX_REF_BEAMS);
        this._beamSpreads = new Float32Array(MAX_REF_BEAMS);
        this._beamLengths = new Float32Array(MAX_REF_BEAMS);

        this._initObserverHalos();
        this._initDipoleCylinders();
        this._initPairwiseTubules();
        this._initSearchlightBeams();

        this.lastTelemetry = {
            activeNodes: 0,
            activePairs: 0,
            avgObserverShift: 1.0,
            maxBlueshift: 1.0,
            minRedshift: 1.0,
            avgOriginRadial: 0.0,
            avgPairwiseClosing: 0.0
        };
    }

    setSubRenderEnabled(name, enabled) {
        if (name in this.subRenders) {
            this.subRenders[name] = !!enabled;
        }
    }

    setVisible(visible) {
        this.group.visible = !!visible;
        if (!visible) {
            this.observerMesh.visible = false;
            this.dipoleMesh.visible = false;
            this.tubuleMesh.visible = false;
            this.searchlightMesh.visible = false;
            if (this.refManager?.dopplerUniforms) {
                this.refManager.dopplerUniforms.uDopplerActive.value = 0;
                this.refManager.dopplerUniforms.uBeamCount.value = 0;
            }
        }
    }

    _initObserverHalos() {
        const planeGeo = new THREE.PlaneGeometry(1, 1);
        this.observerShiftAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DOPPLER_NODES).fill(1.0), 1);
        this.observerRadialAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DOPPLER_NODES).fill(0.0), 1);
        planeGeo.setAttribute('aDopplerShift', this.observerShiftAttr);
        planeGeo.setAttribute('aRadialShift', this.observerRadialAttr);

        this.observerMaterial = createDopplerShiftMaterial();
        this.observerMesh = new THREE.InstancedMesh(planeGeo, this.observerMaterial, MAX_DOPPLER_NODES);
        this.observerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.observerMesh.frustumCulled = false;
        this.observerMesh.count = 0;
        this.observerMesh.visible = false;
        this.group.add(this.observerMesh);
    }

    _initDipoleCylinders() {
        const segs = Math.max(6, Math.round(this.cfg.dipoleRadialSegments || 12));
        // Unit cylinder shifted to y = [0, 1] so scale.y sets shaft length from base outward
        const cylGeo = new THREE.CylinderGeometry(1.0, 1.0, 1.0, segs, 4, false);
        cylGeo.translate(0, 0.5, 0);

        this.dipoleMaterial = createDipoleCylinderMaterial();
        this.dipoleMesh = new THREE.InstancedMesh(cylGeo, this.dipoleMaterial, MAX_DOPPLER_NODES);
        this.dipoleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.dipoleMesh.frustumCulled = false;
        this.dipoleMesh.count = 0;
        this.dipoleMesh.visible = false;

        const cyan = new THREE.Color(0x06b6d4);
        for (let i = 0; i < MAX_DOPPLER_NODES; i++) {
            this.dipoleMesh.setColorAt(i, cyan);
        }
        if (this.dipoleMesh.instanceColor) {
            this.dipoleMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }

        this.group.add(this.dipoleMesh);
    }

    _initPairwiseTubules() {
        const tubuleGeo = new THREE.CylinderGeometry(1.0, 1.0, 1.0, 16, 24, true);
        this.closingStateAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DOPPLER_PAIRS), 1);
        this.waveAmpAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DOPPLER_PAIRS), 1);
        tubuleGeo.setAttribute('aClosingState', this.closingStateAttr);
        tubuleGeo.setAttribute('aWaveAmp', this.waveAmpAttr);

        this.tubuleMaterial = createPairwiseTubuleMaterial();
        this.tubuleMesh = new THREE.InstancedMesh(tubuleGeo, this.tubuleMaterial, MAX_DOPPLER_PAIRS);
        this.tubuleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.tubuleMesh.frustumCulled = false;
        this.tubuleMesh.count = 0;
        this.tubuleMesh.visible = false;

        const violet = new THREE.Color(0xa78bfa);
        for (let i = 0; i < MAX_DOPPLER_PAIRS; i++) {
            this.tubuleMesh.setColorAt(i, violet);
        }
        if (this.tubuleMesh.instanceColor) {
            this.tubuleMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }

        this.group.add(this.tubuleMesh);
    }

    _initSearchlightBeams() {
        const coneGeo = new THREE.ConeGeometry(1.0, 1.0, 28, 16, true);
        coneGeo.translate(0, -0.5, 0);

        this.beamPolarityAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DOPPLER_NODES), 1);
        this.beamMachAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DOPPLER_NODES), 1);
        coneGeo.setAttribute('aShiftPolarity', this.beamPolarityAttr);
        coneGeo.setAttribute('aMachRatio', this.beamMachAttr);

        this.beamMaterial = createSearchlightBeamMaterial();
        this.searchlightMesh = new THREE.InstancedMesh(coneGeo, this.beamMaterial, MAX_DOPPLER_NODES);
        this.searchlightMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.searchlightMesh.frustumCulled = false;
        this.searchlightMesh.count = 0;
        this.searchlightMesh.visible = false;

        const teal = new THREE.Color(0x06b6d4);
        for (let i = 0; i < MAX_DOPPLER_NODES; i++) {
            this.searchlightMesh.setColorAt(i, teal);
        }
        if (this.searchlightMesh.instanceColor) {
            this.searchlightMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }

        this.group.add(this.searchlightMesh);
    }

    _getNodePosVel(node, worldScale) {
        const x = (node.position ? node.position.x : (node.x ?? 0)) * worldScale;
        const y = (node.position ? node.position.y : (node.y ?? 0)) * worldScale;
        const z = (node.position ? node.position.z : (node.z ?? 0)) * worldScale;
        const vx = node.vx ?? 0;
        const vy = node.vy ?? 0;
        const vz = node.vz ?? 0;
        return { x, y, z, vx, vy, vz };
    }

    update(nodes, pairs, camera, time, intensity = 1.0, worldScale = 1.0) {
        if (!Array.isArray(nodes) || nodes.length === 0) {
            this.setVisible(false);
            return;
        }

        this.setVisible(true);
        const cfg = this.cfg;
        this.waveSpeed = cfg.waveSpeed;

        const nodeCount = Math.min(nodes.length, MAX_DOPPLER_NODES);
        const camPos = camera ? camera.position : this._camFallback;
        const gain = Math.max(0.25, intensity);

        const showObserver = !!this.subRenders.observer;
        const showOrigin = !!this.subRenders.origin;
        const showPairwise = !!this.subRenders.pairwise;
        const showWavefront = !!this.subRenders.wavefront;

        this.observerMaterial.uniforms.uTime.value = time;
        this.observerMaterial.uniforms.uIntensity.value = intensity;

        if (this.beamMaterial.uniforms) {
            this.beamMaterial.uniforms.uTime.value = time;
            this.beamMaterial.uniforms.uIntensity.value = intensity;
            if (this.beamMaterial.uniforms.uBeamOpacity) this.beamMaterial.uniforms.uBeamOpacity.value = cfg.beamOpacity;
            if (this.beamMaterial.uniforms.uAxialFalloff) this.beamMaterial.uniforms.uAxialFalloff.value = cfg.beamAxialFalloff;
            if (this.beamMaterial.uniforms.uRadialFalloff) this.beamMaterial.uniforms.uRadialFalloff.value = cfg.beamRadialFalloff;
        }

        this.observerMesh.visible = showObserver;
        this.observerMesh.count = showObserver ? nodeCount : 0;
        this.searchlightMesh.visible = showWavefront;

        let dipoleCount = 0;
        let beamCount = 0;
        let refBeamCount = 0;

        let sumObsShift = 0;
        let maxBlue = 1.0;
        let minRed = 1.0;
        let sumOriginRad = 0;
        const refBeamCandidates = [];

        for (let i = 0; i < nodeCount; i++) {
            const { x, y, z, vx, vy, vz } = this._getNodePosVel(nodes[i], worldScale);
            const speed = Math.hypot(vx, vy, vz);

            // Single source of truth matching resolveSchemaNodeColor in hud_render.js (vx >= 0 Teal, vx < 0 Red)
            const nodeDopplerPolarity = vx >= 0 ? 1.0 : -1.0;

            // 1. Observer / Camera-Relative Doppler Ring
            const toCamX = camPos.x - x;
            const toCamY = camPos.y - y;
            const toCamZ = camPos.z - z;
            const camDist = Math.max(1e-4, Math.hypot(toCamX, toCamY, toCamZ));
            const vObs = (vx * toCamX + vy * toCamY + vz * toCamZ) / camDist;
            // Smooth tanh response: responsive in low-speed frames, non-clipping in high-speed frames
            const betaObs = 0.75 * Math.tanh(vObs / (this.waveSpeed * 0.55));
            const obsShift = 1.0 / (1.0 - betaObs);

            sumObsShift += obsShift;
            if (obsShift > maxBlue) maxBlue = obsShift;
            if (obsShift < minRed) minRed = obsShift;

            if (showObserver) {
                this._dummy.position.set(x, y, z);
                this._dummy.lookAt(camPos);
                this._dummy.rotation.z = 0;
                const haloScale = cfg.observerBaseScale + Math.min(26.0, Math.abs(vObs) * cfg.observerSpeedScale);
                this._dummy.scale.setScalar(haloScale);
                this._dummy.updateMatrix();
                this.observerMesh.setMatrixAt(i, this._dummy.matrix);
                this.observerShiftAttr.setX(i, obsShift);
                this.observerRadialAttr.setX(i, vObs);
            }

            // 2. Volumetric Cylindrical Dipoles (radial vectors relative to manifold origin)
            const origDist = Math.hypot(x, y, z);
            const rOrigX = origDist > 1e-4 ? -x / origDist : 0;
            const rOrigY = origDist > 1e-4 ? -y / origDist : 0;
            const rOrigZ = origDist > 1e-4 ? -z / origDist : 0;
            const vOrig = vx * rOrigX + vy * rOrigY + vz * rOrigZ;
            sumOriginRad += vOrig;

            if (showOrigin) {
                const absVOrig = Math.abs(vOrig);
                const maxDipoleGain = Math.max(28.0, cfg.dipoleLengthSpeedGain * 1.35);
                const smoothRadialGain = maxDipoleGain * (1.0 - Math.exp(-absVOrig * (cfg.dipoleLengthSpeedGain / 95.0)));
                const spokeLen = cfg.dipoleBaseLength + smoothRadialGain;
                const dirSign = vOrig >= 0 ? 1 : -1;
                this._dir.set(rOrigX * dirSign, rOrigY * dirSign, rOrigZ * dirSign);
                if (this._dir.lengthSq() < 1e-6) {
                    this._dir.set(0, 1, 0);
                } else {
                    this._dir.normalize();
                }

                this._quat.setFromUnitVectors(this._upAxis, this._dir);
                const scaleFactor = Math.max(0.75, worldScale);
                const startOffset = 6.5 * scaleFactor;
                const radius = cfg.dipoleRadius * scaleFactor;

                this._dummy.position.set(
                    x + this._dir.x * startOffset,
                    y + this._dir.y * startOffset,
                    z + this._dir.z * startOffset
                );
                this._dummy.quaternion.copy(this._quat);
                this._dummy.scale.set(radius, spokeLen, radius);
                this._dummy.updateMatrix();
                this.dipoleMesh.setMatrixAt(dipoleCount, this._dummy.matrix);

                if (Math.abs(vOrig) > 0.02) {
                    this._color.setHex(vOrig > 0 ? 0x06b6d4 : 0xf43f5e);
                } else {
                    this._color.setHex(0x64748b);
                }
                this.dipoleMesh.setColorAt(dipoleCount, this._color);
                dipoleCount++;
            }

            // 4. 3D Trajectory Searchlight Cone + Synced Reference Frame Projection
            if (showWavefront && speed > 0.03) {
                this._dir.set(vx / speed, vy / speed, vz / speed).normalize();
                this._negDir.copy(this._dir).negate();
                this._quat.setFromUnitVectors(this._upAxis, this._negDir);

                const machRatio = Math.min(0.88, speed / this.waveSpeed);
                const tanHalfAngle = Math.max(
                    0.16,
                    cfg.beamWideSpread - machRatio * cfg.beamNarrowingFactor + 0.025 * Math.sin(time * 2.5 + i)
                );
                const scaleMix = 1.0 + (Math.max(0.25, worldScale) - 1.0) * cfg.beamWorldScaleInfluence;
                const beamLength = (cfg.beamBaseLength + speed * cfg.beamSpeedLengthGain) * scaleMix;
                const mouthRadius = APEX_BEAM_RADIUS + beamLength * tanHalfAngle;

                this._dummy.position.set(x, y, z);
                this._dummy.quaternion.copy(this._quat);
                this._dummy.scale.set(mouthRadius, beamLength, mouthRadius);
                this._dummy.updateMatrix();
                this.searchlightMesh.setMatrixAt(beamCount, this._dummy.matrix);

                this.beamPolarityAttr.setX(beamCount, nodeDopplerPolarity);
                this.beamMachAttr.setX(beamCount, machRatio);
                beamCount++;

                this.beamPolarityAttr.setX(beamCount, nodeDopplerPolarity);
                this.beamMachAttr.setX(beamCount, machRatio);
                beamCount++;

                refBeamCandidates.push({
                    speed,
                    x, y, z,
                    dx: this._dir.x,
                    dy: this._dir.y,
                    dz: this._dir.z,
                    polarity: nodeDopplerPolarity,
                    spread: tanHalfAngle,
                    length: beamLength
                });
            }
        }

        this.searchlightMesh.count = beamCount;
        if (showWavefront) {
            this.searchlightMesh.instanceMatrix.needsUpdate = true;
            this.beamPolarityAttr.needsUpdate = true;
            this.beamMachAttr.needsUpdate = true;
        }

        if (showObserver) {
            this.observerMesh.instanceMatrix.needsUpdate = true;
            this.observerShiftAttr.needsUpdate = true;
            this.observerRadialAttr.needsUpdate = true;
        }

        this.dipoleMesh.visible = showOrigin;
        this.dipoleMesh.count = showOrigin ? dipoleCount : 0;
        if (this.dipoleMaterial.uniforms) {
            this.dipoleMaterial.uniforms.uTime.value = time;
            if (this.dipoleMaterial.uniforms.uOpacity) {
                this.dipoleMaterial.uniforms.uOpacity.value = cfg.dipoleOpacity;
            }
        }
        if (showOrigin) {
            this.dipoleMesh.instanceMatrix.needsUpdate = true;
            if (this.dipoleMesh.instanceColor) this.dipoleMesh.instanceColor.needsUpdate = true;
        }

        // 3. Pairwise Relative Doppler Undulating Tubules (read-only on physics state)
        const pairInputs = [];
        if (Array.isArray(pairs) && pairs.length > 0) {
            for (let p = 0; p < pairs.length && pairInputs.length < MAX_DOPPLER_PAIRS; p++) {
                const pair = pairs[p];
                if (!pair || pair.dist < 1e-3) continue;
                const a = pair.nodeA || pair.a;
                const b = pair.nodeB || pair.b;
                pairInputs.push({
                    ax: pair.ax, ay: pair.ay, az: pair.az,
                    bx: pair.bx, by: pair.by, bz: pair.bz,
                    dx: pair.dx, dy: pair.dy, dz: pair.dz,
                    dist: pair.dist,
                    vax: a?.vx ?? 0, vay: a?.vy ?? 0, vaz: a?.vz ?? 0,
                    vbx: b?.vx ?? 0, vby: b?.vy ?? 0, vbz: b?.vz ?? 0
                });
            }
        } else if (nodeCount > 1) {
            for (let i = 0; i < nodeCount && pairInputs.length < MAX_DOPPLER_PAIRS; i++) {
                const a = this._getNodePosVel(nodes[i], worldScale);
                for (let j = i + 1; j < nodeCount && pairInputs.length < MAX_DOPPLER_PAIRS; j++) {
                    const b = this._getNodePosVel(nodes[j], worldScale);
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const dz = b.z - a.z;
                    const dist = Math.hypot(dx, dy, dz);
                    if (dist < 1e-3) continue;
                    pairInputs.push({
                        ax: a.x, ay: a.y, az: a.z,
                        bx: b.x, by: b.y, bz: b.z,
                        dx, dy, dz, dist,
                        vax: a.vx, vay: a.vy, vaz: a.vz,
                        vbx: b.vx, vby: b.vy, vbz: b.vz
                    });
                }
            }
        }

        let tubuleCount = 0;
        let activeClosingCount = 0;
        let sumClosing = 0;
        this.tubuleMesh.visible = showPairwise;
        if (this.tubuleMaterial.uniforms) {
            this.tubuleMaterial.uniforms.uTime.value = time;
            if (this.tubuleMaterial.uniforms.uOpacity) this.tubuleMaterial.uniforms.uOpacity.value = Math.min(0.65, cfg.tubuleOpacity * gain);
            if (this.tubuleMaterial.uniforms.uTwistSpeed) this.tubuleMaterial.uniforms.uTwistSpeed.value = cfg.tubuleTwistSpeed;
            if (this.tubuleMaterial.uniforms.uWaveSpeed) this.tubuleMaterial.uniforms.uWaveSpeed.value = cfg.tubuleWaveSpeed;
            if (this.tubuleMaterial.uniforms.uRibContrast) this.tubuleMaterial.uniforms.uRibContrast.value = cfg.tubuleRibContrast;
        }
        if (this.tubuleMaterial.uniforms.uOpacity) {
            this.tubuleMaterial.uniforms.uOpacity.value = Math.min(0.38, cfg.tubuleOpacity * gain); // [↑] Higher max sleeve alpha | [↓] Cleaner center see-through
        }

        const minClosingVel = cfg.tubuleMinClosingVel ?? 0.015;
        const worldScaleFactor = cfg.tubuleWorldScaleFactor ?? 0.65;
        const effectiveScale = 1.0 + (Math.max(0.25, worldScale) - 1.0) * worldScaleFactor;
        const maxPairDist = (cfg.tubuleMaxDist ?? 420.0) * Math.max(0.5, effectiveScale);

        if (showPairwise) {
            for (let p = 0; p < pairInputs.length; p++) {
                const item = pairInputs[p];
                if (item.dist > maxPairDist) continue;

                const ux = item.dx / item.dist;
                const uy = item.dy / item.dist;
                const uz = item.dz / item.dist;

                const closingVel = (item.vbx - item.vax) * ux + (item.vby - item.vay) * uy + (item.vbz - item.vaz) * uz;
                if (Math.abs(closingVel) < minClosingVel) continue;

                sumClosing += closingVel;
                activeClosingCount++;

                this._posA.set(item.ax, item.ay, item.az);
                this._posB.set(item.bx, item.by, item.bz);
                this._mid.addVectors(this._posA, this._posB).multiplyScalar(0.5);

                this._dir.set(item.dx, item.dy, item.dz).normalize();
                this._quat.setFromUnitVectors(this._upAxis, this._dir);

                const zoomFactor = Math.max(0.25, effectiveScale);
                const thinning = 1.0 / Math.pow(zoomFactor, cfg.tubuleZoomThinning ?? 0.65);
                const absClosing = Math.abs(closingVel);
                const speedRadiusBoost = 5.5 * (1.0 - Math.exp(-absClosing * (cfg.tubuleSpeedRadiusGain / 12.0)));
                const rawRadius = cfg.tubuleBaseRadius + speedRadiusBoost;
                const radius = Math.max(cfg.tubuleMinRadius ?? 3.5, Math.min(rawRadius * thinning, item.dist * 0.22));

                this._dummy.position.copy(this._mid);
                this._dummy.quaternion.copy(this._quat);
                this._dummy.scale.set(radius, item.dist, radius);
                this._dummy.updateMatrix();
                this.tubuleMesh.setMatrixAt(tubuleCount, this._dummy.matrix);

                this.closingStateAttr.setX(tubuleCount, closingVel);
                const waveBoost = 0.65 * (1.0 - Math.exp(-absClosing * 0.35));
                this.waveAmpAttr.setX(tubuleCount, cfg.tubuleWaveAmp + waveBoost);

                if (closingVel > 0.01) {
                    this._color.setHex(0xa78bfa); // Closing: violet
                } else {
                    this._color.setHex(0xf97316); // Separating: orange
                }
                this.tubuleMesh.setColorAt(tubuleCount, this._color);
                tubuleCount++;
            }
        }

        this.tubuleMesh.count = tubuleCount;
        if (showPairwise) {
            this.tubuleMesh.instanceMatrix.needsUpdate = true;
            this.closingStateAttr.needsUpdate = true;
            this.waveAmpAttr.needsUpdate = true;
            if (this.tubuleMesh.instanceColor) this.tubuleMesh.instanceColor.needsUpdate = true;
        }

        // 5. Telemetry & Reference Frame Uniform Bridge
        this.lastTelemetry = {
            activeNodes: nodeCount,
            activePairs: tubuleCount,
            avgObserverShift: nodeCount > 0 ? Number((sumObsShift / nodeCount).toFixed(4)) : 1.0,
            maxBlueshift: Number(maxBlue.toFixed(4)),
            minRedshift: Number(minRed.toFixed(4)),
            avgOriginRadial: nodeCount > 0 ? Number((sumOriginRad / nodeCount).toFixed(4)) : 0.0,
            avgPairwiseClosing: activeClosingCount > 0 ? Number((sumClosing / activeClosingCount).toFixed(4)) : 0.0
        };
        window.dopplerTelemetry = this.lastTelemetry;

        if (this.refManager && this.refManager.dopplerUniforms) {
            const du = this.refManager.dopplerUniforms;
            du.uDopplerActive.value = 1;
            du.uDopplerShiftAvg.value = this.lastTelemetry.avgObserverShift;
            if (du.uDopplerTime) du.uDopplerTime.value = time;
            if (du.uRefStrength) du.uRefStrength.value = cfg.refReflectionStrength;
            if (du.uRefAlphaBoost) du.uRefAlphaBoost.value = cfg.refAlphaBoost;

            refBeamCandidates.sort((a, b) => b.speed - a.speed);
            refBeamCount = Math.min(MAX_REF_BEAMS, refBeamCandidates.length);
            if (du.uBeamCount) du.uBeamCount.value = refBeamCount;

            for (let b = 0; b < MAX_REF_BEAMS; b++) {
                if (b < refBeamCount) {
                    const cand = refBeamCandidates[b];
                    this._beamOrigins[b].set(cand.x, cand.y, cand.z);
                    this._beamDirs[b].set(cand.dx, cand.dy, cand.dz);
                    this._beamPolarities[b] = cand.polarity;
                    this._beamSpreads[b] = cand.spread;
                    this._beamLengths[b] = cand.length;

                    du.uBeamOrigins?.value?.[b]?.copy(this._beamOrigins[b]);
                    du.uBeamDirs?.value?.[b]?.copy(this._beamDirs[b]);
                    if (du.uBeamPolarities?.value) du.uBeamPolarities.value[b] = this._beamPolarities[b];
                    if (du.uBeamSpreads?.value) du.uBeamSpreads.value[b] = this._beamSpreads[b];
                    if (du.uBeamLengths?.value) du.uBeamLengths.value[b] = this._beamLengths[b];
                } else {
                    if (du.uBeamPolarities?.value) du.uBeamPolarities.value[b] = 0.0;
                    if (du.uBeamSpreads?.value) du.uBeamSpreads.value[b] = 0.25;
                    if (du.uBeamLengths?.value) du.uBeamLengths.value[b] = 0.0;
                }
            }
        }
    }

    dispose() {
        this.scene.remove(this.group);
        this.group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
    }
}