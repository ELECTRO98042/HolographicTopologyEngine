/**
 * CH-01: High-Performance Mixed-Signal Real-Time Oscilloscope Viewer
 * Ultra-High Analog Bandwidth (100+ GHz) & Sampling Rate (200+ GS/s) Engine
 * Holographic HUD Telemetry Suite v2.7.3
 */

export class OscilloscopeViewer {
    constructor(containerId, options = {}) {
        this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!this.container) {
            console.error(`[CH-01] Container '${containerId}' not found.`);
            return;
        }

        // Instrument State Settings
        this.state = {
            ch1Enabled: true,
            ch2Enabled: true,
            digitalEnabled: true,
            ch1VoltsPerDiv: 0.5,    // Volts / div
            ch2VoltsPerDiv: 0.5,
            ch1Offset: 0.0,
            ch2Offset: -1.5,
            timePerDiv: 1.0,        // ns / div
            triggerLevel: 0.0,      // Volts
            triggerMode: 'auto',    // 'auto', 'normal', 'single'
            sampleRateGS: 200,      // 200 GS/s
            bandwidthGHz: 100,      // 100 GHz
            persistence: 0.85,      // Phosphor decay persistence (0.0 to 0.98)
            fftMode: false,
            protocolDecode: true,
            jitterVis: true,
            gridDivsX: 10,
            gridDivsY: 8,
            couplingCh1: 'DC',
            couplingCh2: 'DC',
            ch1Metric: 'mean_phase_rad',
            ch2Metric: 'phase_spread_rad',
            trigSource: 'ch1',
            unwrapPhase: false
        };

        // Buffer caches (ch1Buffer / ch2Buffer remain stationary guide buffers)
        this.numPoints = 5000;
        this.ch1Buffer = new Float32Array(this.numPoints);
        this.ch2Buffer = new Float32Array(this.numPoints);
        this.digitalBuffer = new Uint8Array(this.numPoints);
        this.fftBuffer = new Float32Array(512);
        this._lastPayload = null;
        this._lastHistory = null;
        this._contextModelId = null;
        this._ch1ValidMask = null;
        this._ch2ValidMask = null;

        // Layout creation
        this.initDOM();
        this.initCanvas();
        this.bindEvents();

        // Start render loop
        this.lastFrameTime = performance.now();
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);

        console.log("[CH-01] Mixed-Signal Real-Time Oscilloscope Engine v2.7.3 Online.");
        // Ingest live physics nodes from Main HUD broadcast channel
        const telemetryChannel = new BroadcastChannel('holographic_telemetry_channel');
        telemetryChannel.onmessage = (event) => {
            const data = event.data;
            if (data && data.type === 'hud_update' && data.nodes) {
                this.updateWaveform(data.nodes);
            }
        };
    }

    initDOM() {
        this.container.innerHTML = '';
        this.container.style.position = 'relative';
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'row';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.backgroundColor = '#030712';
        this.container.style.fontFamily = 'monospace, system-ui, sans-serif';
        this.container.style.overflow = 'hidden';
        this.container.style.boxSizing = 'border-box';

        // Left / Main Viewport for Display Canvas
        this.viewport = document.createElement('div');
        this.viewport.className = 'scope-viewport';
        this.viewport.style.position = 'relative';
        this.viewport.style.flex = '1';
        this.viewport.style.height = '100%';
        this.viewport.style.overflow = 'hidden';
        this.viewport.style.display = 'flex';
        this.viewport.style.flexDirection = 'column';

        // Oscilloscope Screen Header Overlay
        const headerHTML = `
            <div style="position: absolute; top: 12px; left: 16px; z-index: 10; pointer-events: none; display: flex; gap: 16px; align-items: center; background: rgba(3, 7, 18, 0.75); padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(6, 182, 212, 0.3); backdrop-filter: blur(4px);">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: #06b6d4; box-shadow: 0 0 8px #06b6d4;"></span>
                    <span style="color: #22d3ee; font-weight: bold; font-size: 13px; letter-spacing: 0.05em;">CH-01 // MSO-100G</span>
                </div>
                <div style="color: #94a3b8; font-size: 11px;">BW: <span id="hdr-bw" style="color:#06b6d4">100 GHz</span></div>
                <div style="color: #94a3b8; font-size: 11px;">SR: <span id="hdr-sr" style="color:#06b6d4">200 GS/s</span></div>
                <div style="color: #94a3b8; font-size: 11px;">TDIV: <span id="hdr-tdiv" style="color:#f59e0b">1.00 ns/div</span></div>
                <div style="color: #94a3b8; font-size: 11px;">MEM: <span style="color:#a855f7">2 Gpts</span></div>
                <div style="color: #10b981; font-size: 11px; font-weight: bold;">[TRIG READY]</div>
            </div>
        `;
        this.viewport.innerHTML = headerHTML;

        // Canvases container (Phosphor Trace + Grid Overlay)
        this.canvasContainer = document.createElement('div');
        this.canvasContainer.style.position = 'relative';
        this.canvasContainer.style.width = '100%';
        this.canvasContainer.style.height = '100%';

        this.traceCanvas = document.createElement('canvas');
        this.traceCanvas.style.position = 'absolute';
        this.traceCanvas.style.top = '0';
        this.traceCanvas.style.left = '0';
        this.traceCanvas.style.width = '100%';
        this.traceCanvas.style.height = '100%';

        this.gridCanvas = document.createElement('canvas');
        this.gridCanvas.style.position = 'absolute';
        this.gridCanvas.style.top = '0';
        this.gridCanvas.style.left = '0';
        this.gridCanvas.style.width = '100%';
        this.gridCanvas.style.height = '100%';
        this.gridCanvas.style.pointerEvents = 'none';

        this.canvasContainer.appendChild(this.traceCanvas);
        this.canvasContainer.appendChild(this.gridCanvas);
        this.viewport.appendChild(this.canvasContainer);

        // Right Side Control Deck Panel
        this.controlPanel = document.createElement('div');
        this.controlPanel.className = 'scope-control-panel';
        this.controlPanel.style.width = '310px';
        this.controlPanel.style.height = '100%';
        this.controlPanel.style.backgroundColor = '#0b0f19';
        this.controlPanel.style.borderLeft = '1px solid rgba(6, 182, 212, 0.2)';
        this.controlPanel.style.boxSizing = 'border-box';
        this.controlPanel.style.display = 'flex';
        this.controlPanel.style.flexDirection = 'column';
        this.controlPanel.style.padding = '14px';
        this.controlPanel.style.gap = '12px';
        this.controlPanel.style.overflowY = 'auto';
        this.controlPanel.style.color = '#e2e8f0';
        this.controlPanel.style.zIndex = '20';

        this.controlPanel.innerHTML = this.renderControlsHTML();

        this.container.appendChild(this.viewport);
        this.container.appendChild(this.controlPanel);
    }

    renderControlsHTML() {
        const metricOptions = `
            <option value="mean_phase_rad">Mean Phase (rad)</option>
            <option value="unwrapped_phase_rad">Unwrapped Phase (rad)</option>
            <option value="phase_velocity">Phase Velocity (rad/s)</option>
            <option value="phase_spread_rad">Node Phase Spread (rad)</option>
            <option value="coherence_deficit">Coherence Deficit (1 - r)</option>
            <option value="phase_coherence_r">Phase Coherence (r)</option>
            <option value="total_coupling_weight">Total Coupling Weight</option>
            <option value="mean_energy">Mean Energy (GeV)</option>
            <option value="ricci_scalar">Ricci Scalar</option>
            <option value="fubini_study_trace">Fubini-Study Trace</option>
        `;

        return `
            <div style="font-size: 12px; font-weight: bold; color: #22d3ee; border-bottom: 1px solid rgba(6,182,212,0.3); padding-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                <span>INSTRUMENT CONTROL</span>
                <span id="txt-run-meta" style="font-size: 9px; color: #94a3b8; max-width: 145px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">step --</span>
            </div>

            <!-- ANALOG CHANNELS & METRICS -->
            <div style="background: rgba(15, 23, 42, 0.6); padding: 7px 8px; border-radius: 6px; border: 1px solid rgba(51, 65, 85, 0.5); display: flex; flex-direction: column; gap: 7px;">
                <div style="font-size: 10px; font-weight: bold; color: #38bdf8; letter-spacing: 0.04em;">ANALOG CHANNELS & METRICS</div>

                <!-- CH1 -->
                <div style="display: flex; flex-direction: column; gap: 4px; padding-bottom: 6px; border-bottom: 1px solid rgba(51, 65, 85, 0.35);">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
                        <label style="color: #06b6d4; font-size: 11px; font-weight: bold; display: flex; align-items: center; gap: 4px;">
                            <input type="checkbox" id="chk-ch1" checked style="accent-color: #06b6d4;"> CH1
                        </label>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <span id="txt-vdiv-ch1" style="font-size: 10px; color: #94a3b8;">0.50 /div</span>
                            <button type="button" id="btn-fit-ch1" title="One-shot scale & center to current buffer" style="background: rgba(6, 182, 212, 0.15); border: 1px solid rgba(6, 182, 212, 0.5); color: #22d3ee; padding: 1px 5px; border-radius: 3px; font-size: 9px; cursor: pointer;">FIT</button>
                        </div>
                    </div>
                    <select id="sel-metric-ch1" style="width: 100%; background: #090e1a; color: #e2e8f0; border: 1px solid #334155; border-radius: 4px; padding: 3px 5px; font-size: 11px; font-family: monospace;">
                        ${metricOptions}
                    </select>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; align-items: center;">
                        <input type="range" id="rng-vdiv-ch1" min="0.02" max="5.0" step="0.02" value="0.5" title="CH1 Scale / div" style="width: 100%; accent-color: #06b6d4;">
                        <input type="range" id="rng-off-ch1" min="-4.0" max="4.0" step="0.1" value="0.0" title="CH1 Vertical Offset (div)" style="width: 100%; accent-color: #22d3ee;">
                    </div>
                    <div id="stat-ch1" style="font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; gap: 4px;">
                        <span>--</span><span id="val-ch1">--</span>
                    </div>
                </div>

                <!-- CH2 -->
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
                        <label style="color: #ec4899; font-size: 11px; font-weight: bold; display: flex; align-items: center; gap: 4px;">
                            <input type="checkbox" id="chk-ch2" checked style="accent-color: #ec4899;"> CH2
                        </label>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <span id="txt-vdiv-ch2" style="font-size: 10px; color: #94a3b8;">0.50 /div</span>
                            <button type="button" id="btn-fit-ch2" title="One-shot scale & center to current buffer" style="background: rgba(236, 72, 153, 0.15); border: 1px solid rgba(236, 72, 153, 0.5); color: #f472b6; padding: 1px 5px; border-radius: 3px; font-size: 9px; cursor: pointer;">FIT</button>
                        </div>
                    </div>
                    <select id="sel-metric-ch2" style="width: 100%; background: #090e1a; color: #e2e8f0; border: 1px solid #334155; border-radius: 4px; padding: 3px 5px; font-size: 11px; font-family: monospace;">
                        ${metricOptions}
                    </select>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; align-items: center;">
                        <input type="range" id="rng-vdiv-ch2" min="0.02" max="5.0" step="0.02" value="0.5" title="CH2 Scale / div" style="width: 100%; accent-color: #ec4899;">
                        <input type="range" id="rng-off-ch2" min="-4.0" max="4.0" step="0.1" value="-1.5" title="CH2 Vertical Offset (div)" style="width: 100%; accent-color: #f472b6;">
                    </div>
                    <div id="stat-ch2" style="font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; gap: 4px;">
                        <span>--</span><span id="val-ch2">--</span>
                    </div>
                </div>
            </div>

            <!-- TIMEBASE & TRIGGER -->
            <div style="background: rgba(15, 23, 42, 0.6); padding: 7px 8px; border-radius: 6px; border: 1px solid rgba(51, 65, 85, 0.5); display: flex; flex-direction: column; gap: 6px;">
                <div style="font-size: 10px; font-weight: bold; color: #f59e0b;">TIMEBASE & TRIGGER</div>

                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 10px; color: #cbd5e1;">Time / Div</span>
                        <span id="txt-tdiv" style="font-size: 10px; color: #f59e0b;">1.00 div</span>
                    </div>
                    <input type="range" id="rng-tdiv" min="0.1" max="10.0" step="0.1" value="1.0" style="width: 100%; accent-color: #f59e0b;">
                </div>

                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                        <span style="font-size: 10px; color: #cbd5e1;">Trig <span id="txt-trig" style="color: #10b981;">0.00</span></span>
                        <select id="sel-trig-src" style="background: #090e1a; color: #cbd5e1; border: 1px solid #334155; border-radius: 3px; padding: 1px 4px; font-size: 9px; font-family: monospace;">
                            <option value="ch1">SRC: CH1</option>
                            <option value="ch2">SRC: CH2</option>
                        </select>
                    </div>
                    <input type="range" id="rng-trig" min="-2.0" max="2.0" step="0.05" value="0.0" style="width: 100%; accent-color: #10b981;">
                </div>
            </div>

            <!-- DSP & PHOSPHOR EFFECTS -->
            <div style="background: rgba(15, 23, 42, 0.6); padding: 7px 8px; border-radius: 6px; border: 1px solid rgba(51, 65, 85, 0.5); display: flex; flex-direction: column; gap: 6px;">
                <div style="font-size: 10px; font-weight: bold; color: #a855f7;">DSP & PHOSPHOR EFFECTS</div>

                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 10px; color: #cbd5e1;">Persistence</span>
                        <span id="txt-pers" style="font-size: 10px; color: #a855f7;">85%</span>
                    </div>
                    <input type="range" id="rng-pers" min="0.0" max="0.95" step="0.05" value="0.85" style="width: 100%; accent-color: #a855f7;">
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px;">
                    <button type="button" id="btn-fft" style="background: rgba(30, 41, 59, 0.8); border: 1px solid #64748b; color: #cbd5e1; padding: 5px 2px; border-radius: 4px; font-size: 9px; font-weight: bold; cursor: pointer;">FFT</button>
                    <button type="button" id="btn-decode" style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; padding: 5px 2px; border-radius: 4px; font-size: 9px; font-weight: bold; cursor: pointer;">DECODE</button>
                    <button type="button" id="btn-unwrap" style="background: rgba(30, 41, 59, 0.8); border: 1px solid #64748b; color: #cbd5e1; padding: 5px 2px; border-radius: 4px; font-size: 9px; font-weight: bold; cursor: pointer;">UNWRAP</button>
                </div>
            </div>

            <!-- DIGITAL MSO BUS -->
            <div style="background: rgba(15, 23, 42, 0.6); padding: 7px 8px; border-radius: 6px; border: 1px solid rgba(51, 65, 85, 0.5);">
                <div style="font-size: 10px; font-weight: bold; color: #10b981; margin-bottom: 4px;">DIGITAL MSO BUS</div>
                <label style="color: #cbd5e1; font-size: 10px; display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" id="chk-digital" checked style="accent-color: #10b981;"> Enable 8-Bit Logic Pod
                </label>
                <div style="font-size: 9px; color: #64748b; margin-top: 3px;">Bus: SPI, I2C, PCIe Gen5, CXL</div>
            </div>
        `;
    }

    initCanvas() {
        this.ctxTrace = this.traceCanvas.getContext('2d');
        this.ctxGrid = this.gridCanvas.getContext('2d');
        this.resize();
    }

    resize() {
        const rect = this.canvasContainer.getBoundingClientRect();
        this.width = rect.width || 800;
        this.height = rect.height || 600;

        this.traceCanvas.width = this.width;
        this.traceCanvas.height = this.height;
        this.gridCanvas.width = this.width;
        this.gridCanvas.height = this.height;

        this.renderGrid();
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resize());

        // Channel Controls
        const chkCh1 = this.controlPanel.querySelector('#chk-ch1');
        if (chkCh1) chkCh1.addEventListener('change', (e) => this.state.ch1Enabled = e.target.checked);

        const chkCh2 = this.controlPanel.querySelector('#chk-ch2');
        if (chkCh2) chkCh2.addEventListener('change', (e) => this.state.ch2Enabled = e.target.checked);

        const rngVCh1 = this.controlPanel.querySelector('#rng-vdiv-ch1');
        if (rngVCh1) rngVCh1.addEventListener('input', (e) => {
            this.state.ch1VoltsPerDiv = parseFloat(e.target.value);
            this.controlPanel.querySelector('#txt-vdiv-ch1').textContent = `${(this.state.ch1VoltsPerDiv * 1000).toFixed(0)} mV/div`;
        });

        const rngVCh2 = this.controlPanel.querySelector('#rng-vdiv-ch2');
        if (rngVCh2) rngVCh2.addEventListener('input', (e) => {
            this.state.ch2VoltsPerDiv = parseFloat(e.target.value);
            this.controlPanel.querySelector('#txt-vdiv-ch2').textContent = `${(this.state.ch2VoltsPerDiv * 1000).toFixed(0)} mV/div`;
        });

        // Timebase Controls
        const rngTDiv = this.controlPanel.querySelector('#rng-tdiv');
        if (rngTDiv) rngTDiv.addEventListener('input', (e) => {
            this.state.timePerDiv = parseFloat(e.target.value);
            const valStr = `${this.state.timePerDiv.toFixed(2)} ns/div`;
            this.controlPanel.querySelector('#txt-tdiv').textContent = valStr;
            const hdrTdiv = this.viewport.querySelector('#hdr-tdiv');
            if (hdrTdiv) hdrTdiv.textContent = valStr;
        });

        const rngTrig = this.controlPanel.querySelector('#rng-trig');
        if (rngTrig) rngTrig.addEventListener('input', (e) => {
            this.state.triggerLevel = parseFloat(e.target.value);
            this.controlPanel.querySelector('#txt-trig').textContent = `${this.state.triggerLevel.toFixed(2)} V`;
            this.renderGrid();
        });

        // Persistence Control
        const rngPers = this.controlPanel.querySelector('#rng-pers');
        if (rngPers) rngPers.addEventListener('input', (e) => {
            this.state.persistence = parseFloat(e.target.value);
            this.controlPanel.querySelector('#txt-pers').textContent = `${Math.round(this.state.persistence * 100)}%`;
        });

        // FFT & Protocol
        const btnFFT = this.controlPanel.querySelector('#btn-fft');
        if (btnFFT) btnFFT.addEventListener('click', () => {
            this.state.fftMode = !this.state.fftMode;
            btnFFT.style.background = this.state.fftMode ? 'rgba(168, 85, 247, 0.4)' : 'rgba(30, 41, 59, 0.8)';
            btnFFT.style.borderColor = this.state.fftMode ? '#a855f7' : '#64748b';
        });

        const btnDecode = this.controlPanel.querySelector('#btn-decode');
        if (btnDecode) btnDecode.addEventListener('click', () => {
            this.state.protocolDecode = !this.state.protocolDecode;
            btnDecode.style.background = this.state.protocolDecode ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.8)';
            btnDecode.style.borderColor = this.state.protocolDecode ? '#10b981' : '#64748b';
        });

        const chkDigital = this.controlPanel.querySelector('#chk-digital');
        if (chkDigital) chkDigital.addEventListener('change', (e) => this.state.digitalEnabled = e.target.checked);

        const selCh1 = this.controlPanel.querySelector('#sel-metric-ch1');
        const selCh2 = this.controlPanel.querySelector('#sel-metric-ch2');
        const btnFit1 = this.controlPanel.querySelector('#btn-fit-ch1');
        const btnFit2 = this.controlPanel.querySelector('#btn-fit-ch2');
        const rngOff1 = this.controlPanel.querySelector('#rng-off-ch1');
        const rngOff2 = this.controlPanel.querySelector('#rng-off-ch2');
        const selTrigSrc = this.controlPanel.querySelector('#sel-trig-src');
        const btnUnwrap = this.controlPanel.querySelector('#btn-unwrap');

        if (selCh1) {
            selCh1.value = this.state.ch1Metric;
            selCh1.addEventListener('change', (e) => {
                this.state.ch1Metric = e.target.value;
                if (this._lastHistory) this.applyHistoryMetrics(this._lastHistory);
            });
        }
        if (selCh2) {
            selCh2.value = this.state.ch2Metric;
            selCh2.addEventListener('change', (e) => {
                this.state.ch2Metric = e.target.value;
                if (this._lastHistory) this.applyHistoryMetrics(this._lastHistory);
            });
        }
        if (btnFit1) btnFit1.addEventListener('click', () => this.fitChannelScale(1));
        if (btnFit2) btnFit2.addEventListener('click', () => this.fitChannelScale(2));

        if (rngOff1) {
            rngOff1.value = String(this.state.ch1Offset);
            rngOff1.addEventListener('input', (e) => {
                this.state.ch1Offset = parseFloat(e.target.value);
            });
        }
        if (rngOff2) {
            rngOff2.value = String(this.state.ch2Offset);
            rngOff2.addEventListener('input', (e) => {
                this.state.ch2Offset = parseFloat(e.target.value);
            });
        }
        if (selTrigSrc) {
            selTrigSrc.value = this.state.trigSource;
            selTrigSrc.addEventListener('change', (e) => {
                this.state.trigSource = e.target.value;
                this.refreshDigitalBuffer();
            });
        }
        if (btnUnwrap) {
            btnUnwrap.addEventListener('click', () => {
                this.state.unwrapPhase = !this.state.unwrapPhase;
                btnUnwrap.style.background = this.state.unwrapPhase ? 'rgba(168, 85, 247, 0.25)' : 'rgba(30, 41, 59, 0.8)';
                btnUnwrap.style.borderColor = this.state.unwrapPhase ? '#a855f7' : '#64748b';
                btnUnwrap.style.color = this.state.unwrapPhase ? '#e9d5ff' : '#cbd5e1';
                if (this._lastHistory) this.applyHistoryMetrics(this._lastHistory);
            });
        }
    }

    updateWaveform(input) {
        if (!input) return;

        // Handle broadcasted nodes array from Main HUD
        if (Array.isArray(input)) {
            const points = Math.min(this.numPoints, input.length);
            this._ch1ValidMask = new Array(this.numPoints).fill(false);
            this._ch2ValidMask = new Array(this.numPoints).fill(false);
            for (let i = 0; i < points; i++) {
                const node = input[i];
                this.ch1Buffer[i] = (node.x || 0) * 0.05;
                this.ch2Buffer[i] = (node.y || 0) * 0.05;
                this._ch1ValidMask[i] = true;
                this._ch2ValidMask[i] = true;
            }
            this.refreshDigitalBuffer();
            return;
        }

        // Handle parsed JSON projection payload from /ws/oscilloscope
        if (input && typeof input === 'object' && !ArrayBuffer.isView(input)) {
            this._lastPayload = input;
            const proj = input.projection || input;
            const hist = Array.isArray(proj.history) && proj.history.length > 0
                ? proj.history
                : (proj.latest ? [proj.latest] : null);

            if (!hist) return;
            this._lastHistory = hist;
            this.applyHistoryMetrics(hist);
            return;
        }

        let floatData;
        if (input instanceof ArrayBuffer) {
            floatData = new Float32Array(input);
        } else if (input instanceof Float32Array) {
            floatData = input;
        } else {
            return;
        }

        // Unpack interleaved CH1 & CH2 signal array
        const points = Math.min(this.numPoints, Math.floor(floatData.length / 2));
        this._ch1ValidMask = new Array(this.numPoints).fill(false);
        this._ch2ValidMask = new Array(this.numPoints).fill(false);
        for (let i = 0; i < points; i++) {
            this.ch1Buffer[i] = floatData[i * 2];
            this.ch2Buffer[i] = floatData[i * 2 + 1];
            this._ch1ValidMask[i] = Number.isFinite(this.ch1Buffer[i]);
            this._ch2ValidMask[i] = Number.isFinite(this.ch2Buffer[i]);
        }
        this.refreshDigitalBuffer();
    }


    

    setContextModel(modelId) {
        this._contextModelId = modelId || null;
        this.updateRunMetadata(this._lastPayload, this._lastHistory);
    }

    wrapAngleDiff(a, b) {
        const diff = a - b;
        return Math.atan2(Math.sin(diff), Math.cos(diff));
    }

    unwrapSeries(values) {
        if (!Array.isArray(values) || values.length === 0) return [];
        const out = new Array(values.length);
        let offset = 0;
        let prev = values[0];
        out[0] = prev;
        const twoPi = Math.PI * 2;
        for (let i = 1; i < values.length; i++) {
            const curr = values[i];
            const delta = curr - prev;
            if (delta > Math.PI) offset -= twoPi;
            else if (delta < -Math.PI) offset += twoPi;
            out[i] = curr + offset;
            prev = curr;
        }
        return out;
    }

    computeCircularSpreadRad(nodePhases) {
        if (!Array.isArray(nodePhases) || nodePhases.length === 0) return null;
        const phases = [];
        for (const n of nodePhases) {
            const p = typeof n?.phase_rad === 'number' ? n.phase_rad : (typeof n === 'number' ? n : null);
            if (p !== null && Number.isFinite(p)) phases.push(p);
        }
        if (phases.length === 0) return null;
        if (phases.length === 1) return 0;

        let sumSin = 0;
        let sumCos = 0;
        for (const p of phases) {
            sumSin += Math.sin(p);
            sumCos += Math.cos(p);
        }
        const meanDir = Math.atan2(sumSin, sumCos);

        let maxAbsDev = 0;
        for (const p of phases) {
            const dev = Math.abs(this.wrapAngleDiff(p, meanDir));
            if (dev > maxAbsDev) maxAbsDev = dev;
        }
        return maxAbsDev;
    }

    computeMetricSeries(metricKey, history) {
        if (!Array.isArray(history) || history.length === 0) {
            return { values: [], validMask: [], status: 'NO DATA', unit: '', latestVal: null, minVal: null, maxVal: null };
        }

        const getTraceObj = (entry, name) => entry?.traces?.[name] ?? null;

        const directTraceKeys = new Set([
            'mean_phase_rad',
            'phase_coherence_r',
            'total_coupling_weight',
            'mean_energy',
            'ricci_scalar',
            'fubini_study_trace'
        ]);

        if (directTraceKeys.has(metricKey)) {
            const validFlags = history.map(entry => {
                const v = getTraceObj(entry, metricKey)?.value;
                return typeof v === 'number' && Number.isFinite(v);
            });
            const anyValid = validFlags.some(Boolean);
            const sampleTrace = getTraceObj(history[history.length - 1], metricKey)
                || getTraceObj(history.find(h => getTraceObj(h, metricKey)), metricKey);
            const unit = sampleTrace?.unit || '';
            const provStatus = sampleTrace?.provenance?.status || (anyValid ? 'exact' : 'unpopulated');

            if (!anyValid) {
                return {
                    values: new Array(history.length).fill(null),
                    validMask: new Array(history.length).fill(false),
                    status: provStatus.toUpperCase(),
                    unit,
                    latestVal: null,
                    minVal: null,
                    maxVal: null
                };
            }

            const values = history.map((entry, idx) => validFlags[idx] ? getTraceObj(entry, metricKey).value : null);
            const finiteVals = values.filter(v => typeof v === 'number' && Number.isFinite(v));
            const lastRaw = getTraceObj(history[history.length - 1], metricKey)?.value;
            return {
                values,
                validMask: validFlags,
                status: provStatus.toUpperCase(),
                unit,
                latestVal: (typeof lastRaw === 'number' && Number.isFinite(lastRaw)) ? lastRaw : null,
                minVal: finiteVals.length ? Math.min(...finiteVals) : null,
                maxVal: finiteVals.length ? Math.max(...finiteVals) : null
            };
        }

        if (metricKey === 'unwrapped_phase_rad') {
            const rawEntries = history.map(entry => getTraceObj(entry, 'mean_phase_rad')?.value);
            const anyValid = rawEntries.some(v => typeof v === 'number' && Number.isFinite(v));
            if (!anyValid) {
                return { values: new Array(history.length).fill(null), validMask: new Array(history.length).fill(false), status: 'UNPOPULATED', unit: 'rad', latestVal: null, minVal: null, maxVal: null };
            }
            const safeRaw = rawEntries.map(v => (typeof v === 'number' && Number.isFinite(v)) ? v : 0);
            const unwrapped = this.unwrapSeries(safeRaw);
            return {
                values: unwrapped,
                validMask: new Array(history.length).fill(true),
                status: 'DERIVED',
                unit: 'rad',
                latestVal: unwrapped[unwrapped.length - 1],
                minVal: Math.min(...unwrapped),
                maxVal: Math.max(...unwrapped)
            };
        }

        if (metricKey === 'phase_velocity') {
            const rawEntries = history.map(entry => getTraceObj(entry, 'mean_phase_rad')?.value);
            const anyValid = rawEntries.some(v => typeof v === 'number' && Number.isFinite(v));
            if (!anyValid) {
                return { values: new Array(history.length).fill(null), validMask: new Array(history.length).fill(false), status: 'UNPOPULATED', unit: 'rad/s', latestVal: null, minVal: null, maxVal: null };
            }
            const safeRaw = rawEntries.map(v => (typeof v === 'number' && Number.isFinite(v)) ? v : 0);
            const vel = new Array(safeRaw.length).fill(0);
            for (let i = 1; i < safeRaw.length; i++) {
                const dTheta = this.state.unwrapPhase
                    ? (safeRaw[i] - safeRaw[i - 1])
                    : this.wrapAngleDiff(safeRaw[i], safeRaw[i - 1]);
                const dt = (typeof history[i]?.dt === 'number' && Number.isFinite(history[i].dt) && history[i].dt > 0)
                    ? history[i].dt
                    : 1.0;
                vel[i] = dTheta / dt;
            }
            return {
                values: vel,
                validMask: new Array(vel.length).fill(true),
                status: 'DERIVED',
                unit: 'rad/s',
                latestVal: vel[vel.length - 1],
                minVal: Math.min(...vel),
                maxVal: Math.max(...vel)
            };
        }

        if (metricKey === 'phase_spread_rad') {
            const spreads = history.map(entry => this.computeCircularSpreadRad(entry?.node_phases));
            const validMask = spreads.map(v => typeof v === 'number' && Number.isFinite(v));
            if (!validMask.some(Boolean)) {
                return { values: new Array(history.length).fill(null), validMask, status: 'UNPOPULATED', unit: 'rad', latestVal: null, minVal: null, maxVal: null };
            }
            const finiteVals = spreads.filter(v => typeof v === 'number' && Number.isFinite(v));
            return {
                values: spreads,
                validMask,
                status: 'DERIVED',
                unit: 'rad',
                latestVal: spreads[spreads.length - 1] ?? null,
                minVal: Math.min(...finiteVals),
                maxVal: Math.max(...finiteVals)
            };
        }

        if (metricKey === 'coherence_deficit') {
            const deficits = history.map(entry => {
                const r = getTraceObj(entry, 'phase_coherence_r')?.value;
                return (typeof r === 'number' && Number.isFinite(r)) ? (1 - r) : null;
            });
            const validMask = deficits.map(v => typeof v === 'number' && Number.isFinite(v));
            if (!validMask.some(Boolean)) {
                return { values: new Array(history.length).fill(null), validMask, status: 'UNPOPULATED', unit: '1-r', latestVal: null, minVal: null, maxVal: null };
            }
            const finiteVals = deficits.filter(v => typeof v === 'number' && Number.isFinite(v));
            return {
                values: deficits,
                validMask,
                status: 'DERIVED',
                unit: '1-r',
                latestVal: deficits[deficits.length - 1] ?? null,
                minVal: Math.min(...finiteVals),
                maxVal: Math.max(...finiteVals)
            };
        }

        return { values: new Array(history.length).fill(null), validMask: new Array(history.length).fill(false), status: 'UNKNOWN', unit: '', latestVal: null, minVal: null, maxVal: null };
    }

    applyHistoryMetrics(hist) {
        if (!Array.isArray(hist) || hist.length === 0) return;

        const m1 = this.computeMetricSeries(this.state.ch1Metric, hist);
        const m2 = this.computeMetricSeries(this.state.ch2Metric, hist);

        const s1 = (this.state.unwrapPhase && this.state.ch1Metric !== 'unwrapped_phase_rad' && m1.status !== 'UNPOPULATED')
            ? this.unwrapSeries(m1.values.map(v => Number.isFinite(v) ? v : 0))
            : m1.values;
        const s2 = (this.state.unwrapPhase && this.state.ch2Metric !== 'unwrapped_phase_rad' && m2.status !== 'UNPOPULATED')
            ? this.unwrapSeries(m2.values.map(v => Number.isFinite(v) ? v : 0))
            : m2.values;

        this._ch1ValidMask = new Array(this.numPoints).fill(false);
        this._ch2ValidMask = new Array(this.numPoints).fill(false);

        const len = s1.length;
        for (let i = 0; i < this.numPoints; i++) {
            const pos = len === 1 ? 0 : (i / Math.max(1, this.numPoints - 1)) * (len - 1);
            const idx0 = Math.floor(pos);
            const idx1 = Math.min(idx0 + 1, len - 1);
            const frac = pos - idx0;

            const v1a = s1[idx0], v1b = s1[idx1];
            if (typeof v1a === 'number' && Number.isFinite(v1a) && typeof v1b === 'number' && Number.isFinite(v1b)) {
                this.ch1Buffer[i] = v1a + (v1b - v1a) * frac;
                this._ch1ValidMask[i] = true;
            } else {
                this.ch1Buffer[i] = NaN;
            }

            const v2a = s2[idx0], v2b = s2[idx1];
            if (typeof v2a === 'number' && Number.isFinite(v2a) && typeof v2b === 'number' && Number.isFinite(v2b)) {
                this.ch2Buffer[i] = v2a + (v2b - v2a) * frac;
                this._ch2ValidMask[i] = true;
            } else {
                this.ch2Buffer[i] = NaN;
            }
        }

        this.refreshDigitalBuffer();
        this.updateChannelReadouts(m1, m2);
        this.updateRunMetadata(this._lastPayload, hist);
    }

    refreshDigitalBuffer() {
        const trigBuf = this.state.trigSource === 'ch2' ? this.ch2Buffer : this.ch1Buffer;
        for (let i = 0; i < this.numPoints; i++) {
            const v = trigBuf[i];
            this.digitalBuffer[i] = (Number.isFinite(v) && v > this.state.triggerLevel) ? 1 : 0;
        }
    }

    formatScientificNumber(val) {
        if (val === null || val === undefined || !Number.isFinite(val)) return 'null';
        const abs = Math.abs(val);
        if (abs === 0) return '0.000';
        if (abs < 1e-3 || abs >= 1e4) return val.toExponential(2);
        return val.toFixed(4);
    }

    updateChannelReadouts(m1, m2) {
        const formatChannelSummary = (m) => {
            if (!m || m.status === 'UNPOPULATED' || m.latestVal === null || !Number.isFinite(m.latestVal)) {
                return 'null';
            }
            const latestStr = this.formatScientificNumber(m.latestVal);
            const minStr = this.formatScientificNumber(m.minVal);
            const maxStr = this.formatScientificNumber(m.maxVal);
            const unitStr = m.unit ? ` ${m.unit}` : '';
            return `${latestStr}${unitStr} [${minStr}..${maxStr}]`;
        };

        const stat1 = this.controlPanel?.querySelector('#stat-ch1');
        const stat2 = this.controlPanel?.querySelector('#stat-ch2');
        const vdiv1 = this.controlPanel?.querySelector('#txt-vdiv-ch1');
        const vdiv2 = this.controlPanel?.querySelector('#txt-vdiv-ch2');

        if (vdiv1) vdiv1.textContent = `${this.state.ch1VoltsPerDiv.toFixed(2)} ${m1.unit || 'u'}/div`;
        if (vdiv2) vdiv2.textContent = `${this.state.ch2VoltsPerDiv.toFixed(2)} ${m2.unit || 'u'}/div`;

        if (stat1) {
            const color1 = m1.status === 'UNPOPULATED' ? '#f59e0b' : '#38bdf8';
            stat1.innerHTML = `<span style="color:${color1}">${m1.status}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${formatChannelSummary(m1)}</span>`;
        }
        if (stat2) {
            const color2 = m2.status === 'UNPOPULATED' ? '#f59e0b' : '#f472b6';
            stat2.innerHTML = `<span style="color:${color2}">${m2.status}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${formatChannelSummary(m2)}</span>`;
        }
    }

    updateRunMetadata(payload, hist) {
        const el = this.controlPanel?.querySelector('#txt-run-meta');
        if (!el) return;
        const latest = payload?.projection?.latest || (Array.isArray(hist) ? hist[hist.length - 1] : null);
        const modelId = payload?.model_id || payload?.projection?.model_id || latest?.model_id || this._contextModelId || null;
        const step = latest?.step ?? latest?.seq ?? null;
        const simTime = (typeof latest?.sim_time === 'number' && Number.isFinite(latest.sim_time))
            ? `t=${latest.sim_time.toFixed(2)}`
            : null;

        const parts = [];
        if (modelId) parts.push(String(modelId));
        if (step !== null && step !== undefined) parts.push(`#${step}`);
        if (simTime) parts.push(simTime);
        el.textContent = parts.length ? parts.join(' · ') : 'live stream';
    }

    fitChannelScale(chNum) {
        const buf = chNum === 1 ? this.ch1Buffer : this.ch2Buffer;
        if (!buf || buf.length === 0) return;

        let minV = Infinity;
        let maxV = -Infinity;
        for (let i = 0; i < buf.length; i++) {
            const v = buf[i];
            if (typeof v === 'number' && Number.isFinite(v)) {
                if (v < minV) minV = v;
                if (v > maxV) maxV = v;
            }
        }
        if (minV === Infinity || maxV === -Infinity) return;

        const span = Math.max(maxV - minV, 1e-4);
        const mid = (maxV + minV) * 0.5;
        const idealDiv = Math.min(5.0, Math.max(0.02, span / 6));
        const clampedOffset = Math.min(4.0, Math.max(-4.0, -mid / idealDiv));

        if (chNum === 1) {
            this.state.ch1VoltsPerDiv = idealDiv;
            this.state.ch1Offset = clampedOffset;
            const rngV = this.controlPanel?.querySelector('#rng-vdiv-ch1');
            const rngO = this.controlPanel?.querySelector('#rng-off-ch1');
            if (rngV) rngV.value = idealDiv.toFixed(2);
            if (rngO) rngO.value = clampedOffset.toFixed(1);
        } else {
            this.state.ch2VoltsPerDiv = idealDiv;
            this.state.ch2Offset = clampedOffset;
            const rngV = this.controlPanel?.querySelector('#rng-vdiv-ch2');
            const rngO = this.controlPanel?.querySelector('#rng-off-ch2');
            if (rngV) rngV.value = idealDiv.toFixed(2);
            if (rngO) rngO.value = clampedOffset.toFixed(1);
        }

        if (this._lastHistory) this.applyHistoryMetrics(this._lastHistory);
    }

    renderGrid() {
        const ctx = this.ctxGrid;
        ctx.clearRect(0, 0, this.width, this.height);

        const divsX = this.state.gridDivsX;
        const divsY = this.state.gridDivsY;
        const stepX = this.width / divsX;
        const stepY = this.height / divsY;

        // Dark Background Grid Line Styling
        ctx.strokeStyle = 'rgba(30, 58, 138, 0.25)';
        ctx.lineWidth = 1;

        // Draw Minor Grid Reticle
        ctx.beginPath();
        for (let x = 0; x <= this.width; x += stepX / 5) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
        }
        for (let y = 0; y <= this.height; y += stepY / 5) {
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
        }
        ctx.stroke();

        // Draw Major Divisions Grid
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i <= divsX; i++) {
            ctx.moveTo(i * stepX, 0);
            ctx.lineTo(i * stepX, this.height);
        }
        for (let j = 0; j <= divsY; j++) {
            ctx.moveTo(0, j * stepY);
            ctx.lineTo(this.width, j * stepY);
        }
        ctx.stroke();

        // Draw Center Zero Axes
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, this.height / 2);
        ctx.lineTo(this.width, this.height / 2);
        ctx.moveTo(this.width / 2, 0);
        ctx.lineTo(this.width / 2, this.height);
        ctx.stroke();

        // Draw Trigger Level Marker Line
        const trigY = (this.height / 2) - (this.state.triggerLevel / this.state.ch1VoltsPerDiv) * stepY;
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, trigY);
        ctx.lineTo(this.width, trigY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Trigger Marker Icon
        ctx.fillStyle = '#10b981';
        ctx.font = '10px monospace';
        ctx.fillText('T', 6, trigY - 4);
    }

    animate() {
        requestAnimationFrame(this.animate);

        const ctx = this.ctxTrace;

        // Phosphor decay overlay effect
        ctx.fillStyle = `rgba(3, 7, 18, ${1.0 - this.state.persistence})`;
        ctx.fillRect(0, 0, this.width, this.height);

        const divsY = this.state.gridDivsY;
        const stepY = this.height / divsY;
        const centerY = this.height / 2;

        // Dynamic horizontal step scaling based on Time / Div slider
        const timeScale = 1.0 / Math.max(0.1, this.state.timePerDiv);
        const stepX = (this.width / this.numPoints) * timeScale;

        // 1. Draw CH1 Analog Trace (Cyan)
        if (this.state.ch1Enabled) {
            ctx.strokeStyle = '#06b6d4';
            ctx.shadowColor = '#06b6d4';
            ctx.shadowBlur = 8;
            ctx.lineWidth = 2.0;
            ctx.beginPath();

            let hasStarted1 = false;
            for (let i = 0; i < this.numPoints; i++) {
                const raw1 = this.ch1Buffer[i];
                if (!Number.isFinite(raw1)) {
                    hasStarted1 = false;
                    continue;
                }
                const val = raw1 + this.state.ch1Offset;
                const x = i * stepX;
                const y = centerY - (val / this.state.ch1VoltsPerDiv) * stepY;

                if (!hasStarted1) {
                    ctx.moveTo(x, y);
                    hasStarted1 = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // 2. Draw CH2 Analog Trace (Magenta)
        if (this.state.ch2Enabled) {
            ctx.strokeStyle = '#ec4899';
            ctx.shadowColor = '#ec4899';
            ctx.shadowBlur = 8;
            ctx.lineWidth = 2.0;
            ctx.beginPath();

            let hasStarted2 = false;
            for (let i = 0; i < this.numPoints; i++) {
                const raw2 = this.ch2Buffer[i];
                if (!Number.isFinite(raw2)) {
                    hasStarted2 = false;
                    continue;
                }
                const val = raw2 + this.state.ch2Offset;
                const x = i * stepX;
                const y = centerY - (val / this.state.ch2VoltsPerDiv) * stepY;

                if (!hasStarted2) {
                    ctx.moveTo(x, y);
                    hasStarted2 = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // 3. Draw Digital Pod Channels (Green Logic Lanes)
        if (this.state.digitalEnabled) {
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 1.2;
            const digYBase = this.height - 40;
            const digHeight = 16;

            ctx.beginPath();
            for (let i = 0; i < this.numPoints; i++) {
                const bit = this.digitalBuffer[i];
                const x = i * stepX;
                const y = digYBase - (bit * digHeight);

                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Protocol Overlay Decoder Annotation
            if (this.state.protocolDecode) {
                ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
                ctx.fillRect(this.width * 0.15, digYBase - 22, 120, 26);
                ctx.strokeStyle = '#10b981';
                ctx.strokeRect(this.width * 0.15, digYBase - 22, 120, 26);

                ctx.fillStyle = '#34d399';
                ctx.font = '10px monospace';
                ctx.fillText('PCIe 5.0 [0x7E]', this.width * 0.15 + 8, digYBase - 6);
            }
        }

        // 4. Draw FFT Spectrum Overlay (Purple Bars)
        if (this.state.fftMode) {
            ctx.fillStyle = 'rgba(168, 85, 247, 0.35)';
            const barWidth = this.width / 128;
            for (let i = 0; i < 128; i++) {
                const mag = Math.abs(Math.sin(i * 0.1) * 0.7 + (Math.random() * 0.15)) * (this.height * 0.35);
                ctx.fillRect(i * barWidth, this.height - mag, barWidth - 1, mag);
            }
        }
    }

    connect(url = '/ws/oscilloscope') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = url.startsWith('ws') ? url : `${protocol}//${window.location.host}${url}`;

        console.log(`[CH-01] Connecting to Oscilloscope telemetry stream: ${wsUrl}`);
        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            console.log("[CH-01] WebSocket connected successfully.");
        };

        this.ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                this.updateWaveform(event.data);
                return;
            }
            if (typeof event.data === 'string') {
                try {
                    const payload = JSON.parse(event.data);
                    this.updateWaveform(payload);
                } catch (err) {
                    console.warn('[CH-01] Failed to parse WS JSON frame:', err);
                }
            }
        };

        this.ws.onerror = (error) => {
            console.error("[CH-01] WebSocket error:", error);
        };

        this.ws.onclose = () => {
            console.warn("[CH-01] WebSocket disconnected. Attempting reconnect in 3s...");
            setTimeout(() => this.connect(url), 3000);
        };
    }
}
// Export for global loading
if (typeof window !== 'undefined') {
    window.OscilloscopeViewer = OscilloscopeViewer;
}