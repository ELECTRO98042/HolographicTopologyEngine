/**
 * TopologyEngineViewer - Dedicated 6-Layer Interleaved Phase Space Engine for CH-05
 * Extracted from the modular topology engine architecture[cite: 11].
 */

export class TopologyEngineViewer {
    constructor(container) {
        this.container = container;

        // Initialize layerStates first so renderLayout() / renderControlsHTML() can access it
        this.layerStates = [
            { name: 'Metric Base', color: '#6366f1', visible: true, operators: ['g_μν', 'x^μ', 'η_μν'] },
            { name: 'Connection', color: '#06b6d4', visible: true, operators: ['∇_μ', 'Γ^λ_μν', '∂_ν'] },
            { name: 'Hamiltonian', color: '#10b981', visible: true, operators: ['H', 'a†', 'a'] },
            { name: 'Entropy', color: '#f59e0b', visible: true, operators: ['δS', '<σ>', 'Δx'] },
            { name: 'Velocity', color: '#3b82f6', visible: true, operators: ['v·∇', '∂_t', 'J_ij'] },
            { name: 'Holographic', color: '#d946ef', visible: true, operators: ['<O>', 'T_μν', 'c'] },
        ];

        // 1. Render layout and controls into container first
        this.renderLayout();

        // 2. Initialize Canvas & Context
        this.canvas = this.container.querySelector('#phaseSpaceCanvas') || document.createElement('canvas');
        if (!this.canvas.id) this.canvas.id = 'phaseSpaceCanvas';
        if (!this.canvas.parentElement) {
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.style.display = 'block';
            this.container.appendChild(this.canvas);
        }

        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

        // Physics Slider States
        this.kappa = 0.65;
        this.sigma = 0.25;
        this.velocity = 0.40;
        this.phi = 0.15;

        // 3D Gimbal Rotation Angles (Default corner isometric view)
        this.rotX = 0.55;
        this.rotY = 0.75;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Telemetry Logging Buffer
        this.isCapturing = true;
        this.frameCount = 0;
        this.startTime = performance.now();
        this.telemetryBuffer = [];

        // Mouse / Loupe Coordinates
        this.mouseX = 0;
        this.mouseY = 0;
        this.isMouseOver = false;

        this.initCanvas();
        this.bindEvents();
        this.connect();
        this.animate();

        // Physics Slider States[cite: 11]
        this.kappa = 0.65;    // Coupling Strength
        this.sigma = 0.25;    // Entropy / Phase Perturbation
        this.velocity = 0.40; // Stream Velocity
        this.phi = 0.15;      // Scalar Distortion

        // Layer Visibility / Mute States (6 Layers)[cite: 11]
        this.layerStates = [
            { name: 'Metric Base', color: '#6366f1', visible: true, operators: ['g_μν', 'x^μ', 'η_μν'] },
            { name: 'Connection', color: '#06b6d4', visible: true, operators: ['∇_μ', 'Γ^λ_μν', '∂_ν'] },
            { name: 'Hamiltonian', color: '#10b981', visible: true, operators: ['H', 'a†', 'a'] },
            { name: 'Entropy', color: '#f59e0b', visible: true, operators: ['δS', '<σ>', 'Δx'] },
            { name: 'Velocity', color: '#3b82f6', visible: true, operators: ['v·∇', '∂_t', 'J_ij'] },
            { name: 'Holographic', color: '#d946ef', visible: true, operators: ['<O>', 'T_μν', 'c'] },
        ];
    }

    renderLayout() {
        this.container.innerHTML = `
            <div class="topology-app-container" style="display: flex; flex-direction: column; height: 100%; width: 100%; padding: 15px; box-sizing: border-box; background: #050808; font-family: 'Courier New', Courier, monospace;">
                <!-- Top Header & Format Toolbar -->
                <div class="matrix-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; border-bottom: 1.5px solid #00ffcc33; padding-bottom: 8px;">
                    <div style="font-size: 13px; letter-spacing: 2px; color: #00ffcc;">
                        CH-05 // HOLOGRAPHIC TOPOLOGY ENGINE
                    </div>
                </div>

                <!-- Main Workspace Body -->
                <div style="display: flex; flex: 1; gap: 20px; overflow: hidden;">
                    <!-- Left Sidebar: Controls & Preset Creator -->
                    ${this.renderControlsHTML()}

                    <!-- Right Viewport: Topology Mesh Canvas Container -->
                    <div id="topologyContainerInner" style="flex: 1; position: relative; background: #000; border: 1.5px solid #00ffcc33; overflow: hidden;">
                        <canvas id="phaseSpaceCanvas" style="width: 100%; height: 100%; display: block;"></canvas>
                    </div>
                </div>
            </div>
        `;
    }

    renderControlsHTML() {
        let layersHTML = '';
        for (let i = 0; i < this.layerStates.length; i++) {
            const l = this.layerStates[i];
            layersHTML += '\n' +
                '                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 9px; color: ' + l.color + ';">\n' +
                '                    <span>L' + (i + 1) + ': ' + l.name + '</span>\n' +
                '                    <div style="display: flex; gap: 4px;">\n' +
                '                        <button class="btn-layer-mute" data-layer="' + i + '" style="background: #000; border: 1px solid ' + l.color + '; color: ' + l.color + '; padding: 2px 6px; cursor: pointer; font-size: 8px;">MUTE</button>\n' +
                '                        <button class="btn-layer-solo" data-layer="' + i + '" style="background: #000; border: 1px solid ' + l.color + '; color: ' + l.color + '; padding: 2px 6px; cursor: pointer; font-size: 8px;">SOLO</button>\n' +
                '                    </div>\n' +
                '                </div>';
        }

        return `
            <div id="preset-creator-panel" style="width: 280px; display: flex; flex-direction: column; gap: 12px; flex-shrink: 0; overflow-y: auto; padding-right: 5px;">
                <!-- Preset Engine -->
                <div style="background: rgba(0,255,204,0.05); border: 1.5px solid #00ffcc33; padding: 10px;">
                    <div style="font-size: 10px; font-weight: bold; margin-bottom: 6px; color: #00ffcc;">// v2.7.8 PRESET ENGINE</div>
                    <input type="text" id="preset-id-input" value="custom_operator_01" style="width: 100%; background: #000; border: 1px solid #00ff33; color: #00ffcc; padding: 4px; margin-bottom: 6px; box-sizing: border-box;">
                    <select id="operator-type-select" style="width: 100%; background: #000; border: 1px solid #00ff33; color: #00ffcc; padding: 4px; margin-bottom: 6px; box-sizing: border-box;">
                        <option value="Berry Curvature">Berry Curvature Tensor</option>
                        <option value="Topological Gauge">Topological Gauge Field</option>
                        <option value="Non-Hermitian Hamiltonian">Non-Hermitian Hamiltonian</option>
                    </select>
                    <button id="compile-preset-btn" style="width: 100%; background: #00ffcc; color: #000; font-weight: bold; border: none; padding: 6px; cursor: pointer;">COMPILE & STREAM</button>
                    <div id="compiler-status" style="font-size: 9px; margin-top: 6px; color: #ff00ff; min-height: 12px;"></div>
                </div>

                <!-- Physics Sliders -->
                <div style="background: rgba(0,255,204,0.05); border: 1.5px solid #00ffcc33; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: #00ffcc;">
                        <span>Coupling (κ):</span><span id="val-kappa">0.65</span>
                    </div>
                    <input type="range" id="slider-kappa" min="0" max="1" step="0.01" value="0.65" style="width: 100%; accent-color: #00ffcc;">

                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: #00ffcc;">
                        <span>Entropy (σ):</span><span id="val-sigma">0.25</span>
                    </div>
                    <input type="range" id="slider-sigma" min="0" max="1" step="0.01" value="0.25" style="width: 100%; accent-color: #00ffcc;">

                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: #00ffcc;">
                        <span>Velocity (v):</span><span id="val-velocity">0.40</span>
                    </div>
                    <input type="range" id="slider-velocity" min="0" max="1" step="0.01" value="0.40" style="width: 100%; accent-color: #00ffcc;">

                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: #00ffcc;">
                        <span>Scalar (φ):</span><span id="val-phi">0.15</span>
                    </div>
                    <input type="range" id="slider-phi" min="0" max="1" step="0.01" value="0.15" style="width: 100%; accent-color: #00ffcc;">

                    <button id="btn-reset-sliders" style="background: transparent; border: 1px solid #00ffcc33; color: #00ffcc; font-size: 9px; padding: 4px; cursor: pointer; margin-top: 4px;">Reset Defaults</button>
                </div>

                <!-- Layer Controls -->
                <div style="background: rgba(0,255,204,0.05); border: 1.5px solid #00ffcc33; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
                    <div style="font-size: 10px; font-weight: bold; color: #00ffcc; margin-bottom: 2px;">// 6-LAYER STACK</div>
                    ${layersHTML}
                </div>

                <!-- Telemetry & Exports -->
                <div style="background: rgba(0,255,204,0.05); border: 1.5px solid #00ffcc33; padding: 10px; display: flex; flex-direction: column; gap: 6px; font-size: 9px; color: #00ffcc;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>Status:</span><span id="telemetry-status-badge" class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">CAPTURING</span>
                    </div>
                    <div>Frames: <span id="telemetry-frame-count">000000</span></div>
                    <div>Elapsed: <span id="telemetry-elapsed">0.000s</span></div>
                    <button id="btn-toggle-capture" style="background: #00ffcc33; border: 1px solid #00ffcc; color: #00ffcc; padding: 4px; cursor: pointer; font-weight: bold; margin-top: 4px;"><span id="capture-btn-text">Pause Acquisition</span></button>
                    <div style="display: flex; gap: 6px; margin-top: 4px;">
                        <button id="btn-export-json" style="flex: 1; background: #000; border: 1px solid #00ffcc; color: #00ffcc; padding: 4px; cursor: pointer;">Export JSON</button>
                        <button id="btn-export-jupyter" style="flex: 1; background: #000; border: 1px solid #00ffcc; color: #00ffcc; padding: 4px; cursor: pointer;">Export .ipynb</button>
                    </div>
                </div>
            </div>
        `;
    }

    initCanvas() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.container || !this.canvas) return;
        this.width = this.container.clientWidth || window.innerWidth;
        this.height = this.container.clientHeight || window.innerHeight;
        this.canvas.width = this.width * window.devicePixelRatio;
        this.canvas.height = this.height * window.devicePixelRatio;
        if (this.ctx) {
            this.ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
        }
    }

    bindEvents() {
        // Sliders[cite: 11]
        const kappaSlider = document.getElementById('slider-kappa');
        if (kappaSlider) {
            kappaSlider.addEventListener('input', (e) => {
                this.kappa = parseFloat(e.target.value);
                const valEl = document.getElementById('val-kappa');
                if (valEl) valEl.textContent = this.kappa.toFixed(2);
            });
        }

        const sigmaSlider = document.getElementById('slider-sigma');
        if (sigmaSlider) {
            sigmaSlider.addEventListener('input', (e) => {
                this.sigma = parseFloat(e.target.value);
                const valEl = document.getElementById('val-sigma');
                if (valEl) valEl.textContent = this.sigma.toFixed(2);
            });
        }

        const velocitySlider = document.getElementById('slider-velocity');
        if (velocitySlider) {
            velocitySlider.addEventListener('input', (e) => {
                this.velocity = parseFloat(e.target.value);
                const valEl = document.getElementById('val-velocity');
                if (valEl) valEl.textContent = this.velocity.toFixed(2);
            });
        }

        const phiSlider = document.getElementById('slider-phi');
        if (phiSlider) {
            phiSlider.addEventListener('input', (e) => {
                this.phi = parseFloat(e.target.value);
                const valEl = document.getElementById('val-phi');
                if (valEl) valEl.textContent = this.phi.toFixed(2);
            });
        }

        // Reset Sliders[cite: 11]
        const resetBtn = document.getElementById('btn-reset-sliders');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.kappa = 0.65; this.sigma = 0.25; this.velocity = 0.40; this.phi = 0.15;
                if (document.getElementById('slider-kappa')) document.getElementById('slider-kappa').value = 0.65;
                if (document.getElementById('slider-sigma')) document.getElementById('slider-sigma').value = 0.25;
                if (document.getElementById('slider-velocity')) document.getElementById('slider-velocity').value = 0.40;
                if (document.getElementById('slider-phi')) document.getElementById('slider-phi').value = 0.15;
                if (document.getElementById('val-kappa')) document.getElementById('val-kappa').textContent = '0.65';
                if (document.getElementById('val-sigma')) document.getElementById('val-sigma').textContent = '0.25';
                if (document.getElementById('val-velocity')) document.getElementById('val-velocity').textContent = '0.40';
                if (document.getElementById('val-phi')) document.getElementById('val-phi').textContent = '0.15';
            });
        }
        // 3D Gimbal Drag Rotation
        if (this.canvas) {
            this.canvas.addEventListener('mousedown', (e) => {
                this.isDragging = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            });

            window.addEventListener('mousemove', (e) => {
                if (!this.isDragging) return;
                const dx = e.clientX - this.lastMouseX;
                const dy = e.clientY - this.lastMouseY;
                this.rotY += dx * 0.008;
                this.rotX -= dy * 0.008;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            });

            window.addEventListener('mouseup', () => {
                this.isDragging = false;
            });
        }

        // Layer Mute / Solo[cite: 11]
        document.querySelectorAll('.btn-layer-mute').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-layer'));
                this.layerStates[idx].visible = !this.layerStates[idx].visible;
                e.target.classList.toggle('bg-red-900');
                e.target.classList.toggle('text-red-200');
            });
        });

        document.querySelectorAll('.btn-layer-solo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-layer'));
                const allSolod = this.layerStates.every((l, i) => i === idx ? l.visible : !l.visible);
                this.layerStates.forEach((l, i) => {
                    l.visible = allSolod ? true : (i === idx);
                });
            });
        });

        // Capture Toggle[cite: 11]
        const captureBtn = document.getElementById('btn-toggle-capture');
        if (captureBtn) {
            captureBtn.addEventListener('click', () => {
                this.isCapturing = !this.isCapturing;
                const btnText = document.getElementById('capture-btn-text');
                const dot = document.getElementById('capture-status-dot');
                const badge = document.getElementById('telemetry-status-badge');

                if (this.isCapturing) {
                    if (btnText) btnText.textContent = "Pause Acquisition";
                    if (dot) dot.className = "w-2 h-2 rounded-full bg-white animate-pulse";
                    if (badge) {
                        badge.textContent = "CAPTURING";
                        badge.className = "px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800";
                    }
                } else {
                    if (btnText) btnText.textContent = "Resume Acquisition";
                    if (dot) dot.className = "w-2 h-2 rounded-full bg-amber-400";
                    if (badge) {
                        badge.textContent = "PAUSED";
                        badge.className = "px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-400 border border-amber-800";
                    }
                }
            });
        }

        // Loupe Hover[cite: 11]
        const loupe = document.getElementById('inspector-loupe');
        if (this.canvas && loupe) {
            this.canvas.addEventListener('mousemove', (e) => {
                const rect = this.canvas.getBoundingClientRect();
                this.mouseX = e.clientX - rect.left;
                this.mouseY = e.clientY - rect.top;
                this.isMouseOver = true;

                loupe.style.left = `${e.clientX}px`;
                loupe.style.top = `${e.clientY}px`;
                loupe.classList.remove('hidden');
                loupe.classList.add('flex');

                this.updateLoupeReadouts();
            });

            this.canvas.addEventListener('mouseleave', () => {
                this.isMouseOver = false;
                loupe.classList.add('hidden');
                loupe.classList.remove('flex');
            });
        }

        // Export Options[cite: 11]
        const exportJsonBtn = document.getElementById('btn-export-json');
        if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => this.exportJSON());

        const exportJupyterBtn = document.getElementById('btn-export-jupyter');
        if (exportJupyterBtn) exportJupyterBtn.addEventListener('click', () => this.exportJupyter());
    }

    updateLoupeReadouts() {
        const normX = (this.mouseX / this.width) * 2 - 1;
        const normY = (this.mouseY / this.height) * 2 - 1;

        const coordsEl = document.getElementById('loupe-coords');
        if (coordsEl) coordsEl.textContent = `X: ${normX.toFixed(2)} Y: ${normY.toFixed(2)}`;

        const g00 = (-1 + this.phi * Math.sin(normX * 3.14)).toFixed(3);
        const R = (1.2 + this.kappa * Math.cos(normY * 2.0)).toFixed(3);
        const S = (this.sigma * (Math.abs(normX) + Math.abs(normY))).toFixed(3);
        const V = (this.velocity * 2.5 * Math.sqrt(normX * normX + normY * normY)).toFixed(3);

        if (document.getElementById('loupe-g00')) document.getElementById('loupe-g00').textContent = g00;
        if (document.getElementById('loupe-R')) document.getElementById('loupe-R').textContent = R;
        if (document.getElementById('loupe-S')) document.getElementById('loupe-S').textContent = S;
        if (document.getElementById('loupe-V')) document.getElementById('loupe-V').textContent = V;
    }

    renderPhaseSpace(time) {
        if (!this.ctx || !this.width || !this.height) return;
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Background Sci-Fi Grid lines
        this.ctx.strokeStyle = 'rgba(30, 41, 59, 0.3)';
        this.ctx.lineWidth = 1;
        const gridSize = 50;
        for (let x = 0; x < this.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
            this.ctx.stroke();
        }
        for (let y = 0; y < this.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        }

        const numGridX = 24;
        const numGridY = 18;
        const stepX = (this.width * 0.85) / numGridX;
        const stepY = (this.height * 0.85) / numGridY;
        const centerX = this.width / 2;
        const centerY = this.height / 2;

        const cosY = Math.cos(this.rotY);
        const sinY = Math.sin(this.rotY);
        const cosX = Math.cos(this.rotX);
        const sinX = Math.sin(this.rotX);

        this.layerStates.forEach((layer, layerIdx) => {
            if (!layer.visible) return;

            this.ctx.fillStyle = layer.color;
            this.ctx.font = '11px "Courier New", monospace';

            const speed = (this.velocity * 0.0008 * (layerIdx + 1));
            const phaseShift = time * speed;

            // Z-axis separation per layer
            const zLayer = (layerIdx - 2.5) * (45 + this.kappa * 30);

            for (let i = 0; i < numGridX; i++) {
                for (let j = 0; j < numGridY; j++) {
                    const gridX = (i - numGridX / 2) * stepX;
                    const gridY = (j - numGridY / 2) * stepY;

                    const dist = Math.sqrt(gridX * gridX + gridY * gridY) / 200;
                    const warp = Math.sin(dist * 4 - phaseShift) * (this.phi * 40);
                    const jitterX = (Math.random() - 0.5) * (this.sigma * 6);
                    const jitterY = (Math.random() - 0.5) * (this.sigma * 6);

                    const x = gridX + warp + jitterX;
                    const y = gridY + warp + jitterY;
                    const z = zLayer;

                    // 3D Rotation Matrix (Yaw around Y, Pitch around X)
                    const x1 = x * cosY + z * sinY;
                    const y1 = y;
                    const z1 = -x * sinY + z * cosY;

                    const x2 = x1;
                    const y2 = y1 * cosX - z1 * sinX;
                    const z2 = y1 * sinX + z1 * cosX;

                    // Project to 2D screen space
                    const projX = centerX + x2;
                    const projY = centerY + y2;

                    const operatorSymbol = layer.operators[(i + j + layerIdx) % layer.operators.length];

                    const alpha = 0.4 + (this.kappa * 0.4) + (Math.sin(phaseShift + dist) * 0.2);
                    this.ctx.globalAlpha = Math.max(0.15, Math.min(1.0, alpha));

                    this.ctx.fillText(operatorSymbol, projX, projY);
                }
            }
        });

        this.ctx.globalAlpha = 1.0;
    }

    animate() {
        const now = performance.now();
        const elapsedSec = (now - this.startTime) / 1000;

        if (this.isCapturing) {
            this.frameCount++;
            const fcEl = document.getElementById('telemetry-frame-count');
            const elEl = document.getElementById('telemetry-elapsed');
            if (fcEl) fcEl.textContent = String(this.frameCount).padStart(6, '0');
            if (elEl) elEl.textContent = `${elapsedSec.toFixed(3)}s`;

            this.telemetryBuffer.push({
                frame: this.frameCount,
                elapsed: elapsedSec,
                kappa: this.kappa,
                sigma: this.sigma,
                velocity: this.velocity,
                phi: this.phi
            });
        }

        this.renderPhaseSpace(now);
        requestAnimationFrame(() => this.animate());
    }

    exportJSON() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.telemetryBuffer, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = `phase_space_telemetry_audit_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
    }

    exportJupyter() {
        const notebookObj = {
            cells: [
                {
                    cell_type: "markdown",
                    metadata: {},
                    source: [
                        "# Holographic Topology Engine: Phase Space Audit\n",
                        "**Generated by 6-Layer Interleaved Phase Space Constructor v2.8.0**[cite: 11]  \n",
                        `**Export Date:** \`${new Date().toISOString()}\`  \n`,
                        "---  \n",
                        "Analysis notebook containing high-frequency telemetry logs, tensor field stability graphs, and APS-styled publication figures."
                    ]
                },
                {
                    cell_type: "code",
                    execution_count: null,
                    metadata: {},
                    outputs: [],
                    source: [
                        "# 1. Ingest Capture Telemetry\n",
                        `telemetry = ${JSON.stringify(this.telemetryBuffer.slice(-100), null, 2)}\n\n`,
                        "import numpy as np\n",
                        "import matplotlib.pyplot as plt\n\n",
                        "kappa = [d['kappa'] for d in telemetry]\n",
                        "sigma = [d['sigma'] for d in telemetry]\n",
                        "elapsed = [d['elapsed'] for d in telemetry]\n\n",
                        "print(f'Successfully loaded {len(telemetry)} telemetry frames.')"
                    ]
                }
            ],
            metadata: { language_info: { name: "python" } },
            nbformat: 4,
            nbformat_minor: 2
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(notebookObj, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = `phase_space_analysis_${new Date().toISOString().slice(0, 10)}.ipynb`;
        a.click();
    }

    connect(url = '/ws/topology') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}${url}`;

        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            console.log(`[CH-05] Connected to topology stream: ${wsUrl}`);
        };

        this.ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const floatData = new Float32Array(event.data);
                this.updateMeshBuffer(floatData);
            }
        };

        this.ws.onclose = () => {
            console.warn('[CH-05] Topology stream disconnected. Reconnecting in 2s...');
            setTimeout(() => this.connect(url), 2000);
        };

        this.ws.onerror = (err) => {
            console.error('[CH-05] WebSocket error:', err);
        };
    }

    updateMeshBuffer(floatData) {
        this.latestMeshFrame = floatData;
    }
}