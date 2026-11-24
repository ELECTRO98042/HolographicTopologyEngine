/**
 * EMP Overlay Module (v2.8.9 Modular Extension)
 * Implements auxiliary expanding electromagnetic pulse spheres/rings 
 * with synchronized Temporal Motion Speed, world scaling, and ghosted cyan opacity.
 */

import * as THREE from 'three';

export class EmpOverlay {
    constructor(scene, referenceFrameManager, uiContainerSelector = '#deck-body-content') {
        this.scene = scene;
        this.frameManager = referenceFrameManager;
        this.uiContainerSelector = uiContainerSelector;
        this.active = false;

        this.empGroup = new THREE.Group();
        this.empGroup.name = 'EmpOverlayGroup';

        this.pulseRings = [];
        this.uiElement = null;
        this.pulseTimer = 0;
    }

    enable() {
        if (this.active) return;
        this.active = true;
        this.pulseTimer = 1.4; // Trigger immediately on enable

        this.scene.add(this.empGroup);
        this._injectControlDeckUI();

        if (this.frameManager && typeof this.frameManager.setEmpMode === 'function') {
            this.frameManager.setEmpMode(true);
        }
    }

    disable() {
        if (!this.active) return;
        this.active = false;

        this.scene.remove(this.empGroup);
        this._removeControlDeckUI();

        this.pulseRings.forEach(pulse => {
            this.empGroup.remove(pulse.mesh);
            pulse.mesh.geometry.dispose();
            pulse.mesh.material.dispose();
        });
        this.pulseRings = [];

        if (this.frameManager && typeof this.frameManager.setEmpMode === 'function') {
            this.frameManager.setEmpMode(false);
        }
    }

    triggerPulse(centerPos, maxRadius = 180.0, worldScale = 1.0, strength = 0.5) {
        if (!this.active) return;

        const clampedStrength = Math.max(0.0, Math.min(1.0, strength));
        const geometry = new THREE.SphereGeometry(1.0, 28, 20);

        // Subtle non-wireframe ghost shell so it doesn't tangle with manifold wireframes
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0x00f0ff),
            wireframe: false,
            transparent: true,
            opacity: 0.03,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false
        });

        const pulseMesh = new THREE.Mesh(geometry, material);
        pulseMesh.position.copy(centerPos);

        const pulseData = {
            mesh: pulseMesh,
            radius: 1.0 * worldScale,
            maxRadius: maxRadius,
            speed: (125.0 + clampedStrength * 45.0) * worldScale,
            strength: clampedStrength
        };

        this.empGroup.add(pulseMesh);
        this.pulseRings.push(pulseData);

        if (this.frameManager && typeof this.frameManager.triggerEmpShockwave === 'function') {
            try {
                this.frameManager.triggerEmpShockwave(centerPos, maxRadius);
            } catch (err) {
                console.warn('[EmpOverlay] Mesh-side shockwave dispatch deferred:', err);
            }
        }
    }

    update(nodeDataArray, deltaTime, motionSpeed = 1.0, worldScale = 1.0) {
        if (!this.active) return;

        const dt = deltaTime || 0.016;
        const scaledDt = dt * motionSpeed;

        if (!this.nodeTimers) {
            this.nodeTimers = new Map();
        }

        // Evaluate each node independently as a standalone physical wave source
        if (Array.isArray(nodeDataArray)) {
            const activeKeys = new Set();

            nodeDataArray.forEach((node, idx) => {
                const key = node.id || node.name || `node-${idx}`;
                activeKeys.add(key);

                let nodeTimer = this.nodeTimers.get(key);
                if (!nodeTimer) {
                    nodeTimer = {
                        time: Math.random() * 1.5,
                        interval: 1.4 + (idx * 0.3) % 1.2
                    };
                    this.nodeTimers.set(key, nodeTimer);
                }

                nodeTimer.time += scaledDt;

                const vx = node.vx || 0;
                const vy = node.vy || 0;
                const vz = node.vz || 0;
                const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);

                // 1. Compute and declare effectiveSpeed BEFORE dynamicInterval and maxRadius
                const rawNorm = Math.max(0, Math.min(1, speed / 3.0));
                const prevSmooth = typeof node._empSmoothNorm === 'number' ? node._empSmoothNorm : rawNorm;
                const smoothAlpha = 1.0 - Math.exp(-scaledDt * 2.4);
                const smoothNorm = prevSmooth + (rawNorm - prevSmooth) * smoothAlpha;
                node._empSmoothNorm = smoothNorm;
                const effectiveSpeed = smoothNorm * 3.0;
                // Stronger smoothed EM excitation -> larger ghost radius, weaker -> smaller radius
                const radiusScale = 0.78 + smoothNorm * 0.52; // ~0.78x to 1.30x
                const maxRadius = (160.0 + effectiveSpeed * 24.0) * radiusScale * worldScale;

                // 2. Now safe to use effectiveSpeed in both dynamicInterval and maxRadius
                const dynamicInterval = Math.max(0.85, nodeTimer.interval / (1.0 + effectiveSpeed * 0.12));

                if (nodeTimer.time >= dynamicInterval) {
                    nodeTimer.time = 0;
                    const px = (node.position ? node.position.x : (node.x || 0)) * worldScale;
                    const py = (node.position ? node.position.y : (node.y || 0)) * worldScale;
                    const pz = (node.position ? node.position.z : (node.z || 0)) * worldScale;

                    // Stronger smoothed EM excitation -> larger ghost radius, weaker -> smaller radius
                    const radiusScale = 0.78 + smoothNorm * 0.52; // ~0.78x to 1.30x
                    const maxRadius = (160.0 + effectiveSpeed * 24.0) * radiusScale * worldScale;
                    this.triggerPulse(new THREE.Vector3(px, py, pz), maxRadius, worldScale, smoothNorm);
                }
            });

            for (const key of this.nodeTimers.keys()) {
                if (!activeKeys.has(key)) {
                    this.nodeTimers.delete(key);
                }
            }
        }

        // Animate auxiliary expanding pulse spheres
        for (let i = this.pulseRings.length - 1; i >= 0; i--) {
            const pulse = this.pulseRings[i];
            pulse.radius += pulse.speed * scaledDt;
            pulse.mesh.scale.set(pulse.radius, pulse.radius, pulse.radius);

            const lifeProgress = pulse.radius / pulse.maxRadius;
            pulse.mesh.material.opacity = Math.max(0.0, 0.05 * (1.0 - lifeProgress));

            if (pulse.radius >= pulse.maxRadius || pulse.mesh.material.opacity <= 0.01) {
                this.empGroup.remove(pulse.mesh);
                pulse.mesh.geometry.dispose();
                pulse.mesh.material.dispose();
                this.pulseRings.splice(i, 1);
            }
        }

        // --- Unified Parity Feed: Sync active pulse rings directly to shader uniforms ---
        if (this.frameManager && this.frameManager.empUniforms) {
            this.frameManager.empUniforms.uEmpActive.value = this.active ? 1 : 0;
            const radiiVal = this.frameManager.empUniforms.uEmpRadii.value;
            const centersVal = this.frameManager.empUniforms.uEmpCenters.value;

            for (let j = 0; j < 16; j++) {
                if (j < this.pulseRings.length) {
                    radiiVal[j] = this.pulseRings[j].radius;
                    centersVal[j].copy(this.pulseRings[j].mesh.position);
                } else {
                    radiiVal[j] = 0.0;
                }
            }
        }

        const countSpan = document.getElementById('emp-active-count');
        if (countSpan) {
            countSpan.textContent = this.pulseRings.length;
        }
    }

    _injectControlDeckUI() {
        if (this.uiElement) return;
        const container = document.querySelector(this.uiContainerSelector);
        if (!container) return;

        this.uiElement = document.createElement('div');
        this.uiElement.id = 'emp-overlay-deck-section';
        this.uiElement.innerHTML = `
            <hr class="deck-divider">
            <div class="deck-section" style="margin-top: 4px;">
                <label style="color: #00ffff;">EMP Wavefront Telemetry</label>
                <div style="font-size: 8px; color: #00ffffaa; margin-top: 3px; display: flex; justify-content: space-between;">
                    <span>Active Pulses: <span id="emp-active-count">0</span></span>
                    <span>State: <span style="color: #00ffcc;">ONLINE</span></span>
                </div>
            </div>
        `;
        container.appendChild(this.uiElement);
    }

    _removeControlDeckUI() {
        if (this.uiElement && this.uiElement.parentNode) {
            this.uiElement.parentNode.removeChild(this.uiElement);
            this.uiElement = null;
        }
    }
}