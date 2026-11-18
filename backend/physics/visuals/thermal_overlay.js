/**
 * Thermal Overlay Module (v2.8.4 Modular Extension)
 * Implements categorical Kelvin starbursts and distance-dissipated 
 * reference frame proximity diffusion with strict state isolation.
 */

import * as THREE from 'three';

const SAFE_RADIUS_SCALE = 0.05;   // Scales total heat (Q) conservatively to starburst radius
const MAX_LUMINANCE_CLAMP = 1.0;  // Caps fragment output intensity
const HEAT_DISSIPATION_COEFF = 0.2; // Controls how fast heat falls off over distance (d)

export class ThermalOverlay {
    constructor(scene, referenceFrameManager, uiContainerSelector = '#deck-body-content') {
        this.scene = scene;
        this.frameManager = referenceFrameManager;
        this.uiContainerSelector = uiContainerSelector;
        this.active = false;

        this.starburstGroup = new THREE.Group();
        this.starburstGroup.name = 'ThermalStarburstGroup';

        this.starburstGeometry = null;
        this.starburstMaterial = null;
        this.starburstPoints = null;

        this.colorBarElement = null;
    }

    enable() {
        if (this.active) return;
        this.active = true;

        this.scene.add(this.starburstGroup);
        this._injectControlDeckBar();

        if (this.frameManager && typeof this.frameManager.setThermalMode === 'function') {
            this.frameManager.setThermalMode(true);
        }
    }

    disable() {
        if (!this.active) return;
        this.active = false;

        this.scene.remove(this.starburstGroup);
        this._removeControlDeckBar();

        if (this.frameManager && typeof this.frameManager.setThermalMode === 'function') {
            this.frameManager.setThermalMode(false);
        }
    }

    /**
     * Maps a Kelvin temperature value continuously across the 3-tier categorical spectrum.
     */
    getKelvinColor(kelvinValue, minK = 200, maxK = 5000) {
        const val = typeof kelvinValue === 'number' ? kelvinValue : 1000;
        const t = THREE.MathUtils.clamp((val - minK) / (maxK - minK), 0, 1);

        const stops = [
            { pos: 0.0, color: new THREE.Color('#8B0000') }, // Red-Brown (Low start)
            { pos: 0.25, color: new THREE.Color('#FF0000') }, // Red (Low peak)
            { pos: 0.45, color: new THREE.Color('#FFD700') }, // Yellow (Med start)
            { pos: 0.65, color: new THREE.Color('#FFA500') }, // Orange (Med peak)
            { pos: 0.85, color: new THREE.Color('#87CEFA') }, // Bright Sky Blue (High start)
            { pos: 1.0, color: new THREE.Color('#FFFFFF') }  // White (High peak)
        ];

        for (let i = 0; i < stops.length - 1; i++) {
            const curr = stops[i];
            const next = stops[i + 1];
            if (t >= curr.pos && t <= next.pos) {
                const localT = (t - curr.pos) / (next.pos - curr.pos);
                return curr.color.clone().lerp(next.color, localT);
            }
        }

        return stops[stops.length - 1].color.clone();
    }

    update(nodeDataArray, deltaTime) {
        if (!this.active || !Array.isArray(nodeDataArray) || nodeDataArray.length === 0) return;

        this._updateStarbursts(nodeDataArray);

        const proximityData = nodeDataArray.map(node => {
            const px = node.position ? node.position.x : (node.x || 0);
            const py = node.position ? node.position.y : (node.y || 0);
            const pz = node.position ? node.position.z : (node.z || 0);
            return {
                position: new THREE.Vector3(px, py, pz),
                totalHeat: Math.min((node.totalHeat || 1.0) * 0.1, MAX_LUMINANCE_CLAMP),
                dissipationCoeff: HEAT_DISSIPATION_COEFF
            };
        });

        if (this.frameManager && typeof this.frameManager.updateThermalProximity === 'function') {
            this.frameManager.updateThermalProximity(proximityData);
        }
    }

    _updateStarbursts(nodeDataArray) {
        // Rebuild geometry cleanly if node count changes to prevent buffer mismatch errors
        if (!this.starburstPoints || this.nodeCount !== nodeDataArray.length) {
            if (this.starburstPoints) {
                this.starburstGroup.remove(this.starburstPoints);
                this.starburstGeometry.dispose();
            }

            this.nodeCount = nodeDataArray.length;
            this.starburstGeometry = new THREE.BufferGeometry();

            const positions = [];
            const colors = [];
            const sizes = [];

            nodeDataArray.forEach(node => {
                const px = node.position ? node.position.x : (node.x || 0);
                const py = node.position ? node.position.y : (node.y || 0);
                const pz = node.position ? node.position.z : (node.z || 0);
                positions.push(px, py, pz);

                const kelvin = node.kelvin || 1000;
                const col = this.getKelvinColor(kelvin);
                colors.push(col.r, col.g, col.b);

                const heat = node.totalHeat || 1.0;
                sizes.push(Math.min(heat * SAFE_RADIUS_SCALE, 10.0));
            });

            this.starburstGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            this.starburstGeometry.setAttribute('customColor', new THREE.Float32BufferAttribute(colors, 3));
            this.starburstGeometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

            this.starburstMaterial = new THREE.PointsMaterial({
                size: 5.0,
                vertexColors: true,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            this.starburstPoints = new THREE.Points(this.starburstGeometry, this.starburstMaterial);
            this.starburstGroup.add(this.starburstPoints);
        } else {
            const positionAttr = this.starburstGeometry.attributes.position;
            const colorAttr = this.starburstGeometry.attributes.customColor;
            const sizeAttr = this.starburstGeometry.attributes.size;

            nodeDataArray.forEach((node, i) => {
                const px = node.position ? node.position.x : (node.x || 0);
                const py = node.position ? node.position.y : (node.y || 0);
                const pz = node.position ? node.position.z : (node.z || 0);
                positionAttr.setXYZ(i, px, py, pz);

                const kelvin = node.kelvin || 1000;
                const col = this.getKelvinColor(kelvin);
                colorAttr.setXYZ(i, col.r, col.g, col.b);

                const heat = node.totalHeat || 1.0;
                const radius = Math.min(heat * SAFE_RADIUS_SCALE, 10.0);
                sizeAttr.setX(i, radius);
            });

            positionAttr.needsUpdate = true;
            colorAttr.needsUpdate = true;
            sizeAttr.needsUpdate = true;
        }
    }

    _injectControlDeckBar() {
        if (this.colorBarElement) return;
        const container = document.querySelector(this.uiContainerSelector);
        if (!container) return;

        this.colorBarElement = document.createElement('div');
        this.colorBarElement.id = 'thermal-kelvin-bar';
        this.colorBarElement.innerHTML = `
            <hr class="deck-divider">
            <div class="deck-section" style="margin-top: 4px;">
                <label style="color: #87CEFA;">Kelvin (K) Thermal Spectrum</label>
                <div style="height: 6px; width: 100%; background: linear-gradient(to right, #8B0000, #FF0000, #FFD700, #FFA500, #87CEFA, #FFFFFF); border: 1px solid #00ffcc; border-radius: 2px; margin-top: 4px;"></div>
                <div style="display: flex; justify-content: space-between; font-size: 8px; color: #00ffccaa; margin-top: 3px;">
                    <span>Low (Red-Brown)</span>
                    <span>Med (Yellow/Orange)</span>
                    <span>High (Sky Blue/White)</span>
                </div>
            </div>
        `;
        container.appendChild(this.colorBarElement);
    }

    _removeControlDeckBar() {
        if (this.colorBarElement && this.colorBarElement.parentNode) {
            this.colorBarElement.parentNode.removeChild(this.colorBarElement);
            this.colorBarElement = null;
        }
    }
}