export class RawMatrixViewer {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
        if (!this.container) {
            console.error('[CH-03] Container element not found.');
            return;
        }

        this.currentData = null;
        this.baseMatrix = null;
        this.gridSize = 32;
        this.numSlices = 32;
        this.currentZ = 0;
        this.isHueMode = true; // true = Option B (Full Hue Heatmap), false = Option A (Monochrome Depth Sweep)
        this.numberFormat = 'float'; // Default format ('float', 'hex', 'sci')
        this._lastPayload = null;
        this._contextModelId = null;
        this._unsubscribeStream = null;
        this.lastSeq = -1;
        this.lastStep = -1;
        this.activeNodesCount = null;
        this.coupledMask = null;
        this.slicePeakAbs = 1.0;
        this.renderLayout();
        this.initListeners();

        // Listen to unified v3 telemetry broadcast if a stream client isn't explicitly passed
        const v3Channel = typeof BroadcastChannel !== 'undefined'
            ? new BroadcastChannel('hte_unified_telemetry_v3')
            : null;
        if (v3Channel) {
            v3Channel.onmessage = (event) => {
                const frame = event?.data;
                if (!frame || typeof frame !== 'object') return;
                if (frame.projections && frame.projections['CH-03']) {
                    this.update({
                        ...frame,
                        projection: frame.projections['CH-03'],
                    });
                } else if (frame.projection?.matrix) {
                    this.update(frame);
                }
            };
        }

        // Legacy fallback channel for standalone HUD node broadcasts
        const legacyChannel = typeof BroadcastChannel !== 'undefined'
            ? new BroadcastChannel('holographic_telemetry_channel')
            : null;
        if (legacyChannel) {
            legacyChannel.onmessage = (event) => {
                const data = event?.data;
                if (!data || typeof data !== 'object') return;
                if (typeof this.lastSeq === 'number' && this.lastSeq >= 0) return;
                if ((data.type === 'hud_update' || data.type === 'hud_model_state') && Array.isArray(data.nodes)) {
                    this.update(data);
                }
            };
        }

        if (options.streamClient) {
            this.bindStreamClient(options.streamClient);
        }
    }

    _(selector) {
        return this.container ? this.container.querySelector(selector) : null;
    }

    bindStreamClient(streamClient) {
        if (!streamClient || typeof streamClient.on !== 'function') return;
        if (typeof this._unsubscribeStream === 'function') {
            this._unsubscribeStream();
        }
        this._unsubscribeStream = streamClient.on('CH-03', (payload) => {
            if (payload) {
                this.update(payload);
            }
        });
    }

    renderLayout() {
        this.container.innerHTML = `
        <div class="matrix-app-container" style="display: flex; flex-direction: column; height: 100%; width: 100%; padding: 15px; box-sizing: border-box; background: #050808; font-family: 'Courier New', Courier, monospace; color: #00ffcc;">
            
            <!-- Top Header & Format Toolbar -->
            <div class="matrix-header" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; margin-bottom: 15px; border-bottom: 1px solid #00ffcc33; padding-bottom: 10px;">
                <div style="display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1 1 220px;">
                    <div style="font-size: 13px; letter-spacing: 2px; color: #00ffcc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        CH-03 // TENSOR MATRIX INSPECTOR // INVARIANT LAB
                    </div>
                    <div id="matrixMetaBar" style="font-size: 10px; color: #00ffcc99; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        AWAITING MATRIX STREAM
                    </div>
                </div>
                <div class="controls-toolbar" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px; flex: 0 1 auto;">
                    <span style="font-size: 11px; color: #ff00ff; letter-spacing: 1px; margin-right: 2px;">FORMAT:</span>
                    <button type="button" class="hud-btn" id="formatHex" style="background: transparent; border: 1px solid #00ffcc; color: #00ffcc; padding: 4px 8px; font-size: 11px; font-family: monospace; cursor: pointer;">HEX</button>
                    <button type="button" class="hud-btn active" id="formatFloatBtn" style="background: #00ffcc; border: 1px solid #00ffcc; color: #000; padding: 4px 8px; font-size: 11px; font-family: monospace; cursor: pointer;">FLOAT32</button>
                    <button type="button" class="hud-btn" id="formatSciBtn" style="background: transparent; border: 1px solid #00ffcc; color: #00ffcc; padding: 4px 8px; font-size: 11px; font-family: monospace; cursor: pointer;">SCIENTIFIC</button>
                </div>
            </div>

            <!-- Main Workspace Body -->
            <div style="display: flex; flex: 1; gap: 20px; overflow: hidden;">
                
                <!-- Left Sidebar: Metrics & Controls -->
                <div style="width: 260px; display: flex; flex-direction: column; gap: 12px; flex-shrink: 0; overflow-y: auto; padding-right: 5px;">
                    
                    <!-- Metric Cards -->
                    <div style="background: #00ffcc08; border: 1px solid #00ffcc33; padding: 10px;">
                        <div style="font-size: 10px; color: #00ffcc88; letter-spacing: 1px;">Frobenius Norm</div>
                        <div id="metricNorm" style="font-size: 16px; color: #ff00ff; font-weight: bold; margin-top: 4px;">0.0000</div>
                    </div>
                    <div style="background: #00ffcc08; border: 1px solid #00ffcc33; padding: 10px;">
                        <div style="font-size: 10px; color: #00ffcc88; letter-spacing: 1px;">Matrix Trace</div>
                        <div id="metricTrace" style="font-size: 16px; color: #ff00ff; font-weight: bold; margin-top: 4px;">0.0000</div>
                    </div>
                    <div style="background: #00ffcc08; border: 1px solid #00ffcc33; padding: 10px;">
                        <div style="font-size: 10px; color: #00ffcc88; letter-spacing: 1px;">Sparsity Density</div>
                        <div id="metricSparsity" style="font-size: 16px; color: #00ffcc; font-weight: bold; margin-top: 4px;">0.0%</div>
                    </div>
                    <div style="background: #00ffcc08; border: 1px solid #00ffcc33; padding: 10px;">
                        <div style="font-size: 10px; color: #00ffcc88; letter-spacing: 1px;">Peak Amplitude (Min / Max)</div>
                        <div id="metricMinMax" style="font-size: 14px; color: #ff00ff; font-weight: bold; margin-top: 4px;">0.00 / 0.00</div>
                        <div id="metricPeakCoord" style="font-size: 10px; color: #00ffccaa; margin-top: 3px;">Peak @ (-, -) · Active N: -</div>
                    </div>
                    <div style="background: #00ffcc08; border: 1px solid #00ffcc33; padding: 8px 10px;">
                        <div style="font-size: 10px; color: #00ffcc88; letter-spacing: 1px;">Cell Probe</div>
                        <div id="matrixCellProbe" style="font-size: 11px; color: #00ffcc; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Hover cell to inspect (r, c)</div>
                    </div>

                    <!-- Spatial Z-Slice Filter -->
                    <div style="background: #00ffcc08; border: 1px solid #00ffcc33; padding: 10px;">
                        <div style="font-size: 10px; color: #00ffcc88; letter-spacing: 1px; margin-bottom: 6px;">Spatial Z-Slice Filter</div>
                        <input type="range" id="zSlicerRange" min="0" max="31" value="0" style="width: 100%; accent-color: #00ffcc; cursor: pointer;">
                        <div id="zSliceVal" style="font-size: 11px; color: #ff00ff; margin-top: 4px;">Index: 0 / 31</div>
                    </div>

                    <!-- A/B Mode Toggle Button -->
                    <div style="background: #ff00ff08; border: 1px solid #ff00ff44; padding: 10px;">
                        <div style="font-size: 10px; color: #ff00ffaa; letter-spacing: 1px; margin-bottom: 6px;">Visual Shader Mode</div>
                        <button type="button" id="modeToggleBtn" style="width: 100%; background: transparent; border: 1px solid #ff00ff; color: #ff00ff; padding: 6px; font-family: monospace; font-size: 11px; cursor: pointer; letter-spacing: 1px;">Mode: Full Hue Heatmap (B)</button>
                    </div>

                    <!-- Color Index / Legend Reference -->
                    <div style="background: #00ffcc08; border: 1px solid #00ffcc33; padding: 10px;">
                        <div style="font-size: 10px; color: #00ffcc88; letter-spacing: 1px; margin-bottom: 6px;">Color Index Reference</div>
                        <div style="height: 12px; width: 100%; background: linear-gradient(to right, #00b4ff, #050808, #00ffaa); border: 1px solid #00ffcc44; margin-bottom: 4px;"></div>
                        <div style="display: flex; justify-content: space-between; font-size: 9px; color: #00ffccaa;">
                            <span>(-Neg)</span>
                            <span>(Zero)</span>
                            <span>(+Pos)</span>
                        </div>
                        <div id="matrixScaleRange" style="display: flex; justify-content: space-between; font-size: 9px; color: #ff00ffcc; margin-top: 4px;">
                            <span>MIN: 0.000</span>
                            <span>MAX: 0.000</span>
                        </div>
                    </div>

                </div>

                <!-- Right Viewport: Scaled Matrix Table Grid -->
                <div style="flex: 1; min-width: 0; min-height: 0; background: #020404; border: 1px solid #00ffcc33; overflow: auto; display: flex; align-items: stretch; justify-content: stretch; padding: 6px; box-sizing: border-box;">
                    <table id="matrix-table" style="border-collapse: collapse; width: 100%; height: 100%; table-layout: fixed; font-size: 9.5px; text-align: center;">
                        <!-- Dynamically populated rows -->
                    </table>
                </div>

            </div>
        </div>
        `;
    }

    initListeners() {
        const slider = this._('#zSlicerRange');
        if (slider) {
            slider.addEventListener('input', (e) => {
                this.setZSlice(parseInt(e.target.value, 10));
            });
        }

        const modeBtn = this._('#modeToggleBtn');
        if (modeBtn) {
            modeBtn.addEventListener('click', () => {
                this.toggleColorMode();
                modeBtn.textContent = this.isHueMode
                    ? 'Mode: Full Hue Heatmap (B)'
                    : 'Mode: Monochrome Sweep (A)';
            });
        }

        const btnHex = this._('#formatHex');
        const btnFloat = this._('#formatFloatBtn');
        const btnSci = this._('#formatSciBtn');

        const updateFormatButtons = (activeBtn) => {
            [btnHex, btnFloat, btnSci].forEach((b) => {
                if (!b) return;
                b.classList.remove('active');
                b.style.background = 'transparent';
                b.style.color = '#00ffcc';
            });
            if (activeBtn) {
                activeBtn.classList.add('active');
                activeBtn.style.background = '#00ffcc';
                activeBtn.style.color = '#000';
            }
        };

        if (btnFloat) updateFormatButtons(btnFloat);

        if (btnHex) {
            btnHex.addEventListener('click', () => {
                this.numberFormat = 'hex';
                updateFormatButtons(btnHex);
                if (this.currentData) this.renderGrid(this.currentData);
            });
        }

        if (btnFloat) {
            btnFloat.addEventListener('click', () => {
                this.numberFormat = 'float';
                updateFormatButtons(btnFloat);
                if (this.currentData) this.renderGrid(this.currentData);
            });
        }

        if (btnSci) {
            btnSci.addEventListener('click', () => {
                this.numberFormat = 'sci';
                updateFormatButtons(btnSci);
                if (this.currentData) this.renderGrid(this.currentData);
            });
        }
    }

    setContextModel(modelId) {
        this._contextModelId = modelId || null;
        this.updateMetaHeader(this._lastPayload);
    }

    updateMetaHeader(payload) {
        const metaEl = this._('#matrixMetaBar');
        if (!metaEl) return;

        const proj = payload?.projection || (Array.isArray(payload?.matrix) ? payload : null);
        const modelId = payload?.model_id || proj?.model_id || this._contextModelId || 'live_stream';
        const step = payload?.step ?? proj?.step ?? null;
        const seq = payload?.seq ?? proj?.seq ?? null;
        const mode = payload?.mode ?? proj?.mode ?? null;
        const shapeLabel = `${this.gridSize}×${this.gridSize} × ${this.numSlices}Z`;

        const parts = [String(modelId), shapeLabel];
        if (step !== null && step !== undefined) parts.push(`step #${step}`);
        if (seq !== null && seq !== undefined) parts.push(`seq ${seq}`);
        if (mode) parts.push(String(mode));
        metaEl.textContent = parts.join(' · ');
    }

    syncSliceSliderRange() {
        const slider = this._('#zSlicerRange');
        const maxIdx = Math.max(0, this.numSlices - 1);
        if (this.currentZ > maxIdx) {
            this.currentZ = 0;
        }
        if (slider) {
            slider.max = String(maxIdx);
            slider.value = String(this.currentZ);
        }
        const zValSpan = this._('#zSliceVal');
        if (zValSpan) {
            zValSpan.innerText = `Index: ${this.currentZ} / ${maxIdx}`;
        }
    }

    toggleColorMode() {
        this.isHueMode = !this.isHueMode;
        if (this.currentData) {
            this.renderGrid(this.currentData);
        }
    }

    extractFloat32FromBuffer(buffer) {
        if (buffer instanceof Float32Array) {
            return buffer;
        }
        if (!(buffer instanceof ArrayBuffer)) {
            return new Float32Array(0);
        }
        if (buffer.byteLength >= 24) {
            const view = new DataView(buffer);
            const magic = String.fromCharCode(
                view.getUint8(0),
                view.getUint8(1),
                view.getUint8(2),
                view.getUint8(3)
            );
            if (magic === 'HTEF') {
                const payloadBytes = buffer.byteLength - 24;
                const count = Math.floor(payloadBytes / 4);
                return new Float32Array(buffer, 24, count);
            }
        }
        const count = Math.floor(buffer.byteLength / 4);
        return new Float32Array(buffer, 0, count);
    }

    buildMultiSliceTensor(sourceArray, gridSize, stepPhase = 0) {
        this.gridSize = gridSize;
        this.numSlices = 32;
        const sliceSize = gridSize * gridSize;
        const multiSliceData = new Float32Array(sliceSize * this.numSlices);
        const srcLen = Math.max(1, sourceArray.length);

        for (let z = 0; z < this.numSlices; z++) {
            const zPhase = (z / this.numSlices) * Math.PI * 2 + stepPhase;
            for (let idx = 0; idx < sliceSize; idx++) {
                const baseVal = sourceArray[idx % srcLen];
                const mod = Math.cos(zPhase + (idx * 0.005));
                multiSliceData[z * sliceSize + idx] = baseVal * mod;
            }
        }
        return multiSliceData;
    }

    update(input) {
        if (!input) return;

        if (
            input &&
            typeof input === 'object' &&
            !ArrayBuffer.isView(input) &&
            !Array.isArray(input) &&
            !(input instanceof ArrayBuffer)
        ) {
            const proj = input.projection || input;
            const rawSeq = input.seq ?? proj.seq;
            const rawStep = input.step ?? proj.step;
            const incomingSeq = Number.isInteger(Number(rawSeq)) && rawSeq !== null && rawSeq !== undefined
                ? Number(rawSeq)
                : null;
            const incomingStep = Number.isFinite(Number(rawStep)) && rawStep !== null && rawStep !== undefined
                ? Number(rawStep)
                : null;

            // Drop stale out-of-order frames if seq is present
            if (incomingSeq !== null && typeof this.lastSeq === 'number' && this.lastSeq >= 0 && incomingSeq < this.lastSeq) {
                return;
            }

            // Ignore unsequenced node-only broadcasts once live backend frames are streaming
            const hasMatrix = Array.isArray(proj.matrix) && proj.matrix.length > 0 && Array.isArray(proj.matrix[0]);
            if (!hasMatrix && typeof this.lastSeq === 'number' && this.lastSeq >= 0 && incomingSeq === null) {
                return;
            }

            this._lastPayload = input;
            if (incomingSeq !== null) {
                this.lastSeq = incomingSeq;
            }
            if (incomingStep !== null) {
                this.lastStep = incomingStep;
            }

            const stepNum = Number(incomingStep ?? incomingSeq ?? 0);
            const tsNum = Number(input.timestamp ?? 0);
            const stepPhase = Number.isFinite(stepNum) && stepNum !== 0
                ? (stepNum * 0.15)
                : (Number.isFinite(tsNum) ? (tsNum % (Math.PI * 2)) : 0);

            if (hasMatrix) {
                this.activeNodesCount = Number.isFinite(Number(proj.active_nodes))
                    ? Number(proj.active_nodes)
                    : Math.min(proj.matrix.length, proj.matrix[0].length);
                this.coupledMask = Array.isArray(proj.coupled_mask) ? proj.coupled_mask : null;

                const n = Math.max(1, Math.min(proj.matrix.length, proj.matrix[0].length, 32));
                const matFlat = new Float32Array(n * n);
                for (let r = 0; r < n; r++) {
                    const rowArr = proj.matrix[r] || [];
                    for (let c = 0; c < n; c++) {
                        const v = Number(rowArr[c]);
                        matFlat[r * n + c] = Number.isFinite(v) ? v : 0.0;
                    }
                }
                this.baseMatrix = matFlat;
                this.currentData = this.buildMultiSliceTensor(matFlat, n, stepPhase);
                this.syncSliceSliderRange();
                this.updateMetaHeader(input);
                this.computeInvariants(this.currentData);
                this.renderGrid(this.currentData);
                return;
            }

            if (Array.isArray(input.nodes) && input.nodes.length > 0) {
                input = input.nodes;
            } else {
                return;
            }
        }

        let float32Array;
        if (Array.isArray(input)) {
            float32Array = new Float32Array(input.length);
            for (let i = 0; i < input.length; i++) {
                const n = input[i];
                const rawVal = typeof n === 'number' ? n : (n?.x ?? n?.phase ?? 0);
                float32Array[i] = Number.isFinite(rawVal) ? rawVal : 0.0;
            }
        } else if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
            float32Array = this.extractFloat32FromBuffer(input);
        } else {
            return;
        }

        if (!float32Array || float32Array.length === 0) return;

        const nowSec = (performance.now() * 0.001) % (Math.PI * 2);
        this.currentData = this.buildMultiSliceTensor(float32Array, 32, nowSec);
        this.syncSliceSliderRange();
        this.updateMetaHeader(this._lastPayload);
        this.computeInvariants(this.currentData);
        this.renderGrid(this.currentData);
    }

    computeInvariants(data) {
        if (!data || data.length === 0) return;

        let frobeniusSum = 0;
        let trace = 0;
        let zeros = 0;
        let min = Infinity;
        let max = -Infinity;
        let peakAbs = 0;
        let peakRow = 0;
        let peakCol = 0;

        const N = this.gridSize;
        const sliceSize = N * N;
        const startIdx = Math.min(this.currentZ, Math.max(0, this.numSlices - 1)) * sliceSize;
        const endIdx = Math.min(startIdx + sliceSize, data.length);
        const countInSlice = Math.max(1, endIdx - startIdx);

        for (let i = startIdx; i < endIdx; i++) {
            const val = Number.isFinite(data[i]) ? data[i] : 0.0;
            const localOffset = i - startIdx;
            frobeniusSum += val * val;
            if (localOffset % (N + 1) === 0) {
                trace += val;
            }
            if (Math.abs(val) < 1e-5) zeros++;
            if (val < min) min = val;
            if (val > max) max = val;
            const absVal = Math.abs(val);
            if (absVal > peakAbs) {
                peakAbs = absVal;
                peakRow = Math.floor(localOffset / N);
                peakCol = localOffset % N;
            }
        }

        this.slicePeakAbs = peakAbs > 1e-6 ? peakAbs : 1.0;

        const frobNorm = Math.sqrt(frobeniusSum);
        const sparsity = (zeros / countInSlice) * 100;

        const mNorm = this._('#metricNorm');
        const mTrace = this._('#metricTrace');
        const mSparsity = this._('#metricSparsity');
        const mMinMax = this._('#metricMinMax');
        const peakCoordEl = this._('#metricPeakCoord');
        if (peakCoordEl) {
            const activeLabel = this.activeNodesCount !== null ? this.activeNodesCount : N;
            peakCoordEl.innerText = peakAbs > 1e-6
                ? `Peak @ (${peakRow}, ${peakCol}) · Active N: ${activeLabel}`
                : `Peak @ (-, -) · Active N: ${activeLabel}`;
        }
        const safeMin = min === Infinity ? 0 : min;
        const safeMax = max === -Infinity ? 0 : max;

        if (mNorm) mNorm.innerText = frobNorm.toFixed(4);
        if (mTrace) mTrace.innerText = trace.toFixed(4);
        if (mSparsity) mSparsity.innerText = sparsity.toFixed(1) + '%';
        if (mMinMax) {
            mMinMax.innerText = `${safeMin.toFixed(2)} / ${safeMax.toFixed(2)}`;
        }

        const scaleRangeEl = this._('#matrixScaleRange');
        if (scaleRangeEl) {
            scaleRangeEl.innerHTML = `<span>MIN: ${safeMin.toFixed(3)}</span><span>MAX: ${safeMax.toFixed(3)}</span>`;
        }
    }

    setZSlice(z) {
        const maxIdx = Math.max(0, this.numSlices - 1);
        const clamped = Number.isFinite(z) ? Math.max(0, Math.min(maxIdx, z)) : 0;
        this.currentZ = clamped;

        const slider = this._('#zSlicerRange');
        const zValSpan = this._('#zSliceVal');

        if (slider) {
            slider.max = String(maxIdx);
            slider.value = String(clamped);
        }
        if (zValSpan) {
            zValSpan.innerText = `Index: ${clamped} / ${maxIdx}`;
        }

        const tableElem = this._('#matrix-table');
        if (tableElem) {
            tableElem.style.transition = 'none';
            tableElem.style.opacity = '0.4';
            requestAnimationFrame(() => {
                tableElem.style.transition = 'opacity 0.12s ease-out';
                tableElem.style.opacity = '1.0';
            });
        }

        if (this.currentData) {
            this.computeInvariants(this.currentData);
            this.renderGrid(this.currentData);
        }
    }

    renderGrid(data) {
        const table = this._('#matrix-table');
        if (!table || !data) return;

        const N = this.gridSize;
        const sliceSize = N * N;
        const startIdx = Math.min(this.currentZ, Math.max(0, this.numSlices - 1)) * sliceSize;
        const cellPad = N > 16 ? '1px 1px' : '3px 2px';
        const fontSize = N > 16 ? '8.5px' : '10.5px';
        table.style.fontSize = fontSize;

        let html = '';
        for (let r = 0; r < N; r++) {
            html += '<tr>';
            for (let c = 0; c < N; c++) {
                const localIdx = r * N + c;
                const dataIdx = startIdx + localIdx;
                const rawVal = data[dataIdx];
                const val = typeof rawVal === 'number' && Number.isFinite(rawVal) ? rawVal : 0.0;

                let formattedVal = '';
                if (this.numberFormat === 'hex') {
                    const intVal = Math.abs(Math.round(val * 100)) & 0xFFFF;
                    formattedVal = '0x' + intVal.toString(16).toUpperCase().padStart(4, '0');
                } else if (this.numberFormat === 'sci') {
                    const amp = val.toFixed(2);
                    formattedVal = `⟨ψ|${amp}⟩`;
                } else {
                    formattedVal = val.toFixed(2);
                }

                const relNorm = Math.min(1, Math.abs(val) / this.slicePeakAbs);
                const boosted = Math.pow(relNorm, 0.65);
                const isQuietBackground = Math.abs(val) < 0.08;
                const useDarkText = !isQuietBackground && boosted >= 0.55;
                let bgStyle = '';

                if (isQuietBackground) {
                    bgStyle = 'background-color: rgba(5, 12, 14, 0.35);';
                } else if (this.isHueMode) {
                    if (val > 0) {
                        const alpha = (0.18 + boosted * 0.76).toFixed(2);
                        bgStyle = `background-color: rgba(0, 255, 170, ${alpha});`;
                    } else {
                        const alpha = (0.18 + boosted * 0.76).toFixed(2);
                        bgStyle = `background-color: rgba(0, 180, 255, ${alpha});`;
                    }
                } else {
                    const alpha = (0.14 + boosted * 0.78).toFixed(2);
                    bgStyle = `background-color: rgba(0, 255, 204, ${alpha});`;
                }

                const textColor = isQuietBackground
                    ? 'rgba(130, 185, 180, 0.28)'
                    : (useDarkText ? '#040808' : '#ffffff');
                const textShadow = isQuietBackground
                    ? 'none'
                    : (useDarkText ? '0 0 1px rgba(255, 255, 255, 0.35)' : '0 0 2px #000000');
                const coupledBorder = (this.coupledMask && this.coupledMask[r] && this.coupledMask[r][c])
                    ? 'outline: 1px solid rgba(255, 255, 255, 0.22); outline-offset: -1px;'
                    : '';

                html += `<td data-r="${r}" data-c="${c}" data-val="${val}" style="${bgStyle} ${coupledBorder} color: ${textColor}; text-shadow: ${textShadow}; padding: ${cellPad}; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" class="matrix-cell">${formattedVal}</td>`;
            }
            html += '</tr>';
        }
        table.innerHTML = html;
        if (!table._probeBound) {
            table._probeBound = true;
            table.addEventListener('mouseover', (ev) => {
                const td = ev.target.closest('td.matrix-cell');
                const probeEl = this._('#matrixCellProbe');
                if (!td || !probeEl) return;
                const r = td.getAttribute('data-r');
                const c = td.getAttribute('data-c');
                const v = Number(td.getAttribute('data-val'));
                const isCoupled = this.coupledMask && this.coupledMask[r] && this.coupledMask[r][c];
                const tag = isCoupled ? 'EDGE' : 'FIELD';
                probeEl.textContent = `(${r}, ${c}) [${tag}]: ${Number.isFinite(v) ? v.toFixed(4) : '0.0000'}`;
            });
        }
    }

    connect(url = '/ws/matrix') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = url.startsWith('ws') ? url : `${protocol}//${window.location.host}${url}`;

        console.log(`[CH-03] Connecting to Raw Matrix telemetry stream: ${wsUrl}`);
        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            console.log('[CH-03] WebSocket connected successfully.');
        };

        this.ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                this.update(event.data);
                return;
            }
            if (typeof event.data === 'string') {
                try {
                    const payload = JSON.parse(event.data);
                    this.update(payload);
                } catch (err) {
                    console.warn('[CH-03] Failed to parse WS JSON frame:', err);
                }
            }
        };

        this.ws.onerror = (error) => {
            console.error('[CH-03] WebSocket error:', error);
        };

        this.ws.onclose = () => {
            console.warn('[CH-03] WebSocket disconnected. Attempting reconnect in 3s...');
            setTimeout(() => this.connect(url), 3000);
        };
    }
}

if (typeof window !== 'undefined') {
    window.RawMatrixViewer = RawMatrixViewer;
}