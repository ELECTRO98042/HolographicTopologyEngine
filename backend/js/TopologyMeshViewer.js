import * as THREE from './vendor/graphics/three.js';
export class TopologyMeshViewer {
    constructor(canvas) {
        this.canvas = canvas;
        this.container = this.canvas.parentElement;
        this.gridSize = 64; // 64x64 vertex grid (4,096 vertices)
        this.dataGridSize = 64;    // Incoming 64x64 field_2d telemetry
        this.zScale = 1.0;
        this.renderGridSize = 64; // Finer 128x128 render mesh
        this.gridSize = this.renderGridSize; // Keep if other methods reference this.gridSize  // Z-height multiplier slider state

        this.renderLayout();
        this.resize()
        this.bindEvents();

        // 1. Fallback Physical Wave Solver (only active when no HUD model or stream is present)
        // this.solverGridSize = 32;
        // this.solver = new WaveEquationSolver(this.solverGridSize, 0.995, 0.6);
        this.isServerDriven = false;
        this.hasHudModel = false;

        // 2. Scene Setup
        this.scene = new THREE.Scene();

        // 3. Camera Setup
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        this.camera.fov = 35;
        this.camera.position.set(0, -14, 10);
        this.camera.lookAt(0, 0, 0);
        this.camera.updateProjectionMatrix();

        // 4. Renderer Setup
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(width, height, false);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // 5. 64x64 Geometry & Wireframe Mesh Setup
        this.geometry = new THREE.PlaneGeometry(20, 20, this.gridSize - 1, this.gridSize - 1);

        this.material = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            wireframe: true,
            transparent: true,
            opacity: 0.85
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.mesh);

        // Listen for active Main HUD model updates on holographic_sync_channel
        this.syncChannel = new BroadcastChannel('holographic_sync_channel');
        this.syncChannel.onmessage = (event) => {
            const msg = event.data;
            if (!msg || !Array.isArray(msg.nodes)) return;

            if (
                msg.type === 'SYNC_FROM_HUD' ||
                msg.type === 'SYNC_TOPOLOGY' ||
                msg.type === 'SYNC_FROM_BUILDER'
            ) {
                this.setModelState({
                    type: msg.type,
                    source: msg.origin || 'MAIN_HUD',
                    nodes: msg.nodes,
                    edges: Array.isArray(msg.edges) ? msg.edges : []
                });
            }
        };

        // Read initial Main HUD model on open (opener first, then latest HUD sync cache)
        try {
            if (window.opener && Array.isArray(window.opener.nodes) && window.opener.nodes.length > 0) {
                this.setModelState({
                    type: 'OPENER_SNAPSHOT',
                    source: 'MAIN_HUD',
                    nodes: window.opener.nodes,
                    edges: Array.isArray(window.opener.edges) ? window.opener.edges : []
                });
            } else {
                const saved = localStorage.getItem('holographic_latest_sync');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
                        this.setModelState({
                            type: 'STORAGE_SNAPSHOT',
                            source: parsed.origin || 'MAIN_HUD',
                            nodes: parsed.nodes,
                            edges: Array.isArray(parsed.edges) ? parsed.edges : []
                        });
                    }
                }
            }
        } catch (err) {
            console.warn('[TopologyMeshViewer] Initial Main HUD model check skipped:', err);
        }

        // Start Render Loop
        this.animate();
    }

    setModelState(modelState) {
        if (!modelState || typeof modelState !== 'object') return;
        this.latestModelState = modelState;

        if (Array.isArray(modelState.field_2d) && modelState.field_2d.length > 0) {
            this.hasHudModel = true;
            this.isServerDriven = true;
            this.updateCoordinates(modelState);
            return;
        }

        const nodes = Array.isArray(modelState.nodes) ? modelState.nodes : [];
        if (nodes.length > 0) {
            this.hasHudModel = true;
            this.updateCoordinates(nodes);
        }
    }

    renderLayout() {
        if (!this.container) return;
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'row';
        this.container.style.position = 'relative';
        this.container.style.width = '100%';
        this.container.style.maxWidth = '100%';
        this.container.style.minWidth = '0';
        this.container.style.boxSizing = 'border-box';
        this.container.style.overflow = 'hidden';

        this.canvas.style.flex = '1 1 0';
        this.canvas.style.width = '0';
        this.canvas.style.minWidth = '0';
        this.canvas.style.maxWidth = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.boxSizing = 'border-box';
        this.canvas.style.display = 'block';

        if (!this.container.querySelector('#lattice-controls-panel')) {
            const panel = document.createElement('div');
            panel.id = 'lattice-controls-panel';
            panel.style.cssText = 'flex: 0 0 260px; width: 260px; box-sizing: border-box; background: #080d0d; border-left: 1.5px solid #00ffcc33; padding: 14px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; z-index: 5;';
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

        const positionAttribute = this.geometry.attributes.position;
        if (!positionAttribute) return;

        // Handle CH-02 projection object from WebSocket JSON frames
        if (input && typeof input === 'object' && !Array.isArray(input) && Array.isArray(input.field_2d)) {
            const rows = input.field_2d.length;
            const cols = rows > 0 && Array.isArray(input.field_2d[0]) ? input.field_2d[0].length : 0;
            if (rows > 0 && cols > 0) {
                const flat = new Float32Array(rows * cols);
                let k = 0;
                for (let r = 0; r < rows; r++) {
                    const row = input.field_2d[r];
                    for (let c = 0; c < cols; c++) {
                        const v = Number(row?.[c]);
                        flat[k++] = Number.isFinite(v) ? v : 0;
                    }
                }
                this.updateCoordinates(flat);
                return;
            }
        }

        // Handle node list from Main HUD / CH-02 projection
        if (Array.isArray(input)) {
            const count = positionAttribute.count;
            for (let i = 0; i < count; i++) {
                const vx = positionAttribute.getX(i);
                const vy = positionAttribute.getY(i);

                let cumulativeZ = 0;
                for (let n = 0; n < input.length; n++) {
                    const node = input[n];
                    const nx = Number.isFinite(node?.x) ? node.x : (Array.isArray(node?.position) ? node.position[0] : 0);
                    const ny = Number.isFinite(node?.y) ? node.y : (Array.isArray(node?.position) ? node.position[1] : 0);
                    const dx = vx - (nx || 0) * 0.05;
                    const dy = vy - (ny || 0) * 0.05;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 4.0) {
                        cumulativeZ += Math.cos(dist * Math.PI * 0.25) * 1.5;
                    }
                }

                positionAttribute.setZ(i, cumulativeZ * this.zScale);
            }
            positionAttribute.needsUpdate = true;
            return;
        }

        let data = null;
        if (input && typeof input === 'object' && 'gridPositions' in input) {
            data = input.gridPositions;
        } else if (
            input instanceof Float64Array ||
            input instanceof Float32Array ||
            Array.isArray(input)
        ) {
            data = input;
        }

        if (!data) return;

        // Flat Z-height array matching vertex count (4096 for 64x64)
        if (data.length === positionAttribute.count) {
            for (let i = 0; i < positionAttribute.count; i++) {
                const val = Number(data[i]);
                positionAttribute.setZ(i, (Number.isFinite(val) ? val : 0) * this.zScale);
            }
            positionAttribute.needsUpdate = true;
            return;
        }

        // Upsample 32x32 (1024) source grid onto 64x64 (4096) target grid using consistent (x, y) indexing
        if (data.length === 1024 && positionAttribute.count === 4096) {
            const srcSize = 32;
            const destSize = this.gridSize || 64;
            for (let i = 0; i < positionAttribute.count; i++) {
                const x = i % destSize;
                const y = Math.floor(i / destSize);
                const sx = Math.min(srcSize - 1, Math.floor((x / destSize) * srcSize));
                const sy = Math.min(srcSize - 1, Math.floor((y / destSize) * srcSize));
                const val = Number(data[sy * srcSize + sx]);
                positionAttribute.setZ(i, (Number.isFinite(val) ? val : 0) * this.zScale);
            }
            positionAttribute.needsUpdate = true;
            return;
        }

        // Full 3D vector array (x, y, z per point)
        const pointCount = Math.min(positionAttribute.count, Math.floor(data.length / 3));
        for (let i = 0; i < pointCount; i++) {
            const val = Number(data[i * 3 + 2]);
            positionAttribute.setZ(i, (Number.isFinite(val) ? val : 0) * this.zScale);
        }
        positionAttribute.needsUpdate = true;
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const positionAttribute = this.geometry && this.geometry.attributes && this.geometry.attributes.position;
        const count = positionAttribute ? positionAttribute.count : 0;

        if (!this.hasHudModel && !this.isServerDriven) {
            if (this.solver && typeof this.solver.step === 'function') {
                this.solver.step();
            }

            const field = typeof this.solver.getField === 'function' ? this.solver.getField()
                : typeof this.solver.getState === 'function' ? this.solver.getState()
                    : (this.solver.field || this.solver.grid);

            if (field && positionAttribute) {
                const N = this.gridSize;
                const sSize = this.solverGridSize;

                for (let i = 0; i < count; i++) {
                    const x = i % N;
                    const y = Math.floor(i / N);

                    const sx = Math.min(sSize - 1, Math.floor((x / N) * sSize));
                    const sy = Math.min(sSize - 1, Math.floor((y / N) * sSize));

                    const zVal = field[sy * sSize + sx] || 0;
                    positionAttribute.setZ(i, zVal * 4.0 * this.zScale);
                }
                positionAttribute.needsUpdate = true;
            }
        } else if (positionAttribute && this._targetZ && this._targetZ.length === count) {
            if (!this._currentZ || this._currentZ.length !== count) {
                this._currentZ = new Float32Array(count);
                for (let i = 0; i < count; i++) {
                    this._currentZ[i] = this._targetZ[i];
                }
            }

            const alpha = 0.28;
            let dirty = false;

            for (let i = 0; i < count; i++) {
                const target = this._targetZ[i];
                const current = this._currentZ[i];
                const diff = target - current;

                if (diff > 1e-4 || diff < -1e-4) {
                    const next = current + diff * alpha;
                    this._currentZ[i] = next;
                    positionAttribute.setZ(i, next * this.zScale);
                    dirty = true;
                } else if (current !== target) {
                    this._currentZ[i] = target;
                    positionAttribute.setZ(i, target * this.zScale);
                    dirty = true;
                }
            }

            if (dirty) {
                positionAttribute.needsUpdate = true;
            }
        }

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    resize() {
        if (!this.renderer || !this.camera) return;

        const targetEl = this.container || (this.canvas && this.canvas.parentElement) || this.canvas;
        if (!targetEl) return;

        const rect = targetEl.getBoundingClientRect ? targetEl.getBoundingClientRect() : null;
        const width = Math.max(1, Math.floor((rect && rect.width) || targetEl.clientWidth || 1));
        const height = Math.max(1, Math.floor((rect && rect.height) || targetEl.clientHeight || 1));

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, true);
    }

    connect(url = '/ws/telemetry') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = url.startsWith('ws') ? url : `${protocol}//${window.location.host}${url}`;

        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onmessage = (event) => {
            if (typeof event.data === 'string') {
                try {
                    const payload = JSON.parse(event.data);
                    const ch02 = payload?.projection?.channel === 'CH-02'
                        ? payload.projection
                        : payload?.projections?.['CH-02'];

                    if (ch02) {
                        this.isServerDriven = true;
                        if (Array.isArray(ch02.field_2d) && ch02.field_2d.length > 0) {
                            this.setModelState({
                                ...ch02,
                                type: 'WS_TELEMETRY',
                                source: 'MAIN_HUD_WS',
                                nodes: Array.isArray(ch02.nodes) ? ch02.nodes : [],
                                edges: Array.isArray(ch02.edges) ? ch02.edges : []
                            });
                        } else if (Array.isArray(ch02.nodes) && ch02.nodes.length > 0) {
                            this.setModelState({
                                type: 'WS_TELEMETRY',
                                source: 'MAIN_HUD_WS',
                                nodes: ch02.nodes,
                                edges: Array.isArray(ch02.edges) ? ch02.edges : []
                            });
                        }
                    }
                } catch (err) {
                    console.warn('[TopologyMeshViewer] Failed to parse WS JSON frame:', err);
                }
                return;
            }

            if (event.data instanceof ArrayBuffer) {
                this.isServerDriven = true;
                // existing binary ArrayBuffer path...
            }
        };

        this.ws.onerror = (error) => { console.error("[CH-02] WebSocket error:", error); };
        this.ws.onclose = () => { setTimeout(() => this.connect(url), 3000); };
    }
}
window.TopologyMeshViewer = TopologyMeshViewer;