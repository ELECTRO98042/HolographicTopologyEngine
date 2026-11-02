class RightConsoleManager {
    constructor() {
        this.activeView = 'ads-cft';
        this.state = {
            adsCft: {
                minimalSurfaceRadius: 1.5,
                entanglementWedgeActive: true,
                conformalDimension: 2.0,
                bulkCutoff: 0.01
            },
            constraints: {
                hamiltonianTolerance: 1e-5,
                momentumTolerance: 1e-4,
                activeSolver: 'BSSN',
                gaugeCondition: '1+log'
            },
            telemetry: {
                sampleRateHz: 60,
                bufferSize: 1024,
                streamEncoding: 'Binary Protobuf',
                telemetryChannel: 'holographic_telemetry_channel'
            },
            simulation: {
                globalTimeScale: 1.0,
                adaptiveMesh: true,
                courantFactor: 0.25,
                dampingCoefficient: 0.02
            }
        };

        // Render default view on load once DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.render());
        } else {
            setTimeout(() => this.render(), 0);
        }
    }

    setView(viewName) {
        this.activeView = viewName;
        this.render();
    }

    updateModuleState(moduleKey, subKey, value) {
        if (this.state[moduleKey]) {
            this.state[moduleKey][subKey] = value;
        }
    }

    render() {
        const container = document.getElementById('right-console-body');
        if (!container) return;

        switch (this.activeView) {
            case 'ads-cft':
                container.innerHTML = this.renderAdSCFTView();
                break;
            case 'constraints':
                container.innerHTML = this.renderConstraintsView();
                break;
            case 'telemetry':
                container.innerHTML = this.renderTelemetryView();
                break;
            case 'simulation':
                container.innerHTML = this.renderSimulationView();
                break;
            default:
                container.innerHTML = `<div class="text-slate-500 italic text-center pt-8">Select a view from the dropdown.</div>`;
        }

        // Re-initialize Lucide icons if loaded
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    /* --- 3.1 AdS/CFT ENTANGLEMENT VIEW --- */
    renderAdSCFTView() {
        const s = this.state.adsCft;
        return `
            <div class="space-y-3">
                <div class="text-[10px] font-mono text-engine-cyan tracking-wider border-b border-engine-border/40 pb-1 flex justify-between">
                    <span>3.1 HOLOGRAPHIC BOUNDARY SUITE</span>
                    <span class="text-slate-500">AdS/CFT</span>
                </div>

                <!-- Ryu-Takayanagi Surface Radius -->
                <div class="bg-slate-900/60 p-2.5 rounded bg-slate-950/60 space-y-1.5">
                    <div class="flex justify-between text-[11px]">
                        <span class="text-slate-300 font-semibold">Minimal Surface Radius (γ_A)</span>
                        <span id="val-minimalSurfaceRadius" class="text-engine-cyan font-mono">${s.minimalSurfaceRadius.toFixed(2)}</span>
                    </div>
                    <input type="range" min="0.1" max="5.0" step="0.05" value="${s.minimalSurfaceRadius}"
                        oninput="consoleManager.updateModuleState('adsCft', 'minimalSurfaceRadius', parseFloat(this.value)); document.getElementById('val-minimalSurfaceRadius').innerText = parseFloat(this.value).toFixed(2);"
                        class="w-full h-1 bg-slate-800 rounded accent-engine-cyan cursor-pointer" />
                </div>

                <!-- Entanglement Wedge Toggle -->
                <div class="bg-slate-900/60 p-2.5 rounded bg-slate-950/60 flex items-center justify-between">
                    <span class="text-[11px] text-slate-300 font-semibold">Entanglement Wedge (E_W)</span>
                    <input type="checkbox" ${s.entanglementWedgeActive ? 'checked' : ''}
                        onchange="consoleManager.updateModuleState('adsCft', 'entanglementWedgeActive', this.checked)"
                        class="w-4 h-4 rounded border-engine-border bg-slate-950 text-engine-cyan focus:ring-0 cursor-pointer" />
                </div>

                <!-- Conformal Dimension Δ -->
                <div class="bg-slate-900/60 p-2.5 rounded bg-slate-950/60 space-y-1.5">
                    <div class="flex justify-between text-[11px]">
                        <span class="text-slate-300 font-semibold">Conformal Dimension (Δ)</span>
                        <span id="val-conformalDimension" class="text-engine-cyan font-mono">${s.conformalDimension.toFixed(1)}</span>
                    </div>
                    <input type="range" min="0.5" max="10.0" step="0.1" value="${s.conformalDimension}"
                        oninput="consoleManager.updateModuleState('adsCft', 'conformalDimension', parseFloat(this.value)); document.getElementById('val-conformalDimension').innerText = parseFloat(this.value).toFixed(1);"
                        class="w-full h-1 bg-slate-800 rounded accent-engine-cyan cursor-pointer" />
                </div>

                <!-- Bulk Cutoff z_0 -->
                <div class="bg-slate-900/60 p-2.5 rounded bg-slate-950/60 space-y-1.5">
                    <div class="flex justify-between text-[11px]">
                        <span class="text-slate-300 font-semibold">Bulk UV Cutoff (z_0)</span>
                        <span id="val-bulkCutoff" class="text-engine-cyan font-mono">${s.bulkCutoff.toFixed(3)}</span>
                    </div>
                    <input type="range" min="0.001" max="0.1" step="0.001" value="${s.bulkCutoff}"
                        oninput="consoleManager.updateModuleState('adsCft', 'bulkCutoff', parseFloat(this.value)); document.getElementById('val-bulkCutoff').innerText = parseFloat(this.value).toFixed(3);"
                        class="w-full h-1 bg-slate-800 rounded accent-engine-cyan cursor-pointer" />
                </div>

                <!-- Holographic Dictionary Scheme -->
                <div class="bg-slate-900/60 p-2.5 rounded space-y-1">
                    <label class="text-[11px] text-slate-300 font-semibold block">Dictionary Formulation</label>
                    <select onchange="consoleManager.updateModuleState('adsCft', 'dictionaryScheme', this.value)"
                    style="background-color: #0b0f19 !important; color: #e2e8f0 !important;"
                    class="w-full bg-slate-950 text-engine-cyan font-mono text-xs border border-engine-cyan/40 hover:border-engine-cyan rounded px-2.5 py-1.5 pr-8 appearance-none outline-none transition-all shadow-sm">
                        <option value="HRT" ${s.dictionaryScheme === 'HRT' ? 'selected' : ''}>Hubeny-Rangamani-Takayanagi</option>
                        <option value="QES" ${s.dictionaryScheme === 'QES' ? 'selected' : ''}>Quantum Extremal Surfaces</option>
                        <option value="EE" ${s.dictionaryScheme === 'EE' ? 'selected' : ''}>Standard Entanglement Entropy</option>
                    </select>
                </div>

                <!-- Complexity Scaling Factor -->
                <div class="bg-slate-900/60 p-2.5 rounded bg-slate-950/60 space-y-1.5">
                    <div class="flex justify-between text-[11px]">
                        <span class="text-slate-300 font-semibold">Complexity Scaling (CV/CA)</span>
                        <span id="val-complexityScaling" class="text-engine-cyan font-mono">${(s.complexityScaling || 1.0).toFixed(2)}</span>
                    </div>
                    <input type="range" min="0.1" max="3.0" step="0.05" value="${s.complexityScaling || 1.0}"
                        oninput="consoleManager.updateModuleState('adsCft', 'complexityScaling', parseFloat(this.value)); document.getElementById('val-complexityScaling').innerText = parseFloat(this.value).toFixed(2);"
                        class="w-full h-1 bg-slate-800 rounded accent-engine-cyan cursor-pointer" />
                </div>
            </div>
        `;
    }

    /* --- 3.2 EINSTEIN CONSTRAINTS VIEW --- */
    renderConstraintsView() {
        const s = this.state.constraints;
        return `
            <div class="space-y-3">
                <div class="text-[10px] font-mono text-engine-cyan tracking-wider border-b border-engine-border/40 pb-1 flex justify-between">
                    <span>3.2 NUMERICAL RELATIVITY CONSTRAINTS</span>
                    <span class="text-slate-500">GR SOLVER</span>
                </div>

                <!-- Active Formulation Dropdown -->
                <div class="bg-slate-900/60 p-2.5 rounded space-y-1">
                    <label class="text-[11px] text-slate-300 font-semibold block">Evolution System</label>
                    <select onchange="consoleManager.updateModuleState('constraints', 'activeSolver', this.value)"
                    style="background-color: #0b0f19 !important; color: #e2e8f0 !important;"
                    class="w-full bg-slate-950 text-engine-cyan font-mono text-xs border border-engine-cyan/40 hover:border-engine-cyan rounded px-2.5 py-1.5 pr-8 appearance-none outline-none transition-all shadow-sm">
                        <option value="BSSN" ${s.activeSolver === 'BSSN' ? 'selected' : ''}>BSSN (Baumgarte-Shapiro-Shibata-Nakamura)</option>
                        <option value="CCZ4" ${s.activeSolver === 'CCZ4' ? 'selected' : ''}>CCZ4 (Conformal Z4)</option>
                        <option value="GH" ${s.activeSolver === 'GH' ? 'selected' : ''}>Generalized Harmonic (GH)</option>
                    </select>
                </div>

                <!-- Gauge Condition -->
                <div class="bg-slate-900/60 p-2.5 rounded space-y-1">
                    <label class="text-[11px] text-slate-300 font-semibold block">Slicing / Gauge Condition</label>
                    <select onchange="consoleManager.updateModuleState('constraints', 'gaugeCondition', this.value)"
                    style="background-color: #0b0f19 !important; color: #e2e8f0 !important;"
                    class="w-full bg-slate-950 text-engine-cyan font-mono text-xs border border-engine-cyan/40 hover:border-engine-cyan rounded px-2.5 py-1.5 pr-8 appearance-none outline-none transition-all shadow-sm">
                        <option value="1+log" ${s.gaugeCondition === '1+log' ? 'selected' : ''}>1+log Slicing</option>
                        <option value="Harmonic" ${s.gaugeCondition === 'Harmonic' ? 'selected' : ''}>Harmonic Slicing</option>
                        <option value="Maximal" ${s.gaugeCondition === 'Maximal' ? 'selected' : ''}>Maximal Slicing (K=0)</option>
                    </select>
                </div>

                <!-- Hamiltonian Constraint Tolerance -->
                <div class="bg-slate-900/60 p-2.5 rounded bg-slate-950/60 space-y-1.5">
                    <div class="flex justify-between text-[11px]">
                        <span class="text-slate-300 font-semibold">Hamiltonian Tolerance (ℋ ≈ 0)</span>
                        <span id="val-hamiltonianTolerance" class="text-engine-cyan font-mono">${s.hamiltonianTolerance.toExponential(1)}</span>
                    </div>
                    <input type="range" min="-7" max="-3" step="0.5" value="${Math.log10(s.hamiltonianTolerance)}"
                        oninput="const val = Math.pow(10, parseFloat(this.value)); consoleManager.updateModuleState('constraints', 'hamiltonianTolerance', val); document.getElementById('val-hamiltonianTolerance').innerText = val.toExponential(1);"
                        class="w-full h-1 bg-slate-800 rounded accent-engine-cyan cursor-pointer" />
                </div>

                <!-- Momentum Constraint Tolerance -->
                <div class="bg-slate-900/60 p-2.5 rounded bg-slate-950/60 space-y-1.5">
                    <div class="flex justify-between text-[11px]">
                        <span class="text-slate-300 font-semibold">Momentum Tolerance (ℳ^i ≈ 0)</span>
                        <span id="val-momentumTolerance" class="text-engine-cyan font-mono">${s.momentumTolerance.toExponential(1)}</span>
                    </div>
                    <input type="range" min="-6" max="-2" step="0.5" value="${Math.log10(s.momentumTolerance)}"
                        oninput="const val = Math.pow(10, parseFloat(this.value)); consoleManager.updateModuleState('constraints', 'momentumTolerance', val); document.getElementById('val-momentumTolerance').innerText = val.toExponential(1);"
                        class="w-full h-1 bg-slate-800 rounded accent-engine-cyan cursor-pointer" />
                </div>

                <!-- Constraint Enforcement Mode -->
                <div class="bg-slate-900/60 p-2.5 rounded space-y-1">
                    <label class="text-[11px] text-slate-300 font-semibold block">Constraint Damping Mode</label>
                    <select onchange="consoleManager.updateModuleState('constraints', 'dampingMode', this.value)"
                    style="background-color: #0b0f19 !important; color: #e2e8f0 !important;"
                    class="w-full bg-slate-950 text-engine-cyan font-mono text-xs border border-engine-cyan/40 hover:border-engine-cyan rounded px-2.5 py-1.5 pr-8 appearance-none outline-none transition-all shadow-sm">
                        <option value="algebraic" ${s.dampingMode === 'algebraic' ? 'selected' : ''}>Algebraic Penalty Enforcement</option>
                        <option value="spectral" ${s.dampingMode === 'spectral' ? 'selected' : ''}>Spectral Filtering Correction</option>
                        <option value="unconstrained" ${s.dampingMode === 'unconstrained' ? 'selected' : ''}>Free Evolution (No Penalty)</option>
                    </select>
                </div>
            </div>
        `;
    }

    /* --- 4.1 TELEMETRY & STREAMS VIEW --- */
    renderTelemetryView() {
        const s = this.state.telemetry;
        return `
            <div class="space-y-3">
                <div class="text-[10px] font-mono text-engine-cyan tracking-wider border-b border-engine-border/40 pb-1 flex justify-between">
                    <span>4.1 TELEMETRY & STREAM DIAGNOSTICS</span>
                    <span class="text-slate-500">WEBSOCKET</span>
                </div>

                <!-- Sampling Rate -->
                <div class="bg-slate-900/60 p-2.5 rounded bg-slate-950/60 space-y-1.5">
                    <div class="flex justify-between text-[11px]">
                        <span class="text-slate-300 font-semibold">Sample Rate (Hz)</span>
                        <span id="val-sampleRateHz" class="text-engine-cyan font-mono">${s.sampleRateHz} Hz</span>
                    </div>
                    <input type="range" min="10" max="120" step="5" value="${s.sampleRateHz}"
                        oninput="consoleManager.updateModuleState('telemetry', 'sampleRateHz', parseInt(this.value)); document.getElementById('val-sampleRateHz').innerText = this.value + ' Hz';"
                        class="w-full h-1 bg-slate-800 rounded accent-engine-cyan cursor-pointer" />
                </div>

                <!-- Buffer Size -->
                <div class="bg-slate-900/60 p-2.5 rounded space-y-1">
                    <label class="text-[11px] text-slate-300 font-semibold block">Ring Buffer Depth</label>
                    <select onchange="consoleManager.updateModuleState('telemetry', 'bufferSize', parseInt(this.value))"
                    style="background-color: #0b0f19 !important; color: #e2e8f0 !important;"
                    class="w-full bg-slate-950 text-engine-cyan font-mono text-xs border border-engine-cyan/40 hover:border-engine-cyan rounded px-2.5 py-1.5 pr-8 appearance-none outline-none transition-all shadow-sm">
                        <option value="256" ${s.bufferSize === 256 ? 'selected' : ''}>256 Packets</option>
                        <option value="512" ${s.bufferSize === 512 ? 'selected' : ''}>512 Packets</option>
                        <option value="1024" ${s.bufferSize === 1024 ? 'selected' : ''}>1024 Packets</option>
                        <option value="2048" ${s.bufferSize === 2048 ? 'selected' : ''}>2048 Packets</option>
                    </select>
                </div>

                <!-- Channel Name -->
                <div class="bg-slate-900/60 p-2.5 rounded space-y-1">
                    <label class="text-[11px] text-slate-300 font-semibold block">Ingestion Channel</label>
                    <input type="text" value="${s.telemetryChannel}"
                        onchange="consoleManager.updateModuleState('telemetry', 'telemetryChannel', this.value)"
                        style="background-color: #0b0f19 !important; color: #00f0ff !important;"
                        class="w-full bg-slate-950 text-engine-cyan font-mono text-xs border border-engine-cyan/40 hover:border-engine-cyan rounded px-2.5 py-1.5 outline-none transition-all shadow-sm">
                </div>

                <!-- Stream Encoding -->
                <div class="bg-slate-900/60 p-2.5 rounded space-y-1">
                    <label class="text-[11px] text-slate-300 font-semibold block">Serialization Protocol</label>
                    <select onchange="consoleManager.updateModuleState('telemetry', 'streamEncoding', this.value)"
                    style="background-color: #0b0f19 !important; color: #e2e8f0 !important;"
                    class="w-full bg-slate-950 text-engine-cyan font-mono text-xs border border-engine-cyan/40 hover:border-engine-cyan rounded px-2.5 py-1.5 pr-8 appearance-none outline-none transition-all shadow-sm">
                        <option value="Binary Protobuf" ${s.streamEncoding === 'Binary Protobuf' ? 'selected' : ''}>Binary Protobuf</option>
                        <option value="JSON Array" ${s.streamEncoding === 'JSON Array' ? 'selected' : ''}>JSON Stream</option>
                        <option value="Raw Float32" ${s.streamEncoding === 'Raw Float32' ? 'selected' : ''}>Raw Float32 Buffer</option>
                    </select>
                </div>

                <!-- Packet Loss Mitigation Toggle -->
                <div class="bg-slate-900/60 p-2.5 rounded bg-slate-950/60 flex items-center justify-between">
                    <span class="text-[11px] text-slate-300 font-semibold">Jitter Buffer Compensation</span>
                    <input type="checkbox" ${s.jitterCompensation ? 'checked' : ''}
                        onchange="consoleManager.updateModuleState('telemetry', 'jitterCompensation', this.checked)"
                        class="w-4 h-4 rounded border-engine-border bg-slate-950 text-engine-cyan focus:ring-0 cursor-pointer" />
                </div>
            </div>
        `;
    }

    /* --- 4.2 SIMULATION CONTROLS VIEW --- */
    renderSimulationView() {
        const s = this.state.simulation;
        return `
            <div class="space-y-3">
                <div class="text-[10px] font-mono text-engine-cyan tracking-wider border-b border-engine-border/40 pb-1 flex justify-between">
                    <span>4.2 SIMULATION ENVIRONMENT CONTROLS</span>
                    <span class="text-slate-500">GLOBAL CLOCK</span>
                </div>

                <!-- Time Scale dt -->
                <div class="bg-slate-900/60 p-2.5 rounded bg-slate-950/60 space-y-1.5">
                    <div class="flex justify-between text-[11px]">
                        <span class="text-slate-300 font-semibold">Global Time Scaling (dt)</span>
                        <span id="val-globalTimeScale" class="text-engine-cyan font-mono">${s.globalTimeScale.toFixed(2)}x</span>
                    </div>
                    <input type="range" min="0.0" max="3.0" step="0.05" value="${s.globalTimeScale}"
                        oninput="consoleManager.updateModuleState('simulation', 'globalTimeScale', parseFloat(this.value)); document.getElementById('val-globalTimeScale').innerText = parseFloat(this.value).toFixed(2) + 'x';"
                        class="w-full h-1 bg-slate-800 rounded accent-engine-cyan cursor-pointer" />
                </div>

                <!-- Adaptive Mesh Refinement (AMR) Toggle -->
                <div class="bg-slate-900/60 p-2.5 rounded bg-slate-950/60 flex items-center justify-between">
                    <span class="text-[11px] text-slate-300 font-semibold">Adaptive Mesh Refinement (AMR)</span>
                    <input type="checkbox" ${s.adaptiveMesh ? 'checked' : ''}
                        onchange="consoleManager.updateModuleState('simulation', 'adaptiveMesh', this.checked)"
                        class="w-4 h-4 rounded border-engine-border bg-slate-950 text-engine-cyan focus:ring-0 cursor-pointer" />
                </div>

                <!-- Courant Factor (CFL) -->
                <div class="bg-slate-900/60 p-2.5 rounded bg-slate-950/60 space-y-1.5">
                    <div class="flex justify-between text-[11px]">
                        <span class="text-slate-300 font-semibold">Courant Stability Factor (CFL)</span>
                        <span id="val-courantFactor" class="text-engine-cyan font-mono">${s.courantFactor.toFixed(2)}</span>
                    </div>
                    <input type="range" min="0.05" max="0.95" step="0.05" value="${s.courantFactor}"
                        oninput="consoleManager.updateModuleState('simulation', 'courantFactor', parseFloat(this.value)); document.getElementById('val-courantFactor').innerText = parseFloat(this.value).toFixed(2);"
                        class="w-full h-1 bg-slate-800 rounded accent-engine-cyan cursor-pointer" />
                </div>

                <!-- Kreiss-Oliger Damping -->
                <div class="bg-slate-900/60 p-2.5 rounded bg-slate-950/60 space-y-1.5">
                    <div class="flex justify-between text-[11px]">
                        <span class="text-slate-300 font-semibold">Kreiss-Oliger Damping (ε)</span>
                        <span id="val-dampingCoefficient" class="text-engine-cyan font-mono">${s.dampingCoefficient.toFixed(3)}</span>
                    </div>
                    <input type="range" min="0.000" max="0.100" step="0.005" value="${s.dampingCoefficient}"
                        oninput="consoleManager.updateModuleState('simulation', 'dampingCoefficient', parseFloat(this.value)); document.getElementById('val-dampingCoefficient').innerText = parseFloat(this.value).toFixed(3);"
                        class="w-full h-1 bg-slate-800 rounded accent-engine-cyan cursor-pointer" />
                </div>

                <!-- Time Integrator Order -->
                <div class="bg-slate-900/60 p-2.5 rounded space-y-1">
                    <label class="text-[11px] text-slate-300 font-semibold block">Time Integrator Order</label>
                    <select onchange="consoleManager.updateModuleState('simulation', 'integratorOrder', this.value)"
                    style="background-color: #0b0f19 !important; color: #e2e8f0 !important;"
                    class="w-full bg-slate-950 text-engine-cyan font-mono text-xs border border-engine-cyan/40 hover:border-engine-cyan rounded px-2.5 py-1.5 pr-8 appearance-none outline-none transition-all shadow-sm">
                        <option value="RK2" ${s.integratorOrder === 'RK2' ? 'selected' : ''}>Runge-Kutta 2nd Order</option>
                        <option value="RK4" ${s.integratorOrder === 'RK4' ? 'selected' : ''}>Runge-Kutta 4th Order (Classic)</option>
                        <option value="MoNLRK4" ${s.integratorOrder === 'MoNLRK4' ? 'selected' : ''}>Monotone Low-Storage RK4</option>
                    </select>
                </div>
            </div>
        `;
    }

    exportPreset() {
        const presetData = JSON.stringify(this.state, null, 2);
        const blob = new Blob([presetData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'MyWorkingPreset.xxx';
        a.click();
        URL.revokeObjectURL(url);
    }

    importPreset(presetJson) {
        try {
            const parsed = typeof presetJson === 'string' ? JSON.parse(presetJson) : presetJson;
            if (parsed.adsCft && parsed.constraints && parsed.telemetry && parsed.simulation) {
                this.state = parsed;
                this.render();
                console.log("[RightConsoleManager] Preset restored successfully.");
            } else {
                console.warn("[RightConsoleManager] Invalid preset structure.");
            }
        } catch (err) {
            console.error("[RightConsoleManager] Failed to import preset:", err);
        }
    }
}

// Global Singleton Instance
const consoleManager = new RightConsoleManager();

function switchRightView(viewName) {
    consoleManager.setView(viewName);
}

function exportWorkingPreset() {
    consoleManager.exportPreset();
}