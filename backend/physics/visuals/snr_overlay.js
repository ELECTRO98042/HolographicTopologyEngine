import * as THREE from '/js/vendor/graphics/three.js';

export class SNROverlay {
    constructor(scene, referenceFrameManager, containerSelector) {
        this.scene = scene;
        this.referenceFrameManager = referenceFrameManager;
        this.container = document.querySelector(containerSelector);

        this.group = new THREE.Group();
        this.group.name = 'overlay_snr_tubules';
        this.scene.add(this.group);

        this.tubules = [];
        this.packets = [];
        this.active = false;
        this.lastFrameType = null;
        this.lastWorldScale = 1.0;
        this.lastTime = null;

        this._cleanColor = new THREE.Color(0x10b981);
        this._degradedColor = new THREE.Color(0xef4444);
        this._tempColor = new THREE.Color();
    }

    enable() {
        if (this.active) return;
        this.active = true;
        this.group.visible = true;
        this.lastFrameType = null;
        this.lastTime = null;
    }

    disable() {
        if (!this.active) return;
        this.active = false;
        this.group.visible = false;
        this.lastTime = null;
        this.clearTubules();
    }

    clearTubules() {
        this.tubules.forEach(t => {
            if (!t) return;
            this.group.remove(t.mesh);
            if (t.geometry) t.geometry.dispose();
            if (t.material) t.material.dispose();
        });
        this.tubules = [];

        this.packets.forEach(p => {
            if (!p) return;
            this.group.remove(p.mesh);
            if (p.mesh.geometry) p.mesh.geometry.dispose();
            if (p.mesh.material) p.mesh.material.dispose();
        });
        this.packets = [];
    }

    _resolveNode(nodes, ref) {
        if (!ref) return null;
        if (typeof ref === 'object') return ref;
        return nodes.find(n => String(n.id) === String(ref) || String(n.name) === String(ref)) || null;
    }

    _nodePos(node, worldScale, outVec) {
        const x = (node?.position && typeof node.position.x === 'number' ? node.position.x : (node?.x ?? 0)) * worldScale;
        const y = (node?.position && typeof node.position.y === 'number' ? node.position.y : (node?.y ?? 0)) * worldScale;
        const z = (node?.position && typeof node.position.z === 'number' ? node.position.z : (node?.z ?? 0)) * worldScale;
        return outVec.set(x, y, z);
    }

    _nodeSpeed(node) {
        if (!node) return 0;
        const vx = typeof node.vx === 'number' ? node.vx : (node.velocity?.x ?? 0);
        const vy = typeof node.vy === 'number' ? node.vy : (node.velocity?.y ?? 0);
        const vz = typeof node.vz === 'number' ? node.vz : (node.velocity?.z ?? 0);
        if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) return 0;
        return Math.hypot(vx, vy, vz);
    }

    _computeDt(time) {
        if (typeof time !== 'number' || !Number.isFinite(time)) {
            this.lastTime = null;
            return 1 / 60;
        }
        if (this.lastTime === null) {
            this.lastTime = time;
            return 1 / 60;
        }
        const rawDt = time - this.lastTime;
        this.lastTime = time;
        if (!Number.isFinite(rawDt) || rawDt <= 0) return 0;
        return Math.min(rawDt, 0.1);
    }

    update(edges, nodes, time, noiseThreshold = 0.15, worldScale = 1.0) {
        if (!this.active) return;

        const safeEdges = Array.isArray(edges) ? edges : [];
        const safeNodes = Array.isArray(nodes) ? nodes : [];
        const safeScale = Number.isFinite(worldScale) && worldScale > 0 ? worldScale : 1.0;
        const dt = this._computeDt(time);

        const currentFrameType = this.referenceFrameManager
            ? (this.referenceFrameManager.activeFrameType || this.referenceFrameManager.activeMode || 'open')
            : 'open';

        if (this.lastFrameType !== currentFrameType || Math.abs(this.lastWorldScale - safeScale) > 0.0001) {
            this.clearTubules();
            this.lastFrameType = currentFrameType;
            this.lastWorldScale = safeScale;
        }

        while (this.tubules.length > safeEdges.length) {
            const t = this.tubules.pop();
            if (t) {
                this.group.remove(t.mesh);
                t.geometry.dispose();
                t.material.dispose();
            }
        }
        while (this.packets.length > safeEdges.length) {
            const p = this.packets.pop();
            if (p) {
                this.group.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
            }
        }

        const noiseRatio = THREE.MathUtils.clamp((noiseThreshold ?? 0.15) / 0.5, 0, 1);
        const tubeRadius = Math.max(0.6, 3.8 * safeScale);

        const startVec = new THREE.Vector3();
        const endVec = new THREE.Vector3();

        for (let idx = 0; idx < safeEdges.length; idx++) {
            const edge = safeEdges[idx];
            if (!edge) continue;

            const srcKey = typeof edge.source === 'object' && edge.source !== null
                ? (edge.source.id || edge.source.name)
                : (edge.source ?? edge.from);
            const tgtKey = typeof edge.target === 'object' && edge.target !== null
                ? (edge.target.id || edge.target.name)
                : (edge.target ?? edge.to);

            const sourceNode = this._resolveNode(safeNodes, srcKey);
            const targetNode = this._resolveNode(safeNodes, tgtKey);

            let tubule = this.tubules[idx];
            let packet = this.packets[idx];
            let useCachedEndpoints = false;

            if (!sourceNode || !targetNode) {
                if (tubule && tubule.start && tubule.end) {
                    startVec.copy(tubule.start);
                    endVec.copy(tubule.end);
                    tubule.mesh.visible = true;
                    useCachedEndpoints = true;
                } else {
                    if (tubule) tubule.mesh.visible = false;
                    if (packet) packet.mesh.visible = false;
                    continue;
                }
            }

            if (!useCachedEndpoints) {
                this._nodePos(sourceNode, safeScale, startVec);
                this._nodePos(targetNode, safeScale, endVec);

                if (this.referenceFrameManager && typeof this.referenceFrameManager.transformPosition === 'function') {
                    this.referenceFrameManager.transformPosition(startVec, currentFrameType);
                    this.referenceFrameManager.transformPosition(endVec, currentFrameType);
                }

                if (startVec.distanceToSquared(endVec) < 0.0001) {
                    if (tubule && tubule.start && tubule.end && tubule.start.distanceToSquared(tubule.end) >= 0.0001) {
                        startVec.copy(tubule.start);
                        endVec.copy(tubule.end);
                        tubule.mesh.visible = true;
                    } else {
                        if (tubule) tubule.mesh.visible = false;
                        if (packet) packet.mesh.visible = false;
                        continue;
                    }
                }
            }

            const currentLen = startVec.distanceTo(endVec);

            if (!tubule) {
                tubule = this.createTubuleMesh(startVec, endVec, tubeRadius, currentLen);
                this.tubules[idx] = tubule;
                this.group.add(tubule.mesh);
            } else {
                const endpointsChanged =
                    tubule.start.distanceToSquared(startVec) > 0.0004 ||
                    tubule.end.distanceToSquared(endVec) > 0.0004 ||
                    Math.abs(tubule.radius - tubeRadius) > 0.01;

                if (endpointsChanged) {
                    tubule.geometry.dispose();
                    tubule.start.copy(startVec);
                    tubule.end.copy(endVec);
                    tubule.radius = tubeRadius;
                    tubule.path = new THREE.LineCurve3(tubule.start, tubule.end);
                    tubule.geometry = new THREE.TubeGeometry(tubule.path, 24, tubeRadius, 8, false);
                    tubule.mesh.geometry = tubule.geometry;
                }
            }

            if (!Number.isFinite(tubule.restLength) || tubule.restLength <= 1e-3) {
                tubule.restLength = Math.max(currentLen, 1.0);
            } else {
                // Gently adapt baseline toward settled length so frame transitions don't lock in permanent strain
                tubule.restLength = THREE.MathUtils.lerp(tubule.restLength, currentLen, Math.min(1, dt * 0.15));
            }

            const edgeStrain = THREE.MathUtils.clamp(
                Math.abs(currentLen - tubule.restLength) / Math.max(1.0, tubule.restLength),
                0,
                1.5
            );

            const speedA = this._nodeSpeed(sourceNode);
            const speedB = this._nodeSpeed(targetNode);
            const meanSpeed = (speedA + speedB) * 0.5;
            const kineticDrive = THREE.MathUtils.clamp(meanSpeed * 0.12, 0, 2.0);
            const physicsDrive = Math.min(2.5, kineticDrive + edgeStrain * 1.2);

            const edgeNoise = typeof edge.noise === 'number' ? THREE.MathUtils.clamp(edge.noise, 0, 1) : noiseRatio;
            const snrStress = THREE.MathUtils.clamp(Math.max(noiseRatio, edgeNoise), 0, 1);

            // --- Physics-Driven Tubule Wave & Stress Pass ---
            tubule.mesh.visible = true;
            tubule.mesh.material.color.lerpColors(this._cleanColor, this._degradedColor, snrStress);
            tubule.mesh.material.opacity = THREE.MathUtils.lerp(0.15, 0.12, snrStress);

            // Advance tubule wave phase by real node kinetic activity + strain
            tubule.wavePhase = (tubule.wavePhase ?? (idx * 0.7)) + dt * (0.6 + physicsDrive * 4.2);
            this.deformTubuleMesh(tubule, tubule.wavePhase, snrStress, physicsDrive, edgeStrain, safeScale);

            // --- Physics-Driven Packet Transit & Wake Pass ---
            if (!packet) {
                packet = this.createPacketMesh(safeScale, idx);
                this.packets[idx] = packet;
                this.group.add(packet.mesh);
            }

            packet.mesh.visible = true;
            const baseRate = THREE.MathUtils.lerp(0.28, 0.14, snrStress);
            const packetRate = baseRate * (0.25 + physicsDrive * 0.85);
            packet.progress = (packet.progress + dt * packetRate) % 1.0;
            packet.mesh.position.lerpVectors(startVec, endVec, packet.progress);

            const edgeFade = Math.min(
                THREE.MathUtils.smoothstep(packet.progress, 0.0, 0.12),
                THREE.MathUtils.smoothstep(1.0 - packet.progress, 0.0, 0.12)
            );
            const baseScale = Math.max(0.4, safeScale);
            const energyScale = 1.0 + Math.min(0.45, physicsDrive * 0.2);
            packet.mesh.scale.setScalar(baseScale * energyScale * THREE.MathUtils.lerp(0.35, 1.0, edgeFade));
            packet.mesh.material.opacity = THREE.MathUtils.lerp(0.15, 0.85, edgeFade);

            if (tubule.uniforms) {
                tubule.uniforms.uPacketPos.value.copy(packet.mesh.position);
                tubule.uniforms.uPacketActive.value = 1.0;
                tubule.uniforms.uPacketRadius.value =
                    Math.max(14.0, tubeRadius * (5.5 + Math.min(3.5, physicsDrive * 1.5))) *
                    Math.max(0.5, safeScale);
            }
        }
    }

    createTubuleMesh(start, end, tubeRadius, initialLength = 1.0) {
        const s = start.clone();
        const e = end.clone();
        const path = new THREE.LineCurve3(s, e);
        const geometry = new THREE.TubeGeometry(path, 24, tubeRadius, 8, false);

        const uniforms = {
            uPacketPos: { value: new THREE.Vector3() },
            uPacketActive: { value: 0.0 },
            uPacketRadius: { value: Math.max(12.0, tubeRadius * 5.5) }
        };

        const material = new THREE.MeshBasicMaterial({
            color: 0x10b981,
            wireframe: true,
            transparent: true,
            opacity: 0.15,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        material.onBeforeCompile = (shader) => {
            shader.uniforms.uPacketPos = uniforms.uPacketPos;
            shader.uniforms.uPacketActive = uniforms.uPacketActive;
            shader.uniforms.uPacketRadius = uniforms.uPacketRadius;

            shader.vertexShader = shader.vertexShader
                .replace(
                    '#include <common>',
                    `#include <common>
                 varying vec3 vWorldPos;`
                )
                .replace(
                    '#include <worldpos_vertex>',
                    `#include <worldpos_vertex>
                 vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
                );

            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <common>',
                    `#include <common>
                 varying vec3 vWorldPos;
                 uniform vec3 uPacketPos;
                 uniform float uPacketActive;
                 uniform float uPacketRadius;`
                )
                .replace(
                    '#include <dithering_fragment>',
                    `#include <dithering_fragment>
                 if (uPacketActive > 0.5) {
                     float d = distance(vWorldPos, uPacketPos);
                     float band = 1.0 - smoothstep(0.0, uPacketRadius, d);
                     float pulse = pow(band, 1.8);
                     gl_FragColor.rgb += vec3(1.0, 0.65, 0.15) * pulse * 0.45;
                     gl_FragColor.a = min(1.0, gl_FragColor.a + pulse * 0.35);
                 }`
                );
        };
        material.customProgramCacheKey = () => 'snr-tubule-packet-wake-v1';

        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        return {
            mesh,
            geometry,
            path,
            start: s,
            end: e,
            radius: tubeRadius,
            restLength: Math.max(initialLength, 1.0),
            wavePhase: 0,
            uniforms
        };
    }

    createPacketMesh(worldScale = 1.0, idx = 0) {
        const packetGeo = new THREE.SphereGeometry(1.3, 8, 8);
        const packetMat = new THREE.MeshBasicMaterial({
            color: 0xff8800,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const packetMesh = new THREE.Mesh(packetGeo, packetMat);
        packetMesh.frustumCulled = false;
        packetMesh.scale.setScalar(Math.max(0.4, worldScale));
        return { mesh: packetMesh, progress: (idx * 0.27) % 1.0 };
    }

    deformTubuleMesh(tubule, wavePhase, snrStress, physicsDrive = 0, edgeStrain = 0, worldScale = 1.0) {
        const posAttr = tubule.geometry.attributes.position;
        const tubularSegments = 24;
        const radialSegments = 8;

        const tangent = new THREE.Vector3().subVectors(tubule.end, tubule.start);
        if (tangent.lengthSq() < 1e-6) return;
        tangent.normalize();

        const upRef = Math.abs(tangent.y) < 0.95
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(1, 0, 0);

        const normal = new THREE.Vector3().crossVectors(tangent, upRef).normalize();
        const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

        // Wave amplitude scales with SNR stress + physical strain/motion
        const motionBoost = 0.2 + Math.min(1.2, physicsDrive * 0.5 + edgeStrain * 0.8);
        const waveAmp = (snrStress * 1.25 + edgeStrain * 0.9) * motionBoost * worldScale;
        const jagFactor = THREE.MathUtils.smoothstep(snrStress + edgeStrain * 0.35, 0.45, 1.0);
        const jagAmp = jagFactor * 2.2 * (0.4 + Math.min(1.0, physicsDrive * 0.5)) * worldScale;

        const p = new THREE.Vector3();
        const offset = new THREE.Vector3();

        for (let i = 0; i <= tubularSegments; i++) {
            const u = i / tubularSegments;
            tubule.path.getPointAt(u, p);
            const env = Math.sin(u * Math.PI);

            const waveN = Math.sin(wavePhase + u * 7.5) * waveAmp * env;
            const waveB = Math.cos(wavePhase * 0.85 + u * 6.5) * waveAmp * env;

            const jagN = jagAmp > 0.001
                ? (Math.sin(wavePhase * 4.2 + i * 3.7) * 0.65 + Math.cos(wavePhase * 6.8 + i * 7.1) * 0.35) * jagAmp * env
                : 0;
            const jagB = jagAmp > 0.001
                ? (Math.cos(wavePhase * 4.6 + i * 4.3) * 0.65 + Math.sin(wavePhase * 6.4 + i * 6.7) * 0.35) * jagAmp * env
                : 0;

            for (let j = 0; j <= radialSegments; j++) {
                const idx = i * (radialSegments + 1) + j;
                if (idx >= posAttr.count) continue;

                const angle = (j / radialSegments) * Math.PI * 2;
                const radialN = Math.cos(angle) * tubule.radius + waveN + jagN;
                const radialB = Math.sin(angle) * tubule.radius + waveB + jagB;

                offset
                    .set(0, 0, 0)
                    .addScaledVector(normal, radialN)
                    .addScaledVector(binormal, radialB);

                posAttr.setXYZ(idx, p.x + offset.x, p.y + offset.y, p.z + offset.z);
            }
        }

        posAttr.needsUpdate = true;
    }
}