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

        this._cleanColor = new THREE.Color(0x10b981);
        this._degradedColor = new THREE.Color(0xef4444);
        this._tempColor = new THREE.Color();
    }

    enable() {
        if (this.active) return;
        this.active = true;
        this.group.visible = true;
        this.lastFrameType = null;
    }

    disable() {
        if (!this.active) return;
        this.active = false;
        this.group.visible = false;
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
        const x = (node.position ? node.position.x : (node.x || 0)) * worldScale;
        const y = (node.position ? node.position.y : (node.y || 0)) * worldScale;
        const z = (node.position ? node.position.z : (node.z || 0)) * worldScale;
        return outVec.set(x, y, z);
    }

    update(edges, nodes, time, noiseThreshold = 0.15, worldScale = 1.0) {
        if (!this.active) return;

        const safeEdges = Array.isArray(edges) ? edges : [];
        const safeNodes = Array.isArray(nodes) ? nodes : [];
        const currentFrameType = this.referenceFrameManager
            ? (this.referenceFrameManager.activeFrameType || this.referenceFrameManager.activeMode || 'open')
            : 'open';

        if (this.lastFrameType !== currentFrameType || Math.abs(this.lastWorldScale - worldScale) > 0.0001) {
            this.clearTubules();
            this.lastFrameType = currentFrameType;
            this.lastWorldScale = worldScale;
        }

        // Trim extra pools
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

        // Normalized noise pressure [0..1] for smooth SNR color & stability feedback
        const noiseRatio = THREE.MathUtils.clamp(noiseThreshold / 0.5, 0, 1);
        const tubeRadius = Math.max(0.6, 3.8 * worldScale);

        const startVec = new THREE.Vector3();
        const endVec = new THREE.Vector3();

        for (let idx = 0; idx < safeEdges.length; idx++) {
            const edge = safeEdges[idx];
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
                this._nodePos(sourceNode, worldScale, startVec);
                this._nodePos(targetNode, worldScale, endVec);

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

            if (!tubule) {
                tubule = this.createTubuleMesh(startVec, endVec, tubeRadius);
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

            // Compute SNR stress once before coloring, deforming, and pacing packets
            const edgeNoise = typeof edge.noise === 'number' ? THREE.MathUtils.clamp(edge.noise, 0, 1) : noiseRatio;
            const snrStress = THREE.MathUtils.clamp(Math.max(noiseRatio, edgeNoise), 0, 1);

            // --- Independent Tubule Pass ---
            tubule.mesh.visible = true;
            tubule.mesh.material.color.lerpColors(this._cleanColor, this._degradedColor, snrStress);
            tubule.mesh.material.opacity = THREE.MathUtils.lerp(0.15, 0.12, snrStress);
            this.deformTubuleMesh(tubule, time, snrStress, worldScale);

            // --- Independent Packet Pass + Tubule Highlight Coupling ---
            if (!packet) {
                packet = this.createPacketMesh(worldScale);
                this.packets[idx] = packet;
                this.group.add(packet.mesh);
            }

            packet.mesh.visible = true;
            const speed = THREE.MathUtils.lerp(0.38, 0.22, snrStress);
            packet.progress = (time * speed + idx * 0.27) % 1.0;
            packet.mesh.position.lerpVectors(startVec, endVec, packet.progress);

            const edgeFade = Math.min(
                THREE.MathUtils.smoothstep(packet.progress, 0.0, 0.12),
                THREE.MathUtils.smoothstep(1.0 - packet.progress, 0.0, 0.12)
            );
            const baseScale = Math.max(0.4, worldScale);
            packet.mesh.scale.setScalar(baseScale * THREE.MathUtils.lerp(0.35, 1.0, edgeFade));
            packet.mesh.material.opacity = THREE.MathUtils.lerp(0.15, 0.85, edgeFade);

            if (tubule.uniforms) {
                tubule.uniforms.uPacketPos.value.copy(packet.mesh.position);
                tubule.uniforms.uPacketActive.value = 1.0;
                tubule.uniforms.uPacketRadius.value = Math.max(14.0, tubeRadius * 5.5) * Math.max(0.5, worldScale);
            }
        }
    }

    createTubuleMesh(start, end, tubeRadius) {
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
        return { mesh, geometry, path, start: s, end: e, radius: tubeRadius, uniforms };
    }

    createPacketMesh(worldScale = 1.0) {
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
        return { mesh: packetMesh, progress: Math.random() };
    }

    deformTubuleMesh(tubule, time, snrStress, worldScale = 1.0) {
        const posAttr = tubule.geometry.attributes.position;
        const tubularSegments = 24;
        const radialSegments = 8;

        // Build orthonormal basis (tangent, normal, binormal) from edge direction
        const tangent = new THREE.Vector3().subVectors(tubule.end, tubule.start);
        if (tangent.lengthSq() < 1e-6) return;
        tangent.normalize();

        const upRef = Math.abs(tangent.y) < 0.95
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(1, 0, 0);

        const normal = new THREE.Vector3().crossVectors(tangent, upRef).normalize();
        const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

        // Continuous smooth undulation + high-noise interference ramp
        const waveAmp = snrStress * 1.25 * worldScale;
        const jagFactor = THREE.MathUtils.smoothstep(snrStress, 0.45, 1.0);
        const jagAmp = jagFactor * 2.2 * worldScale;

        const p = new THREE.Vector3();
        const offset = new THREE.Vector3();

        for (let i = 0; i <= tubularSegments; i++) {
            const u = i / tubularSegments;
            tubule.path.getPointAt(u, p);
            const env = Math.sin(u * Math.PI); // Pin both ends to source/target nodes

            // Smooth undulation in normal/binormal plane
            const waveN = Math.sin(time * 4.5 + u * 7.5) * waveAmp * env;
            const waveB = Math.cos(time * 3.8 + u * 6.5) * waveAmp * env;

            // Smoothly blended high-frequency interference when SNR degrades
            const jagN = jagAmp > 0.001
                ? (Math.sin(time * 19.0 + i * 3.7) * 0.65 + Math.cos(time * 31.0 + i * 7.1) * 0.35) * jagAmp * env
                : 0;
            const jagB = jagAmp > 0.001
                ? (Math.cos(time * 21.0 + i * 4.3) * 0.65 + Math.sin(time * 29.0 + i * 6.7) * 0.35) * jagAmp * env
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