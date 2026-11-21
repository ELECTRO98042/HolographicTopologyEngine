import * as THREE from 'three';
import { ToroidalTopology } from './topologies/toroidal.js';
import { CubicLatticeTopology } from './topologies/cubic_lattice.js';
import { SphericalTopology } from './topologies/spherical.js';
import { HyperbolicTopology } from './topologies/hyperbolic.js';
import { OpenSpaceTopology } from './topologies/open_space.js';

export class ReferenceFrameManager {
    constructor(scene) {
        this.scene = scene;
        this.activeMode = 'open';
        this.activeFrameType = 'open';
        this.currentGeometryMesh = null;
        this.currentScale = 1.0;
        this.topologies = {
            'open': new OpenSpaceTopology(),
            'spheroid': new SphericalTopology(),
            'cubed': new CubicLatticeTopology(),
            'toroidal': new ToroidalTopology(),
            'hyperbolic': new HyperbolicTopology()
        };

        // Uniforms for thermal reference frame mesh interactions
        this.thermalUniforms = {
            uThermalCenters: { value: Array.from({ length: 16 }, () => new THREE.Vector3()) },
            uThermalHeats: { value: new Float32Array(16) },
            uThermalActive: { value: 0 }
        };

        // Pure EMP uniforms isolated strictly to reference frame interactions
        this.empUniforms = {
            uEmpCenters: { value: Array.from({ length: 16 }, () => new THREE.Vector3()) },
            uEmpRadii: { value: new Float32Array(16) },
            uEmpOpacities: { value: new Float32Array(16) }, // Added opacity tracking per ring
            uEmpActive: { value: 0 }
        };
        this.dopplerUniforms = {
            uDopplerActive: { value: 0 },
            uDopplerShiftAvg: { value: 1.0 },
            uDopplerTime: { value: 0 },
            uBeamOrigins: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
            uBeamDirs: { value: Array.from({ length: 8 }, () => new THREE.Vector3(0, 0, 1)) },
            uBeamPolarities: { value: new Float32Array(8) },
            uBeamSpreads: { value: new Float32Array(8).fill(0.25) },
            uBeamLengths: { value: new Float32Array(8) },
            uBeamCount: { value: 0 },
            uRefStrength: { value: 0.68 },   // [↑] Deeper frame tint     | [↓] Lighter frame tint
            uRefAlphaBoost: { value: 0.28 }  // [↑] Brighter frame lines  | [↓] Softer line boost
        };
    }

    setMode(mode, nodes) {
        this.activeFrameType = mode;
        this.activeMode = mode;

        if (this.topologies[mode] && typeof this.topologies[mode].calculateTargets === 'function') {
            this.topologies[mode].calculateTargets(nodes);
        }
    }

    setScale(scale) {
        this.currentScale = scale;
        if (this.currentGeometryMesh) {
            this.currentGeometryMesh.scale.set(scale, scale, scale);
        }
    }

    setEmpMode(active) {
        this.empUniforms.uEmpActive.value = active ? 1 : 0;
    }

    triggerEmpShockwave(centerPos, maxRadius = 60.0) {
        this.empUniforms.uEmpActive.value = 1;
        // Find an available slot in the 16-element rolling buffer
        const centers = this.empUniforms.uEmpCenters.value;
        const radii = this.empUniforms.uEmpRadii.value;

        let targetIdx = 0;
        let minRadius = radii[0];
        for (let i = 0; i < 16; i++) {
            if (radii[i] === 0.0) {
                targetIdx = i;
                break;
            }
            if (radii[i] < minRadius) {
                minRadius = radii[i];
                targetIdx = i;
            }
        }

        centers[targetIdx].copy(centerPos);
        radii[targetIdx] = 1.0; // Initial radius
    }

    update(time = 0) {
        // Animate active EMP shockwave radii outward in the shader uniform array
        const radii = this.empUniforms.uEmpRadii.value;
        let activeCount = 0;
        for (let i = 0; i < 16; i++) {
            if (radii[i] > 0.0 && radii[i] < 100.0) {
                radii[i] += 0.8; // Expansion speed
                activeCount++;
            } else if (radii[i] >= 100.0) {
                radii[i] = 0.0; // Reset expired wave
            }
        }
        if (activeCount === 0 && this.empUniforms.uEmpActive.value === 1) {
            // Keep active flag state synchronized
        }

        if (this.currentGeometryMesh && typeof this.currentGeometryMesh.updateMatrixWorld === 'function') {
            this.currentGeometryMesh.updateMatrixWorld(true);
        }

        if (this.topologies[this.activeFrameType] && typeof this.topologies[this.activeFrameType].update === 'function') {
            this.topologies[this.activeFrameType].update(time);
        }
    }

    setThermalMode(active) {
        this.thermalUniforms.uThermalActive.value = active ? 1 : 0;
    }

    updateThermalProximity(proximityData) {
        if (!proximityData) return;
        const count = Math.min(proximityData.length, 16);
        for (let i = 0; i < count; i++) {
            const data = proximityData[i];
            this.thermalUniforms.uThermalCenters.value[i].copy(data.position);
            this.thermalUniforms.uThermalHeats.value[i] = data.totalHeat;
        }
        for (let j = count; j < 16; j++) {
            this.thermalUniforms.uThermalHeats.value[j] = 0.0;
        }
    }

    async switchFrame(frameType, scale = this.currentScale || 1.0) {
        const targetType = this.topologies[frameType] ? frameType : 'open';
        console.log(`[ReferenceFrameManager] Switching frame to: ${targetType} at scale ${scale}`);

        if (this.currentGeometryMesh && this.scene) {
            this.scene.remove(this.currentGeometryMesh);
            this.currentGeometryMesh.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            this.currentGeometryMesh = null;
        }

        this.activeFrameType = targetType;
        this.activeMode = targetType;
        this.currentScale = scale;

        if (this.topologies[targetType] && this.scene) {
            try {
                const newMesh = this.topologies[targetType].createMesh(scale);
                if (newMesh) {
                    newMesh.traverse((child) => {
                        const isFloorPlane = child.position && Math.abs(child.position.y - (-80.0)) < 0.1;
                        const nameLower = (child.name || '').toLowerCase();
                        const isGroundElement = nameLower.includes('floor') || nameLower.includes('ground') || nameLower.includes('grid');

                        if ((child.isMesh || child.isLine || child.isPoints) && !child.isGridHelper && !isFloorPlane && !isGroundElement) {
                            child.frustumCulled = false;
                            if (child.material) {
                                child.material.transparent = true;
                                child.material.depthWrite = false;
                                if ('side' in child.material) {
                                    child.material.side = THREE.DoubleSide;
                                }

                                // Clean, single-pass unified shader injection for reference frame mesh reactions
                                child.material.onBeforeCompile = (shader) => {
                                    shader.uniforms.uEmpCenters = this.empUniforms.uEmpCenters;
                                    shader.uniforms.uEmpRadii = this.empUniforms.uEmpRadii;
                                    shader.uniforms.uEmpOpacities = this.empUniforms.uEmpOpacities; // Added: connects ring opacity to frame shader
                                    shader.uniforms.uEmpActive = this.empUniforms.uEmpActive;
                                    shader.uniforms.uThermalCenters = this.thermalUniforms.uThermalCenters;
                                    shader.uniforms.uThermalHeats = this.thermalUniforms.uThermalHeats;
                                    shader.uniforms.uThermalActive = this.thermalUniforms.uThermalActive;
                                    shader.uniforms.uDopplerActive = this.dopplerUniforms.uDopplerActive;
                                    shader.uniforms.uDopplerShiftAvg = this.dopplerUniforms.uDopplerShiftAvg;
                                    shader.uniforms.uDopplerTime = this.dopplerUniforms.uDopplerTime;
                                    shader.uniforms.uBeamOrigins = this.dopplerUniforms.uBeamOrigins;
                                    shader.uniforms.uBeamDirs = this.dopplerUniforms.uBeamDirs;
                                    shader.uniforms.uBeamPolarities = this.dopplerUniforms.uBeamPolarities;
                                    shader.uniforms.uBeamSpreads = this.dopplerUniforms.uBeamSpreads;
                                    shader.uniforms.uBeamLengths = this.dopplerUniforms.uBeamLengths;
                                    shader.uniforms.uBeamCount = this.dopplerUniforms.uBeamCount;
                                    shader.uniforms.uRefStrength = this.dopplerUniforms.uRefStrength;
                                    shader.uniforms.uRefAlphaBoost = this.dopplerUniforms.uRefAlphaBoost;


                                    shader.vertexShader = shader.vertexShader.replace(
                                        '#include <common>',
                                        `
                                        #include <common>
                                        varying vec3 vWorldPosition;
                                        `
                                    );
                                    shader.vertexShader = shader.vertexShader.replace(
                                        '#include <worldpos_vertex>',
                                        `
                                        #include <worldpos_vertex>
                                        vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
                                        `
                                    );

                                    shader.fragmentShader = shader.fragmentShader.replace(
                                        '#include <common>',
                                        `
                                        #include <common>
                                        varying vec3 vWorldPosition;
                                        uniform vec3 uEmpCenters[16];
                                        uniform float uEmpRadii[16];
                                        uniform float uEmpOpacities[16];
                                        uniform int uEmpActive;
                                        uniform vec3 uThermalCenters[16];
                                        uniform float uThermalHeats[16];
                                        uniform int uThermalActive;
                                        uniform int uDopplerActive;
                                        uniform float uDopplerShiftAvg;
                                        uniform float uDopplerTime;
                                        uniform vec3 uBeamOrigins[8];
                                        uniform vec3 uBeamDirs[8];
                                        uniform float uBeamPolarities[8];
                                        uniform float uBeamSpreads[8];
                                        uniform float uBeamLengths[8];
                                        uniform int uBeamCount;
                                        uniform float uRefStrength;
                                        uniform float uRefAlphaBoost;
                                        `
                                    );

                                    shader.fragmentShader = shader.fragmentShader.replace(
                                        '#include <dithering_fragment>',
                                        `
                                        #include <dithering_fragment>

                                        if (uEmpActive > 0) {
                                            for (int i = 0; i < 16; i++) {
                                                float radius = uEmpRadii[i];
                                                float ringOpacity = uEmpOpacities[i];

                                                if (radius > 0.0 && ringOpacity > 0.001) {
                                                    float dist = distance(vWorldPosition, uEmpCenters[i]);
                                                    // [↑] Wider shockwave band on frame | [↓] Sharper wavefront ring
                                                    float bandWidth = 10.0;
                                                    float ringDist = abs(dist - radius);

                                                    if (ringDist < bandWidth) {
                                                        float shock = pow(1.0 - ringDist / bandWidth, 1.8);
                                                        // [↑] Brighter EMP frame reflection | [↓] Subtler frame highlight (~12% trim from 2.2 -> 1.92)
                                                        float empRefGain = 1.92;
                                                        float intensity = shock * ringOpacity * empRefGain;

                                                        gl_FragColor.rgb += vec3(0.0, 0.94, 1.0) * intensity;
                                                        // [↑] Stronger alpha lift on frame lines | [↓] Softer line alpha contribution (~12% trim from 0.65 -> 0.57)
                                                        gl_FragColor.a = min(1.0, gl_FragColor.a + intensity * 0.57);
                                                    }
                                                }
                                            }
                                        }

                                        if (uThermalActive > 0) {
                                            for(int i = 0; i < 16; i++) {
                                                float heat = uThermalHeats[i];
                                                if (heat > 0.0) {
                                                    float dist = distance(vWorldPosition, uThermalCenters[i]);
                                                    float dissipation = exp(-dist * 0.015) * heat;
                                                    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.45, 0.1), dissipation * 0.6);
                                                    gl_FragColor.a = min(1.0, gl_FragColor.a + dissipation * 0.4);
                                                }
                                            }
                                        }
                                        if (uDopplerActive > 0) {
                                            for (int b = 0; b < 8; b++) {
                                                if (b >= uBeamCount) break;
                                                vec3 toFrag = vWorldPosition - uBeamOrigins[b];
                                                float along = dot(toFrag, uBeamDirs[b]);
                                                // [↑] Raise floor to reach further along beam | [↓] Lower floor to keep reflection tighter to source
                                                float maxReach = max(uBeamLengths[b], 320.0);
                                                if (along > 0.0 && along < maxReach) {
                                                    // [↑] Wider cone footprint on mesh | [↓] Tighter beam path tied closer to node trajectory
                                                    float coneRadius = 6.0 + along * (uBeamSpreads[b] * 1.05);
                                                    vec3 closestOnAxis = uBeamOrigins[b] + uBeamDirs[b] * along;
                                                    float radialDist = distance(vWorldPosition, closestOnAxis);

                                                    if (radialDist < coneRadius) {
                                                        // Higher exponents keep highlight tighter near node & along beam centerline
                                                        float radialSoft = pow(clamp(1.0 - radialDist / coneRadius, 0.0, 1.0), 1.45);
                                                        float axialDiffusion = pow(clamp(1.0 - along / maxReach, 0.0, 1.0), 1.35);
                                                        float sweep = 0.84 + 0.16 * sin(along * 0.045 - uDopplerTime * 4.0);

                                                        float reflection = radialSoft * axialDiffusion * sweep;
                                                        vec3 beaconCol = uBeamPolarities[b] >= 0.0
                                                            ? vec3(0.02, 0.78, 0.90) // Teal (#06b6d4)
                                                            : vec3(0.98, 0.25, 0.38); // Red  (#f43f5e)

                                                        gl_FragColor.rgb = mix(gl_FragColor.rgb, beaconCol, clamp(reflection * uRefStrength, 0.0, 0.85));
                                                        gl_FragColor.a = min(1.0, gl_FragColor.a + reflection * uRefAlphaBoost);
                                                    }
                                                }
                                            }
                                        }
                                        `
                                    );
                                };
                            }
                        }
                    });
                }
                this.currentGeometryMesh = newMesh;
                this.scene.add(this.currentGeometryMesh);
                console.log(`[ReferenceFrameManager] Successfully attached "${targetType}" to scene.`);
            } catch (err) {
                console.error(`[ReferenceFrameManager] EXCEPTION for ${targetType}:`, err);
            }
        }
    }

    applyConstraints(nodePositions) {
        if (this.activeFrameType === 'open' || !this.topologies[this.activeFrameType]) {
            return nodePositions;
        }
        return this.topologies[this.activeFrameType].enforceConstraints(nodePositions);
    }
}