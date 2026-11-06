import * as THREE from './vendor/graphics/three.js';
import { WaveEquationSolver } from '/physics/dynamics/WaveEquationSolver.js';

export class TopologyMeshViewer {
    constructor(canvas) {
        this.canvas = canvas;
        this.container = this.canvas.parentElement;
        this.gridSize = 64; // 64x64 vertex grid
        this.zScale = 1.0;  // Z-height multiplier slider state

        this.renderLayout();
        this.bindEvents();

        // 1. Initialize Fallback Physical Wave Solver (32x32 internal solver grid)
        this.solverGridSize = 32;
        this.solver = new WaveEquationSolver(this.solverGridSize, 0.995, 0.6);
        this.isServerDriven = false; // Tracks whether backend stream is active

        // 2. Scene Setup
        this.scene = new THREE.Scene();

        // 3. Camera Setup
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        this.camera.position.set(0, -16, 18);
        this.camera.lookAt(0, 0, 0);

        // 4. Renderer Setup
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(width, height, false);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // 5. Geometry & Wireframe Mesh Setup
        this.geometry = new THREE.PlaneGeometry(20, 20, this.gridSize - 1, this.gridSize - 1);

        this.material = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            wireframe: true,
            transparent: true,
            opacity: 0.85
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.mesh);

        // Ingest live physics nodes from Main HUD broadcast channel
        const telemetryChannel = new BroadcastChannel('holographic_telemetry_channel');
        telemetryChannel.onmessage = (event) => {
            const data = event.data;
            if (data && data.type === 'hud_update' && data.nodes) {
                this.updateCoordinates(data.nodes);
            }
        };

        // Start Render Loop
        this.animate();
    }

    renderLayout() {
        if (!this.container) return;
        // Style container as flex row and inject the sidebar controls next to the canvas
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'row';
        this.container.style.position = 'relative';

        this.canvas.style.flex = '1';
        this.canvas.style.height = '100%';
        this.canvas.style.display = 'block';

        // Check if control panel already exists
        if (!this.container.querySelector('#lattice-controls-panel')) {
            const panel = document.createElement('div');
            panel.id = 'lattice-controls-panel';
            panel.style.cssText = 'width: 280px; background: #080d0d; border-left: 1.5px solid #00ffcc33; padding: 16px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; z-index: 5;';
            panel.innerHTML = `
                <div style="color: #00ffcc; font-size: 12px; font-weight: bold; letter-spacing: 1px;">LATTICE CONTROLS</div>
                <div style="background: rgba(0,255,204,0.05); border: 1.5px solid #00ffcc33; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: #00ffcc;">
                        <span>Z-Height Scale:</span><span id="val-zscale">1.00x</span>
                    </div>
                    <input type="range" id="slider-zscale" min="0.1" max="5.0" step="0.1" value="1.0" style="width: 100%; accent-color: #00ffcc;">
                </div>
            `;
            this.container.appendChild(panel);
        }
    }

    bindEvents() {
        const zScaleSlider = document.getElementById('slider-zscale');
        if (zScaleSlider) {
            zScaleSlider.addEventListener('input', (e) => {
                this.zScale = parseFloat(e.target.value);
                const valEl = document.getElementById('val-zscale');
                if (valEl) valEl.textContent = `${this.zScale.toFixed(2)}x`;
            });
        }
    }

    updateCoordinates(input) {
        if (!this.geometry) return;
        this.isServerDriven = true; // Mark active stream

        const positionAttribute = this.geometry.attributes.position;
        if (!positionAttribute) return;

        // Handle broadcasted nodes array from Main HUD
        if (Array.isArray(input)) {
            const count = positionAttribute.count; // 4096 for 64x64
            for (let i = 0; i < count; i++) {
                const vx = positionAttribute.getX(i);
                const vy = positionAttribute.getY(i);

                let cumulativeZ = 0;
                input.forEach(node => {
                    const dx = vx - (node.x || 0) * 0.05;
                    const dy = vy - (node.y || 0) * 0.05;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 4.0) {
                        cumulativeZ += Math.cos(dist * Math.PI * 0.25) * 1.5;
                    }
                });

                positionAttribute.setZ(i, cumulativeZ * this.zScale);
            }
            positionAttribute.needsUpdate = true;
            return;
        }

        let data = null;
        if (input && typeof input === 'object' && 'gridPositions' in input) {
            data = input.gridPositions;
        } else if (input instanceof Float64Array || input instanceof Float32Array) {
            data = input;
        }

        if (!data) return;

        // If receiving a flat array of Z-heights matching vertex count (e.g. 4096 or 1024)
        if (data.length === positionAttribute.count) {
            for (let i = 0; i < positionAttribute.count; i++) {
                positionAttribute.setZ(i, data[i] * this.zScale);
            }
            positionAttribute.needsUpdate = true;
            return;
        }

        // If receiving a 32x32 array (1024 values) and mapping onto 64x64 (4096 values) via bilinear/nearest interpolation
        if (data.length === 1024 && positionAttribute.count === 4096) {
            const srcSize = 32;
            const destSize = this.gridSize; // 64
            for (let i = 0; i < positionAttribute.count; i++) {
                const x = i % destSize;
                const y = Math.floor(i / destSize);
                const sx = Math.min(srcSize - 1, Math.floor((x / destSize) * srcSize));
                const sy = Math.min(srcSize - 1, Math.floor((y / destSize) * srcSize));
                positionAttribute.setZ(i, data[sx * srcSize + sy] * this.zScale);
            }
            positionAttribute.needsUpdate = true;
            return;
        }

        // Standard full-vector grid position update
        if (positionAttribute.array.length === data.length) {
            for (let i = 0; i < positionAttribute.count; i++) {
                positionAttribute.setZ(i, data[i * 3 + 2] * this.zScale);
            }
            positionAttribute.needsUpdate = true;
        } else {
            const count = Math.min(positionAttribute.count, Math.floor(data.length / 3));
            for (let i = 0; i < count; i++) {
                positionAttribute.setZ(i, data[i * 3 + 2] * this.zScale);
            }
            positionAttribute.needsUpdate = true;
        }
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        if (!this.isServerDriven) {
            if (this.solver && typeof this.solver.step === 'function') {
                this.solver.step();
            }

            const field = typeof this.solver.getField === 'function' ? this.solver.getField()
                : typeof this.solver.getState === 'function' ? this.solver.getState()
                    : (this.solver.field || this.solver.grid);

            if (field && this.geometry) {
                const positionAttribute = this.geometry.attributes.position;
                const N = this.gridSize; // 64
                const sSize = this.solverGridSize; // 32

                for (let i = 0; i < positionAttribute.count; i++) {
                    const x = i % N;
                    const y = Math.floor(i / N);

                    const sx = Math.min(sSize - 1, Math.floor((x / N) * sSize));
                    const sy = Math.min(sSize - 1, Math.floor((y / N) * sSize));

                    const zVal = field[sx * sSize + sy] || 0;
                    positionAttribute.setZ(i, zVal * 4.0 * this.zScale);
                }
                positionAttribute.needsUpdate = true;
            }
        }

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    resize() {
        if (!this.canvas || !this.renderer || !this.camera) return;
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
    }

    connect(url = '/ws/telemetry') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = url.startsWith('ws') ? url : `${protocol}//${window.location.host}${url}`;

        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const buffer = event.data;
                if (buffer.byteLength >= 24) {
                    try {
                        const headerView = new DataView(buffer, 0, 24);
                        const step = headerView.getUint32(8, true);
                        const numPoints = headerView.getUint32(16, true);
                        const expectedLength = 24 + (numPoints * 3 * 8 * 3) + (numPoints * 8);

                        if (buffer.byteLength >= expectedLength && numPoints > 0) {
                            this.isServerDriven = true; // Mark active stream only on valid data
                            const vectorByteLength = numPoints * 3 * 8;
                            let offset = 24;

                            const gridPositions = new Float64Array(buffer, offset, numPoints * 3);
                            offset += vectorByteLength;
                            const efieldReal = new Float64Array(buffer, offset, numPoints * 3);
                            offset += vectorByteLength;
                            const efieldImag = new Float64Array(buffer, offset, numPoints * 3);
                            offset += vectorByteLength;
                            const probDensity = new Float64Array(buffer, offset, numPoints);

                            this.updateCoordinates({
                                step,
                                timeElapsed: 0,
                                numPoints,
                                gridPositions,
                                efieldReal,
                                efieldImag,
                                probDensity
                            });
                            return;
                        }
                    } catch (e) {
                        console.error("Binary parse error:", e);
                    }
                }
                const floatData = new Float32Array(buffer);
                this.updateCoordinates(floatData);
            }
        };

        this.ws.onerror = (error) => { console.error("[CH-02] WebSocket error:", error); };
        this.ws.onclose = () => { setTimeout(() => this.connect(url), 3000); };
    }
}
window.TopologyMeshViewer = TopologyMeshViewer;