/**
 * backend/js/controlDeck.js
 * Stage 3 Spatial & Temporal Control Deck Coordinator
 * Preserves spatial/temporal parameters across channel switches and sends
 * validated updates into the canonical main.py pipeline.
 */

export class ControlDeckController {
    constructor({ streamClient = null, httpBase = "", onStateChange = null } = {}) {
        this.streamClient = streamClient;
        this.httpBase = httpBase;
        this.onStateChange = typeof onStateChange === "function" ? onStateChange : null;

        this.state = {
            activeChannel: "HUD",
            dt: 0.05,
            advanceSteps: 1,
            gridSize: 32,
            mode: "live",
            autoStep: false,
            stepIntervalMs: 150,
        };

        this._timerId = null;
    }

    getState() {
        return { ...this.state };
    }

    _emitChange() {
        if (this.onStateChange) {
            this.onStateChange(this.getState());
        }
    }

    setActiveChannel(channelId) {
        if (!channelId) return this.getState();
        this.state.activeChannel = String(channelId);
        // Spatial/temporal settings (dt, advanceSteps, gridSize, mode) remain preserved.
        this._emitChange();
        return this.getState();
    }

    setTemporalParams({ dt, advanceSteps, mode, gridSize } = {}) {
        if (typeof dt === "number" && Number.isFinite(dt) && dt > 0) {
            this.state.dt = dt;
        }
        if (Number.isInteger(advanceSteps) && advanceSteps >= 0) {
            this.state.advanceSteps = advanceSteps;
        }
        if (Number.isInteger(gridSize) && gridSize >= 8 && gridSize <= 128) {
            this.state.gridSize = gridSize;
        }
        if (mode === "live" || mode === "benchmark/synthetic") {
            this.state.mode = mode;
        }
        this._emitChange();
        return this.getState();
    }

    async stepOnce(overrides = {}) {
        const dt = typeof overrides.dt === "number" && Number.isFinite(overrides.dt) && overrides.dt > 0
            ? overrides.dt
            : this.state.dt;
        const advanceSteps = Number.isInteger(overrides.advanceSteps)
            ? overrides.advanceSteps
            : this.state.advanceSteps;
        const gridSize = Number.isInteger(overrides.gridSize)
            ? overrides.gridSize
            : this.state.gridSize;
        const mode =
            overrides.mode === "live" || overrides.mode === "benchmark/synthetic"
                ? overrides.mode
                : this.state.mode;

        const resp = await fetch(`${this.httpBase}/api/compute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                advance_steps: advanceSteps,
                dt,
                grid_size: gridSize,
                mode,
            }),
        });

        if (!resp.ok) {
            throw new Error(`Compute step failed: ${resp.status}`);
        }

        const payload = await resp.json();
        if (payload?.frame && this.streamClient) {
            this.streamClient.ingestFrame(payload.frame);
        }
        return payload;
    }

    async pushModelUpdate(modelPatch = {}) {
        const payloadToSend = {
            ...modelPatch,
            mode:
                modelPatch.mode === "live" || modelPatch.mode === "benchmark/synthetic"
                    ? modelPatch.mode
                    : this.state.mode,
        };

        const resp = await fetch(`${this.httpBase}/api/telemetry/model`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadToSend),
        });

        if (!resp.ok) {
            throw new Error(`Model update failed: ${resp.status}`);
        }

        const payload = await resp.json();
        if (payload?.frame && this.streamClient) {
            this.streamClient.ingestFrame(payload.frame);
        }
        return payload;
    }

    startAutoStep(intervalMs = null) {
        if (typeof intervalMs === "number" && Number.isFinite(intervalMs) && intervalMs >= 25) {
            this.state.stepIntervalMs = intervalMs;
        }
        this.stopAutoStep();
        this.state.autoStep = true;
        this._emitChange();

        this._timerId = setInterval(() => {
            this.stepOnce().catch(() => {
                this.stopAutoStep();
            });
        }, this.state.stepIntervalMs);
    }

    stopAutoStep() {
        if (this._timerId !== null) {
            clearInterval(this._timerId);
            this._timerId = null;
        }
        if (this.state.autoStep) {
            this.state.autoStep = false;
            this._emitChange();
        }
    }
}
export function downloadDeckFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dispatchHudEvent(name, detail) {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent(name, { detail }));
    }
}

export function attachControlDeckDOM(controller = null, { getNodes, getEdges } = {}) {
    const readNodes = typeof getNodes === "function"
        ? getNodes
        : () => (Array.isArray(window.nodes) ? window.nodes : []);
    const readEdges = typeof getEdges === "function"
        ? getEdges
        : () => (Array.isArray(window.edges) ? window.edges : []);

    window.hudConfig = window.hudConfig || {
        referenceFrame: "open",
        streamFilter: "all",
        interpolation: "linear",
        palette: "scifi",
        worldScale: 1.0,
        gridDensity: 10,
        motionSpeed: 1.0,
        noiseThreshold: 0.05,
        overlays: {
            thermal: false,
            wave: false,
            emp: false,
            atmos: false,
            doppler: false,
            multipath: false,
        },
    };

    // 1. Collapsible drawer toggle
    const collapseBtn = document.getElementById("deck-collapse-btn");
    const deckBody = document.getElementById("deck-body-content");
    if (collapseBtn && deckBody && !collapseBtn.dataset.bound) {
        collapseBtn.dataset.bound = "true";
        collapseBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const isHidden = deckBody.style.display === "none";
            deckBody.style.display = isHidden ? "block" : "none";
            collapseBtn.textContent = isHidden ? "−" : "+";
        });
    }

    // 4. Signal Noise Threshold slider ONLY (World Scale, Grid Density, Motion Speed,
    // and Overlay Luminosity are handled by the upgraded pipeline)
    const noiseSlider = document.getElementById("slider-noise-thresh");
    const noiseValEl = document.getElementById("val-noise-thresh");
    if (noiseSlider && !noiseSlider.dataset.bound) {
        noiseSlider.dataset.bound = "true";
        noiseSlider.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            if (!Number.isFinite(val)) return;
            window.hudConfig.noiseThreshold = val;
            if (noiseValEl) noiseValEl.textContent = val.toFixed(2);
            if (typeof window.onNoiseThresholdChange === "function") {
                window.onNoiseThresholdChange(val, window.hudConfig);
            }
            dispatchHudEvent("hud:noise-threshold-change", {
                noiseThreshold: val,
                palette: window.hudConfig.palette,
                config: window.hudConfig,
            });
        });
    }

    // 6. Pin All & Release All synced with main.py PipelineAuthority
    const pinAllBtn = document.getElementById("btn-pin-all");
    if (pinAllBtn && !pinAllBtn.dataset.bound) {
        pinAllBtn.dataset.bound = "true";
        pinAllBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            const nodes = readNodes();
            nodes.forEach((n) => {
                if (!n || typeof n !== "object") return;
                const isCore = Boolean(n.isCore ?? n.flags?.is_core);
                if (!isCore) {
                    n.isPinned = true;
                    if ("pinned" in n) n.pinned = true;
                }
                if (n.flags && typeof n.flags === "object" && !isCore) {
                    n.flags.pinned = true;
                }
            });
            if (typeof window.broadcastHUDStateToBuilder === "function") {
                window.broadcastHUDStateToBuilder(nodes);
            }
            if (controller && typeof controller.pushModelUpdate === "function" && nodes.length > 0) {
                try {
                    await controller.pushModelUpdate({ nodes, replace_graph: false });
                } catch (err) {
                    console.warn("[controlDeck] Pin sync failed:", err);
                }
            }
        });
    }

    const releaseAllBtn = document.getElementById("btn-release-all");
    if (releaseAllBtn && !releaseAllBtn.dataset.bound) {
        releaseAllBtn.dataset.bound = "true";
        releaseAllBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            const nodes = readNodes();
            let released = nodes;
            if (typeof window.releaseImportedConfigToPhysics === "function") {
                released = window.releaseImportedConfigToPhysics(nodes) || nodes;
            } else {
                nodes.forEach((n) => {
                    if (!n || typeof n !== "object") return;
                    const isCore = Boolean(n.isCore ?? n.flags?.is_core);
                    if (!isCore) {
                        n.isPinned = false;
                        if ("pinned" in n) n.pinned = false;
                        if ("fixed" in n) n.fixed = false;
                    }
                    if (n.flags && typeof n.flags === "object") {
                        n.flags.pinned = false;
                        n.flags.is_severed = false;
                    }
                });
            }
            if (typeof window.broadcastHUDStateToBuilder === "function") {
                window.broadcastHUDStateToBuilder(released);
            }
            if (controller && typeof controller.pushModelUpdate === "function" && released.length > 0) {
                try {
                    await controller.pushModelUpdate({ nodes: released, replace_graph: false });
                } catch (err) {
                    console.warn("[controlDeck] Release sync failed:", err);
                }
            }
        });
    }

    const exportJsonBtn = document.getElementById("btn-export-json");
    if (exportJsonBtn && !exportJsonBtn.dataset.bound) {
        exportJsonBtn.dataset.bound = "true";
        exportJsonBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const payload = {
                version: "2.7.5",
                timestamp: new Date().toISOString(),
                config: window.hudConfig,
                nodes: readNodes(),
                edges: readEdges(),
            };
            downloadDeckFile(JSON.stringify(payload, null, 2), "holographic_topology_config.json", "application/json");
        });
    }

    const exportCsvBtn = document.getElementById("btn-export-csv");
    if (exportCsvBtn && !exportCsvBtn.dataset.bound) {
        exportCsvBtn.dataset.bound = "true";
        exportCsvBtn.addEventListener("click", (e) => {
            e.preventDefault();
            let csv = "ID,X,Y,Z,Pinned,Core\n";
            readNodes().forEach((n) => {
                if (!n || typeof n !== "object") return;
                const x = Number(n.x ?? n.position?.x ?? 0);
                const y = Number(n.y ?? n.position?.y ?? 0);
                const z = Number(n.z ?? n.position?.z ?? 0);
                const pinned = Boolean(n.isPinned ?? n.pinned ?? n.flags?.pinned);
                const core = Boolean(n.isCore ?? n.flags?.is_core);
                csv += `${n.id ?? ""},${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)},${pinned},${core}\n`;
            });
            downloadDeckFile(csv, "holographic_telemetry.csv", "text/csv");
        });
    }

    const exportDotBtn = document.getElementById("btn-export-dot");
    if (exportDotBtn && !exportDotBtn.dataset.bound) {
        exportDotBtn.dataset.bound = "true";
        exportDotBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const nodes = readNodes();
            const edges = readEdges();
            let dot = 'strict graph Topology {\n  fontname="Courier New";\n  node [style=filled, fillcolor="#05050a", fontcolor="#00ffcc", color="#00ffcc"];\n';
            nodes.forEach((n) => {
                if (!n || typeof n !== "object" || n.id === undefined) return;
                const isCore = Boolean(n.isCore ?? n.flags?.is_core);
                dot += `  "${n.id}" [label="${n.id}${isCore ? " (Core)" : ""}"];\n`;
            });
            if (edges.length > 0) {
                edges.forEach((edge) => {
                    if (!edge || typeof edge !== "object") return;
                    const src = edge.source ?? edge.from;
                    const dst = edge.target ?? edge.to;
                    if (src !== undefined && dst !== undefined) {
                        dot += `  "${src}" -- "${dst}";\n`;
                    }
                });
            } else {
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        dot += `  "${nodes[i].id}" -- "${nodes[j].id}";\n`;
                    }
                }
            }
            dot += "}\n";
            downloadDeckFile(dot, "topology_graph.dot", "text/vnd.graphviz");
        });
    }

    // --- Isolated Diagnostic Overlay Button Handlers (1 per button, 6 total) ---
    // 1. SNR Gate (Thermal Noise Threshold)
    function handleSnrGateToggle(active, config) {
        const cfg = config || (window.hudConfig = {});
        const threshold = Number.isFinite(cfg.noiseThresh)
            ? cfg.noiseThresh
            : (Number.isFinite(cfg.noiseThreshold) ? cfg.noiseThreshold : 0.05);
        cfg.noiseThresh = threshold;
        cfg.noiseThreshold = threshold;
        cfg.diagnosticOverlays = cfg.diagnosticOverlays || {};
        cfg.diagnosticOverlays.snrGate = Boolean(active);

        const stats = computeSnrGateStats(threshold, getNodes, getEdges);

        cfg.diagnostics = cfg.diagnostics || {};
        cfg.diagnostics.snrGate = { active: Boolean(active), threshold, ...stats };

        renderSnrGateCard(Boolean(active), threshold, stats);

        window.dispatchEvent(new CustomEvent("hud:snr-gate-update", {
            detail: { active: Boolean(active), threshold, stats }
        }));

        return { key: "snr-gate", diagnostic: "snrGate", active: Boolean(active), threshold, stats };
    }

    window.setSnrGateOverlay = function (active, threshold = null, cfg = window.hudConfig) {
        const targetCfg = cfg || (window.hudConfig = {});
        const resolvedThresh = Number.isFinite(threshold)
            ? threshold
            : (Number.isFinite(targetCfg.noiseThresh) ? targetCfg.noiseThresh : (targetCfg.noiseThreshold ?? 0.05));
        targetCfg.noiseThresh = resolvedThresh;
        targetCfg.noiseThreshold = resolvedThresh;
        targetCfg.snrGateEnabled = Boolean(active);
    };

    window.addEventListener("hud:diagnostic-overlay-toggle", (event) => {
        const detail = event?.detail;
        if (!detail || detail.key !== "thermal") return;
        const cfg = window.hudConfig || {};
        const thresh = cfg.noiseThresh ?? cfg.noiseThreshold ?? 0.05;
        window.setSnrGateOverlay(Boolean(detail.active), thresh, cfg);
    });

    // 2. Phase / Flux (Proximity / Doppler / Wave Interference)
    function handlePhaseFluxToggle(active, config) {
        const cfg = config || (window.hudConfig = {});
        cfg.diagnosticOverlays = cfg.diagnosticOverlays || {};
        cfg.diagnosticOverlays.phaseFlux = Boolean(active);
        cfg.phaseFluxEnabled = Boolean(active);

        if (typeof window.setPhaseFluxOverlay === "function") {
            window.setPhaseFluxOverlay(Boolean(active), cfg);
        }
        return { key: "wave", diagnostic: "phaseFlux", active: Boolean(active), config: cfg };
    }

    function handlePinLocksToggle(active, config) {
        // Isolated hook for Pin Locks (pinned / core / free node constraint visual)
        return { key: "emp", diagnostic: "constraintLocks", active, config };
    }

    function handleHighCouplingToggle(active, config) {
        // Isolated hook for High Coupling (strong entanglement / high-tension links)
        return { key: "atmos", diagnostic: "highCoupling", active, config };
    }

    function handlePathDivergenceToggle(active, config) {
        // Isolated hook for Path Div. (alternate / multi-hop path divergence)
        return { key: "doppler", diagnostic: "pathDivergence", active, config };
    }

    function handleBaseDeltaToggle(active, config) {
        // Isolated hook for Base Delta (drift / displacement vs. baseline state)
        return { key: "multipath", diagnostic: "baselineDelta", active, config };
    }

    const overlayHandlers = {
        "snr-gate": handleSnrGateToggle,
        "thermal": handleSnrGateToggle,
        "wave": handlePhaseFluxToggle,
        "emp": handlePinLocksToggle,
        "atmos": handleHighCouplingToggle,
        "doppler": handlePathDivergenceToggle,
        "multipath": handleBaseDeltaToggle,
    };

    window.diagnosticOverlayHandlers = Object.assign({}, window.diagnosticOverlayHandlers || {}, overlayHandlers);

    const DIAG_COMPATIBILITY = {
        "snr-gate": ["snr-gate", "atmos", "multipath"],
        "wave": ["wave", "doppler"],
        "emp": ["emp", "multipath"],
        "atmos": ["atmos", "snr-gate"],
        "doppler": ["doppler", "wave"],
        "multipath": ["multipath", "snr-gate", "emp"]
    };

    const DIAG_KEY_TO_HANDLER = {
        "snr-gate": "snrGate",
        "wave": "phaseFlux",
        "emp": "pinLocks",
        "atmos": "highCoupling",
        "doppler": "pathDivergence",
        "multipath": "baseDelta"
    };

    function createDiagnosticCardShell(cardId, titleText, badgeText, accentHex, borderRgba, dividerRgba) {
        const drawer = document.getElementById("gimbal-diagnostic-drawer");
        if (!drawer) return null;

        let card = document.getElementById(cardId);
        if (!card) {
            card = document.createElement("div");
            card.id = cardId;
            card.style.cssText = [
                "background:rgba(5,12,18,0.94)",
                `border:1px solid ${borderRgba}`,
                "border-radius:4px",
                "padding:7px 9px",
                "font-family:monospace",
                "font-size:11px",
                "color:#e2e8f0",
                "box-shadow:0 4px 12px rgba(0,0,0,0.5)",
                "flex-shrink:0"
            ].join(";");
            drawer.appendChild(card);
        }
        return card;
    }

    function removeDiagnosticCard(cardId) {
        const card = document.getElementById(cardId);
        if (card) card.remove();
        applyHeightBudgetToDrawer();
        if (typeof syncGimbalDrawerBounds === "function") syncGimbalDrawerBounds();
    }

    // --- #3 PIN LOCKS (emp / constraintLocks) ---
    function computePinLocksStats(threshold = 0.5, getNodesFn) {
        const nodes = typeof getNodesFn === "function" ? (getNodesFn() || []) : (window.nodes || []);
        const items = nodes.map((n, idx) => {
            const isCore = Boolean(n?.isCore || n?.tier === "BULK_CORE" || n?.flags?.is_core);
            const isPinned = Boolean(n?.isPinned || n?.pinned || n?.fixed || n?.flags?.pinned);
            const lockWeight = isCore ? 1.0 : (isPinned ? 0.85 : 0.15);
            return {
                id: n?.id || n?.name || `N-${idx + 1}`,
                isCore,
                isPinned,
                lockWeight,
                locked: isCore || isPinned || lockWeight >= threshold
            };
        });
        const lockedItems = items.filter((it) => it.locked).sort((a, b) => b.lockWeight - a.lockWeight);
        return {
            total: items.length,
            lockedCount: lockedItems.length,
            freeCount: items.length - lockedItems.length,
            coreCount: items.filter((it) => it.isCore).length,
            topLocked: lockedItems.slice(0, 3)
        };
    }

    function renderPinLocksCard(active, threshold, stats) {
        if (!active) {
            removeDiagnosticCard("diag-card-pin-locks");
            return;
        }
        const card = createDiagnosticCardShell(
            "diag-card-pin-locks",
            "3. PIN LOCKS",
            "",
            "#38bdf8",
            "rgba(56,189,248,0.6)",
            "rgba(56,189,248,0.22)"
        );
        if (!card) return;

        const s = stats || { total: 0, lockedCount: 0, freeCount: 0, coreCount: 0, topLocked: [] };
        const topHtml = s.topLocked.length
            ? s.topLocked.map((item) =>
                `<div style="display:flex;justify-content:space-between;color:#bae6fd;"><span>${item.id}</span><span>${item.isCore ? "CORE" : "PINNED"}</span></div>`
            ).join("")
            : `<div style="color:#6ee7b7;">All nodes unconstrained</div>`;

        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;border-bottom:1px solid rgba(56,189,248,0.22);padding-bottom:2px;">
                <strong style="color:#38bdf8;">3. PIN LOCKS</strong>
                <span style="color:#94a3b8;font-size:10px;">${s.lockedCount}/${s.total} LOCKED</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;margin-bottom:4px;font-size:10px;">
                <div>LOCKED: <strong style="color:#38bdf8;">${s.lockedCount}</strong></div>
                <div>FREE: <strong style="color:#34d399;">${s.freeCount}</strong></div>
                <div>CORE: <strong>${s.coreCount}</strong></div>
                <div>MODE: <strong>PIN/CONSTR</strong></div>
            </div>
            <div data-role="top-list" style="border-top:1px solid rgba(255,255,255,0.08);padding-top:2px;font-size:10px;">
                <div style="color:#38bdf8;margin-bottom:2px;">CONSTRAINED NODES</div>
                ${topHtml}
            </div>
        `;
        applyHeightBudgetToDrawer();
        if (typeof syncGimbalDrawerBounds === "function") syncGimbalDrawerBounds();
    }

    function handlePinLocksToggle(active, config) {
        const cfg = config || (window.hudConfig = {});
        const threshold = Number.isFinite(cfg.pinLockThresh) ? cfg.pinLockThresh : 0.5;
        cfg.diagnosticOverlays = cfg.diagnosticOverlays || {};
        cfg.diagnosticOverlays.pinLocks = Boolean(active);
        cfg.overlays = cfg.overlays || {};
        cfg.overlays.emp = Boolean(active);
        cfg.overlays.em = Boolean(active);

        const stats = computePinLocksStats(threshold, getNodes);
        cfg.diagnostics = cfg.diagnostics || {};
        cfg.diagnostics.pinLocks = { active: Boolean(active), threshold, ...stats };

        renderPinLocksCard(Boolean(active), threshold, stats);
        window.dispatchEvent(new CustomEvent("hud:pin-locks-update", {
            detail: { active: Boolean(active), threshold, stats }
        }));
        return { key: "emp", diagnostic: "pinLocks", active: Boolean(active), stats };
    }

    // --- #4 HIGH COUPLING (atmos / highCoupling) ---
    function computeHighCouplingStats(threshold = 0.55, getNodesFn, getEdgesFn) {
        const nodes = typeof getNodesFn === "function" ? (getNodesFn() || []) : (window.nodes || []);
        const edges = typeof getEdgesFn === "function" ? (getEdgesFn() || []) : (window.edges || []);
        const resolveNode = (ref) => {
            if (!ref) return {};
            if (typeof ref === "object") return ref;
            return nodes.find((n) => n && (n.id === ref || n.name === ref)) || {};
        };

        const items = edges.map((edge, idx) => {
            const a = resolveNode(edge.source ?? edge.a);
            const b = resolveNode(edge.target ?? edge.b);
            const rawTension = Number.isFinite(edge.tension)
                ? edge.tension
                : (Number.isFinite(edge.strain) ? edge.strain : 0.35);
            const coupling = Math.max(0, Math.min(1, Number.isFinite(edge.coupling) ? edge.coupling : (0.35 + rawTension * 0.65)));
            return {
                id: edge.id ?? `${a.id || "N"}-${b.id || "N"}`,
                coupling,
                coupled: coupling >= threshold
            };
        });

        const coupledItems = items.filter((it) => it.coupled).sort((a, b) => b.coupling - a.coupling);
        return {
            total: items.length,
            coupledCount: coupledItems.length,
            normalCount: items.length - coupledItems.length,
            maxCoupling: items.length ? Math.max(...items.map((it) => it.coupling)) : 0,
            topCoupled: coupledItems.slice(0, 3)
        };
    }

    function renderHighCouplingCard(active, threshold, stats) {
        if (!active) {
            removeDiagnosticCard("diag-card-high-coupling");
            return;
        }
        const card = createDiagnosticCardShell(
            "diag-card-high-coupling",
            "4. HIGH COUPLING",
            "",
            "#34d399",
            "rgba(52,211,153,0.6)",
            "rgba(52,211,153,0.22)"
        );
        if (!card) return;

        const s = stats || { total: 0, coupledCount: 0, normalCount: 0, maxCoupling: 0, topCoupled: [] };
        const topHtml = s.topCoupled.length
            ? s.topCoupled.map((item) =>
                `<div style="display:flex;justify-content:space-between;color:#a7f3d0;"><span>${item.id}</span><span>${item.coupling.toFixed(2)}</span></div>`
            ).join("")
            : `<div style="color:#94a3b8;">No high-coupling links</div>`;

        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;border-bottom:1px solid rgba(52,211,153,0.22);padding-bottom:2px;">
                <strong style="color:#34d399;">4. HIGH COUPLING</strong>
                <span style="color:#94a3b8;font-size:10px;">${s.coupledCount}/${s.total} HIGH</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;margin-bottom:4px;font-size:10px;">
                <div>HIGH: <strong style="color:#34d399;">${s.coupledCount}</strong></div>
                <div>BASE: <strong>${s.normalCount}</strong></div>
                <div>CUTOFF: <strong>${threshold.toFixed(2)}</strong></div>
                <div>MAX C: <strong>${s.maxCoupling.toFixed(2)}</strong></div>
            </div>
            <div data-role="top-list" style="border-top:1px solid rgba(255,255,255,0.08);padding-top:2px;font-size:10px;">
                <div style="color:#34d399;margin-bottom:2px;">TOP COUPLING</div>
                ${topHtml}
            </div>
        `;
        applyHeightBudgetToDrawer();
        if (typeof syncGimbalDrawerBounds === "function") syncGimbalDrawerBounds();
    }

    function handleHighCouplingToggle(active, config) {
        const cfg = config || (window.hudConfig = {});
        const threshold = Number.isFinite(cfg.highCouplingThresh) ? cfg.highCouplingThresh : 0.55;
        cfg.diagnosticOverlays = cfg.diagnosticOverlays || {};
        cfg.diagnosticOverlays.highCoupling = Boolean(active);
        cfg.overlays = cfg.overlays || {};
        cfg.overlays.atmos = Boolean(active);
        cfg.overlays.vacuum = Boolean(active);

        const stats = computeHighCouplingStats(threshold, getNodes, getEdges);
        cfg.diagnostics = cfg.diagnostics || {};
        cfg.diagnostics.highCoupling = { active: Boolean(active), threshold, ...stats };

        renderHighCouplingCard(Boolean(active), threshold, stats);
        window.dispatchEvent(new CustomEvent("hud:high-coupling-update", {
            detail: { active: Boolean(active), threshold, stats }
        }));
        return { key: "atmos", diagnostic: "highCoupling", active: Boolean(active), stats };
    }

    // --- #5 PATH DIV. (doppler / pathDivergence) ---
    function computePathDivergenceStats(threshold = 0.4, getNodesFn) {
        const nodes = typeof getNodesFn === "function" ? (getNodesFn() || []) : (window.nodes || []);
        const items = nodes.map((n, idx) => {
            const speed = Math.hypot(n?.vx || 0, n?.vy || 0, n?.vz || 0);
            const divergence = Math.min(3.0, speed * 0.65 + (Number.isFinite(n?.divergence) ? n.divergence : 0));
            return {
                id: n?.id || n?.name || `N-${idx + 1}`,
                divergence,
                divergent: divergence >= threshold
            };
        });
        const divItems = items.filter((it) => it.divergent).sort((a, b) => b.divergence - a.divergence);
        return {
            total: items.length,
            divergentCount: divItems.length,
            alignedCount: items.length - divItems.length,
            maxDivergence: items.length ? Math.max(...items.map((it) => it.divergence)) : 0,
            topDivergent: divItems.slice(0, 3)
        };
    }

    function renderPathDivergenceCard(active, threshold, stats) {
        if (!active) {
            removeDiagnosticCard("diag-card-path-divergence");
            return;
        }
        const card = createDiagnosticCardShell(
            "diag-card-path-divergence",
            "5. PATH DIV.",
            "",
            "#c084fc",
            "rgba(192,132,252,0.6)",
            "rgba(192,132,252,0.22)"
        );
        if (!card) return;

        const s = stats || { total: 0, divergentCount: 0, alignedCount: 0, maxDivergence: 0, topDivergent: [] };
        const topHtml = s.topDivergent.length
            ? s.topDivergent.map((item) =>
                `<div style="display:flex;justify-content:space-between;color:#e9d5ff;"><span>${item.id}</span><span>${item.divergence.toFixed(2)}</span></div>`
            ).join("")
            : `<div style="color:#6ee7b7;">Trajectories aligned</div>`;

        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;border-bottom:1px solid rgba(192,132,252,0.22);padding-bottom:2px;">
                <strong style="color:#c084fc;">5. PATH DIV.</strong>
                <span style="color:#94a3b8;font-size:10px;">${s.divergentCount}/${s.total} DIV</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;margin-bottom:4px;font-size:10px;">
                <div>DIV: <strong style="color:#c084fc;">${s.divergentCount}</strong></div>
                <div>ALIGNED: <strong>${s.alignedCount}</strong></div>
                <div>THRESH: <strong>${threshold.toFixed(2)}</strong></div>
                <div>MAX Δv: <strong>${s.maxDivergence.toFixed(2)}</strong></div>
            </div>
            <div data-role="top-list" style="border-top:1px solid rgba(255,255,255,0.08);padding-top:2px;font-size:10px;">
                <div style="color:#c084fc;margin-bottom:2px;">TOP DIVERGENCE</div>
                ${topHtml}
            </div>
        `;
        applyHeightBudgetToDrawer();
        if (typeof syncGimbalDrawerBounds === "function") syncGimbalDrawerBounds();
    }

    function handlePathDivergenceToggle(active, config) {
        const cfg = config || (window.hudConfig = {});
        const threshold = Number.isFinite(cfg.pathDivThresh) ? cfg.pathDivThresh : 0.4;
        cfg.diagnosticOverlays = cfg.diagnosticOverlays || {};
        cfg.diagnosticOverlays.pathDivergence = Boolean(active);
        cfg.overlays = cfg.overlays || {};
        cfg.overlays.doppler = Boolean(active);

        const stats = computePathDivergenceStats(threshold, getNodes);
        cfg.diagnostics = cfg.diagnostics || {};
        cfg.diagnostics.pathDivergence = { active: Boolean(active), threshold, ...stats };

        renderPathDivergenceCard(Boolean(active), threshold, stats);
        window.dispatchEvent(new CustomEvent("hud:path-divergence-update", {
            detail: { active: Boolean(active), threshold, stats }
        }));
        return { key: "doppler", diagnostic: "pathDivergence", active: Boolean(active), stats };
    }

    // --- #6 BASE DELTA (multipath / baselineDelta) ---
    function computeBaseDeltaStats(threshold = 12.0, getNodesFn) {
        const nodes = typeof getNodesFn === "function" ? (getNodesFn() || []) : (window.nodes || []);
        const items = nodes.map((n, idx) => {
            const x = n?.position ? n.position.x : (n?.x || 0);
            const y = n?.position ? n.position.y : (n?.y || 0);
            const z = n?.position ? n.position.z : (n?.z || 0);
            const bx = n?._baseX ?? x;
            const by = n?._baseY ?? y;
            const bz = n?._baseZ ?? z;
            const delta = Math.hypot(x - bx, y - by, z - bz);
            return {
                id: n?.id || n?.name || `N-${idx + 1}`,
                delta,
                drifted: delta >= threshold
            };
        });
        const driftedItems = items.filter((it) => it.drifted).sort((a, b) => b.delta - a.delta);
        return {
            total: items.length,
            driftedCount: driftedItems.length,
            steadyCount: items.length - driftedItems.length,
            maxDelta: items.length ? Math.max(...items.map((it) => it.delta)) : 0,
            topDelta: driftedItems.slice(0, 3)
        };
    }

    function renderBaseDeltaCard(active, threshold, stats) {
        if (!active) {
            removeDiagnosticCard("diag-card-base-delta");
            return;
        }
        const card = createDiagnosticCardShell(
            "diag-card-base-delta",
            "6. BASE DELTA",
            "",
            "#fb923c",
            "rgba(251,146,60,0.6)",
            "rgba(251,146,60,0.22)"
        );
        if (!card) return;

        const s = stats || { total: 0, driftedCount: 0, steadyCount: 0, maxDelta: 0, topDelta: [] };
        const topHtml = s.topDelta.length
            ? s.topDelta.map((item) =>
                `<div style="display:flex;justify-content:space-between;color:#fed7aa;"><span>${item.id}</span><span>${item.delta.toFixed(1)}u</span></div>`
            ).join("")
            : `<div style="color:#6ee7b7;">Within baseline drift</div>`;

        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;border-bottom:1px solid rgba(251,146,60,0.22);padding-bottom:2px;">
                <strong style="color:#fb923c;">6. BASE DELTA</strong>
                <span style="color:#94a3b8;font-size:10px;">${s.driftedCount}/${s.total} DRIFT</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;margin-bottom:4px;font-size:10px;">
                <div>DRIFT: <strong style="color:#fb923c;">${s.driftedCount}</strong></div>
                <div>STEADY: <strong>${s.steadyCount}</strong></div>
                <div>LIMIT: <strong>${threshold.toFixed(1)}u</strong></div>
                <div>MAX Δr: <strong>${s.maxDelta.toFixed(1)}u</strong></div>
            </div>
            <div data-role="top-list" style="border-top:1px solid rgba(255,255,255,0.08);padding-top:2px;font-size:10px;">
                <div style="color:#fb923c;margin-bottom:2px;">TOP DISPLACEMENT</div>
                ${topHtml}
            </div>
        `;
        applyHeightBudgetToDrawer();
        if (typeof syncGimbalDrawerBounds === "function") syncGimbalDrawerBounds();
    }

    function handleBaseDeltaToggle(active, config) {
        const cfg = config || (window.hudConfig = {});
        const threshold = Number.isFinite(cfg.baseDeltaThresh) ? cfg.baseDeltaThresh : 12.0;
        cfg.diagnosticOverlays = cfg.diagnosticOverlays || {};
        cfg.diagnosticOverlays.baseDelta = Boolean(active);
        cfg.overlays = cfg.overlays || {};
        cfg.overlays.multipath = Boolean(active);
        cfg.overlays.snr = Boolean(active);

        const stats = computeBaseDeltaStats(threshold, getNodes);
        cfg.diagnostics = cfg.diagnostics || {};
        cfg.diagnostics.baseDelta = { active: Boolean(active), threshold, ...stats };

        renderBaseDeltaCard(Boolean(active), threshold, stats);
        window.dispatchEvent(new CustomEvent("hud:base-delta-update", {
            detail: { active: Boolean(active), threshold, stats }
        }));
        return { key: "multipath", diagnostic: "baseDelta", active: Boolean(active), stats };
    }

    function applyHeightBudgetToDrawer() {
        const drawer = document.getElementById("gimbal-diagnostic-drawer");
        if (!drawer) return;

        const cards = Array.from(drawer.children).filter((el) => el.nodeType === 1);
        const gapPx = 6;

        drawer.style.display = cards.length ? "flex" : "none";
        drawer.style.flexDirection = "column";
        drawer.style.gap = `${gapPx}px`;
        drawer.style.overflowY = "auto";

        if (!cards.length) return;

        const stacked = cards.length > 1;
        cards.forEach((card) => {
            card.style.boxSizing = "border-box";
            card.style.maxHeight = "none";
            card.style.height = "auto";
            card.style.overflow = "visible";
            card.style.padding = stacked ? "5px 8px" : "7px 9px";
            card.style.fontSize = stacked ? "10px" : "11px";

            const sliderWrap = card.querySelector("[data-role='cutoff-control']");
            const topList = card.querySelector("[data-role='top-list']");
            if (sliderWrap) sliderWrap.style.display = "block";
            if (topList) topList.style.display = "block";
        });
    }

    function syncDiagnosticLocksAndBudget(changedKey = null, isNowActive = false) {
        const buttons = Array.from(document.querySelectorAll(".overlay-toggle"));
        const diagKeys = Object.keys(DIAG_COMPATIBILITY);
        const cfg = window.hudConfig || (window.hudConfig = {});
        cfg.diagnosticOverlays = cfg.diagnosticOverlays || {};
        cfg.overlays = cfg.overlays || {};

        let activeKeys = buttons
            .filter((b) => diagKeys.includes(b.getAttribute("data-overlay")) && b.classList.contains("active"))
            .map((b) => b.getAttribute("data-overlay"));

        if (changedKey && DIAG_COMPATIBILITY[changedKey]) {
            if (isNowActive) {
                if (!activeKeys.includes(changedKey)) activeKeys.push(changedKey);
                const allowed = new Set(DIAG_COMPATIBILITY[changedKey]);
                activeKeys = activeKeys.filter((k) => k === changedKey || allowed.has(k));
                if (activeKeys.length > 3) {
                    activeKeys = activeKeys.slice(activeKeys.length - 3);
                }
            } else {
                activeKeys = activeKeys.filter((k) => k !== changedKey);
            }
        }

        const activeSet = new Set(activeKeys);

        buttons.forEach((btn) => {
            const k = btn.getAttribute("data-overlay");
            if (!diagKeys.includes(k)) return;

            const shouldBeActive = activeSet.has(k);
            const wasActive = btn.classList.contains("active");
            btn.classList.toggle("active", shouldBeActive);
            cfg.overlays[k] = shouldBeActive;

            if (wasActive && !shouldBeActive) {
                const handlerName = DIAG_KEY_TO_HANDLER[k];
                if (handlerName && typeof window.diagnosticOverlayHandlers?.[handlerName] === "function") {
                    window.diagnosticOverlayHandlers[handlerName](false, cfg);
                }
            }

            let compatible = true;
            if (activeKeys.length > 0 && !shouldBeActive) {
                if (activeKeys.length >= 3) {
                    compatible = false;
                } else {
                    compatible = activeKeys.every((ak) => (DIAG_COMPATIBILITY[ak] || []).includes(k));
                }
            }

            btn.classList.toggle("diag-locked", !compatible);
            btn.setAttribute("aria-disabled", String(!compatible));
            if (!btn.dataset.baseLabel) {
                btn.dataset.baseLabel = btn.textContent.replace(/^🔒\s*/, "").trim();
            }
            btn.textContent = !compatible ? `🔒 ${btn.dataset.baseLabel}` : btn.dataset.baseLabel;
            btn.title = !compatible
                ? "Locked: incompatible with active diagnostic(s) or 3-slot stack full"
                : "";
        });

        applyHeightBudgetToDrawer();
        if (typeof syncGimbalDrawerBounds === "function") syncGimbalDrawerBounds();
    }

    function computePhaseFluxStats(threshold = 0.35, getNodesFn, getEdgesFn) {
        const nodes = typeof getNodesFn === "function" ? (getNodesFn() || []) : (window.nodes || []);
        const edges = typeof getEdgesFn === "function" ? (getEdgesFn() || []) : (window.edges || []);
        const simTime = Number.isFinite(window.hudConfig?.simulationTime) ? window.hudConfig.simulationTime : 0;

        const getNodePhase = (n, idx = 0) => {
            if (!n) return simTime * 0.5 + idx * 0.4;
            if (typeof n.phase === "number" && Number.isFinite(n.phase)) return n.phase;
            if (typeof n._phase === "number" && Number.isFinite(n._phase)) return n._phase;
            const x = n.position ? n.position.x : (n.x || 0);
            const z = n.position ? n.position.z : (n.z || 0);
            return Math.atan2(z, x) + simTime * 0.5 + idx * 0.35;
        };

        const resolveNode = (ref, fallbackIdx = 0) => {
            if (ref && typeof ref === "object") return { node: ref, idx: fallbackIdx };
            const foundIdx = nodes.findIndex((n) => n && (n.id === ref || n.name === ref));
            if (foundIdx >= 0) return { node: nodes[foundIdx], idx: foundIdx };
            return { node: nodes[fallbackIdx] || {}, idx: fallbackIdx };
        };

        const wrapPhaseDiff = (a, b) => {
            let d = (a - b) % (Math.PI * 2);
            if (d > Math.PI) d -= Math.PI * 2;
            if (d < -Math.PI) d += Math.PI * 2;
            return Math.abs(d);
        };

        const items = edges.map((edge, idx) => {
            const { node: a, idx: idxA } = resolveNode(edge.source ?? edge.a, idx);
            const { node: b, idx: idxB } = resolveNode(edge.target ?? edge.b, (idx + 1) % Math.max(1, nodes.length));
            const dPhi = wrapPhaseDiff(getNodePhase(a, idxA), getNodePhase(b, idxB));
            const omegaA = Number.isFinite(a.omega) ? a.omega : (Number.isFinite(a.dPhase) ? a.dPhase : 0.25);
            const omegaB = Number.isFinite(b.omega) ? b.omega : (Number.isFinite(b.dPhase) ? b.dPhase : 0.25);
            const flux = Math.min(3.14, dPhi * 0.7 + Math.min(1.0, Math.abs(omegaB - omegaA) * 0.4));
            return { id: edge.id ?? `${a.id || "N"}-${b.id || "N"}`, flux, flagged: flux > threshold };
        });

        const fluxItems = items.filter((it) => it.flagged).sort((x, y) => y.flux - x.flux);
        return {
            total: items.length,
            coherentCount: items.length - fluxItems.length,
            fluxCount: fluxItems.length,
            maxFlux: items.length ? Math.max(...items.map((it) => it.flux)) : 0,
            topFlux: fluxItems.slice(0, 3)
        };
    }

    function renderPhaseFluxCard(active, threshold, stats) {
        const drawer = document.getElementById("gimbal-diagnostic-drawer");
        if (!drawer) return;

        let card = document.getElementById("diag-card-phase-flux");
        if (!active) {
            if (card) card.remove();
            applyHeightBudgetToDrawer();
            if (typeof syncGimbalDrawerBounds === "function") syncGimbalDrawerBounds();
            return;
        }

        if (!card) {
            card = document.createElement("div");
            card.id = "diag-card-phase-flux";
            card.style.cssText = [
                "background:rgba(5,12,18,0.94)",
                "border:1px solid rgba(251,191,36,0.6)",
                "border-radius:4px",
                "padding:7px 9px",
                "font-family:monospace",
                "font-size:11px",
                "color:#fef3c7",
                "box-shadow:0 4px 12px rgba(0,0,0,0.5)",
                "flex-shrink:0"
            ].join(";");
            drawer.appendChild(card);
        }

        const safeStats = stats || { total: 0, coherentCount: 0, fluxCount: 0, maxFlux: 0, topFlux: [] };
        const topListHtml = safeStats.topFlux.length
            ? safeStats.topFlux.map((g) =>
                `<div style="display:flex;justify-content:space-between;color:#fde68a;"><span>${g.id}</span><span>${g.flux.toFixed(3)} rad</span></div>`
            ).join("")
            : `<div style="color:#6ee7b7;">Phase-locked within limit</div>`;

        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;border-bottom:1px solid rgba(251,191,36,0.22);padding-bottom:2px;">
                <strong style="color:#fbbf24;">2. PHASE / FLUX</strong>
                <span style="color:#94a3b8;font-size:10px;">${safeStats.coherentCount}/${safeStats.total} COH</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;margin-bottom:4px;font-size:10px;">
                <div>COH: <strong style="color:#34d399;">${safeStats.coherentCount}</strong></div>
                <div>FLUX: <strong style="color:#fbbf24;">${safeStats.fluxCount}</strong></div>
                <div>LIMIT: <strong>${threshold.toFixed(2)}</strong></div>
                <div>MAX Φ: <strong>${safeStats.maxFlux.toFixed(2)}</strong></div>
            </div>
            <div data-role="cutoff-control" style="margin-bottom:4px;">
                <div style="display:flex;justify-content:space-between;font-size:10px;color:#cbd5e1;margin-bottom:2px;">
                    <span>FLUX LIMIT</span>
                    <span>${threshold.toFixed(2)}</span>
                </div>
                <input id="flux-popup-thresh-slider" type="range" min="0.05" max="2.5" step="0.05" value="${threshold.toFixed(2)}" style="width:100%;accent-color:#fbbf24;cursor:pointer;margin:0;">
            </div>
            <div data-role="top-list" style="border-top:1px solid rgba(255,255,255,0.08);padding-top:2px;font-size:10px;">
                <div style="color:#fbbf24;margin-bottom:2px;">TOP FLUX</div>
                ${topListHtml}
            </div>
        `;

        applyHeightBudgetToDrawer();
        if (typeof syncGimbalDrawerBounds === "function") syncGimbalDrawerBounds();

        const popupSlider = card.querySelector("#flux-popup-thresh-slider");
        if (popupSlider) {
            popupSlider.addEventListener("input", (e) => {
                const nextVal = parseFloat(e.target.value);
                window.hudConfig = window.hudConfig || {};
                window.hudConfig.phaseFluxThresh = nextVal;
                const updatedStats = computePhaseFluxStats(nextVal);
                renderPhaseFluxCard(true, nextVal, updatedStats);
                window.dispatchEvent(new CustomEvent("hud:phase-flux-update", {
                    detail: { active: true, threshold: nextVal, stats: updatedStats }
                }));
            });
        }
    }

    function handlePhaseFluxToggle(active, config) {
        const cfg = config || (window.hudConfig = {});
        const threshold = Number.isFinite(cfg.phaseFluxThresh) ? cfg.phaseFluxThresh : 0.35;
        cfg.phaseFluxThresh = threshold;
        cfg.diagnosticOverlays = cfg.diagnosticOverlays || {};
        cfg.diagnosticOverlays.phaseFlux = Boolean(active);

        const stats = computePhaseFluxStats(threshold);
        cfg.diagnostics = cfg.diagnostics || {};
        cfg.diagnostics.phaseFlux = { active: Boolean(active), threshold, ...stats };

        renderPhaseFluxCard(Boolean(active), threshold, stats);

        window.dispatchEvent(new CustomEvent("hud:phase-flux-update", {
            detail: { active: Boolean(active), threshold, stats }
        }));

        return { key: "wave", diagnostic: "phaseFlux", active: Boolean(active), threshold, stats };
    }


    window.syncDiagnosticLocksAndBudget = syncDiagnosticLocksAndBudget;
    window.computePhaseFluxStats = computePhaseFluxStats;
    window.renderPhaseFluxCard = renderPhaseFluxCard;
    window.diagnosticOverlayHandlers = window.diagnosticOverlayHandlers || {};
    window.diagnosticOverlayHandlers.phaseFlux = handlePhaseFluxToggle;
    window.renderPinLocksCard = renderPinLocksCard;
    window.renderHighCouplingCard = renderHighCouplingCard;
    window.renderPathDivergenceCard = renderPathDivergenceCard;
    window.renderBaseDeltaCard = renderBaseDeltaCard;

    document.querySelectorAll(".overlay-toggle").forEach((btn) => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = "true";
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const targetBtn = e.currentTarget;

            if (targetBtn.classList.contains("diag-locked") || targetBtn.getAttribute("aria-disabled") === "true") {
                e.stopImmediatePropagation();
                return;
            }

            const key = targetBtn.getAttribute("data-overlay");
            const handler = overlayHandlers[key];
            if (!key || typeof handler !== "function") return;

            const active = targetBtn.classList.toggle("active");
            window.hudConfig = window.hudConfig || {};
            window.hudConfig.overlays = window.hudConfig.overlays || {};
            window.hudConfig.overlays[key] = active;
            if (key === "emp") window.hudConfig.overlays.em = active;
            if (key === "atmos") window.hudConfig.overlays.vacuum = active;
            if (key === "multipath") window.hudConfig.overlays.snr = active;

            const result = handler(active, window.hudConfig);

            if (DIAG_COMPATIBILITY[key] && typeof syncDiagnosticLocksAndBudget === "function") {
                syncDiagnosticLocksAndBudget(key, active);
            }

            if (window.hudViewport && typeof window.hudViewport.setOverlays === "function") {
                window.hudViewport.setOverlays({ ...window.hudConfig.overlays });
            }

            window.dispatchEvent(new CustomEvent("hud:diagnostic-overlay-toggle", {
                detail: {
                    key,
                    active,
                    result,
                    overlays: { ...window.hudConfig.overlays },
                },
            }));
        });
    });

    function syncGimbalDrawerBounds() {
        const drawer = document.getElementById("gimbal-diagnostic-drawer");
        const gimbal = document.getElementById("gimbal-hud");
        if (!drawer || !gimbal) return;

        const hasCards = drawer.children.length > 0;
        if (!hasCards) {
            drawer.style.display = "none";
            return;
        }

        drawer.style.display = "flex";
        const gimbalRect = gimbal.getBoundingClientRect();
        const topBar = document.querySelector(".hud-top-right-container");
        const topBarBottom = topBar ? topBar.getBoundingClientRect().bottom : 56;

        const gap = 8;
        const topSafeMargin = topBarBottom + 10;
        const availableHeight = Math.max(120, Math.floor(gimbalRect.top - gap - topSafeMargin));
        const bottomOffset = Math.max(20, Math.round(window.innerHeight - gimbalRect.top + gap));

        drawer.style.right = `${Math.max(12, Math.round(window.innerWidth - gimbalRect.right))}px`;
        drawer.style.width = `${Math.max(220, Math.round(gimbalRect.width))}px`;
        drawer.style.bottom = `${bottomOffset}px`;
        drawer.style.maxHeight = `${availableHeight}px`;
        drawer.style.overflowY = "auto";
    }

    window.addEventListener("resize", syncGimbalDrawerBounds);
    window.syncGimbalDrawerBounds = syncGimbalDrawerBounds;

    function computeSnrGateStats(threshold, getNodesFn, getEdgesFn) {
        const nodes = typeof getNodesFn === "function" ? (getNodesFn() || []) : (window.nodes || []);
        const edges = typeof getEdgesFn === "function" ? (getEdgesFn() || []) : (window.edges || []);

        const resolveNode = (ref) => {
            if (!ref) return {};
            if (typeof ref === "object") return ref;
            return nodes.find((n) => n && (n.id === ref || n.name === ref)) || {};
        };

        const items = edges.map((edge, idx) => {
            const a = resolveNode(edge.source ?? edge.a);
            const b = resolveNode(edge.target ?? edge.b);
            const tension = Number.isFinite(edge.tension)
                ? edge.tension
                : (Number.isFinite(edge.strain) ? edge.strain : 0.2);
            const relVel = Math.hypot(
                (b.vx || 0) - (a.vx || 0),
                (b.vy || 0) - (a.vy || 0),
                (b.vz || 0) - (a.vz || 0)
            );
            const noise = Math.min(1, tension * 0.75 + Math.min(0.25, relVel * 0.05));
            const gated = noise > threshold;
            return { id: edge.id ?? `#${idx + 1}`, noise, gated };
        });

        const gatedItems = items
            .filter((it) => it.gated)
            .sort((x, y) => y.noise - x.noise);
        const passCount = items.length - gatedItems.length;
        const maxNoise = items.length ? Math.max(...items.map((it) => it.noise)) : 0;

        return {
            total: items.length,
            passCount,
            gatedCount: gatedItems.length,
            maxNoise,
            topGated: gatedItems.slice(0, 3)
        };
    }

    function renderSnrGateCard(active, threshold, stats) {
        const drawer = document.getElementById("gimbal-diagnostic-drawer");
        if (!drawer) return;

        let card = document.getElementById("diag-card-snr-gate");
        if (!active) {
            if (card) card.remove();
            syncGimbalDrawerBounds();
            return;
        }

        if (!card) {
            card = document.createElement("div");
            card.id = "diag-card-snr-gate";
            card.style.cssText = [
                "background:rgba(5,12,18,0.94)",
                "border:1px solid rgba(239,68,68,0.6)",
                "border-radius:4px",
                "padding:7px 9px",
                "font-family:monospace",
                "font-size:11px",
                "color:#d1fae5",
                "box-shadow:0 4px 12px rgba(0,0,0,0.5)",
                "flex-shrink:0"
            ].join(";");
            drawer.appendChild(card);
        }

        const safeStats = stats || { total: 0, passCount: 0, gatedCount: 0, maxNoise: 0, topGated: [] };
        const topListHtml = safeStats.topGated.length
            ? safeStats.topGated.map((g) =>
                `<div style="display:flex;justify-content:space-between;color:#fca5a5;"><span>${g.id}</span><span>${g.noise.toFixed(3)}</span></div>`
            ).join("")
            : `<div style="color:#6ee7b7;">None above threshold</div>`;

        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;border-bottom:1px solid rgba(0,255,204,0.2);padding-bottom:3px;">
                <strong style="color:#f87171;">1. SNR GATE</strong>
                <span style="color:#94a3b8;font-size:10px;">${safeStats.passCount}/${safeStats.total} PASS</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;margin-bottom:5px;font-size:10px;">
                <div>PASS: <strong style="color:#34d399;">${safeStats.passCount}</strong></div>
                <div>GATED: <strong style="color:#f87171;">${safeStats.gatedCount}</strong></div>
                <div>THRESH: <strong>${threshold.toFixed(2)}</strong></div>
                <div>MAX N: <strong>${safeStats.maxNoise.toFixed(2)}</strong></div>
            </div>
            <div style="margin-bottom:5px;">
                <div style="display:flex;justify-content:space-between;font-size:10px;color:#cbd5e1;margin-bottom:2px;">
                    <span>CUTOFF</span>
                    <span>${threshold.toFixed(2)}</span>
                </div>
                <input id="snr-popup-thresh-slider" type="range" min="0" max="0.5" step="0.01" value="${threshold.toFixed(2)}" style="width:100%;accent-color:#ef4444;cursor:pointer;margin:0;">
            </div>
            <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:3px;font-size:10px;">
                <div style="color:#f87171;margin-bottom:2px;">TOP GATED</div>
                ${topListHtml}
            </div>
        `;

        syncGimbalDrawerBounds();

        const popupSlider = card.querySelector("#snr-popup-thresh-slider");
        const deckSlider = document.getElementById("slider-noise-thresh");
        if (popupSlider) {
            popupSlider.addEventListener("input", (e) => {
                const nextVal = parseFloat(e.target.value);
                window.hudConfig = window.hudConfig || {};
                window.hudConfig.noiseThresh = nextVal;
                window.hudConfig.noiseThreshold = nextVal;
                if (deckSlider) {
                    deckSlider.value = nextVal.toFixed(2);
                    deckSlider.dispatchEvent(new Event("input", { bubbles: true }));
                }
                const updatedStats = computeSnrGateStats(nextVal);
                renderSnrGateCard(true, nextVal, updatedStats);
                window.dispatchEvent(new CustomEvent("hud:snr-gate-update", {
                    detail: { active: true, threshold: nextVal, stats: updatedStats }
                }));
            });
        }
    }

    window.renderSnrGateCard = renderSnrGateCard;

    function handleSnrGateToggle(active, config) {
        const cfg = config || (window.hudConfig = {});
        const threshold = Number.isFinite(cfg.noiseThresh)
            ? cfg.noiseThresh
            : (Number.isFinite(cfg.noiseThreshold) ? cfg.noiseThreshold : 0.05);
        cfg.noiseThresh = threshold;
        cfg.noiseThreshold = threshold;
        cfg.diagnosticOverlays = cfg.diagnosticOverlays || {};
        cfg.diagnosticOverlays.snrGate = Boolean(active);

        const stats = computeSnrGateStats(threshold);

        cfg.diagnostics = cfg.diagnostics || {};
        cfg.diagnostics.snrGate = { active: Boolean(active), threshold, ...stats };

        renderSnrGateCard(Boolean(active), threshold, stats);

        window.dispatchEvent(new CustomEvent("hud:snr-gate-update", {
            detail: { active: Boolean(active), threshold, stats }
        }));

        return { key: "snr-gate", diagnostic: "snrGate", active: Boolean(active), threshold, stats };
    }

    window.diagnosticOverlayHandlers = window.diagnosticOverlayHandlers || {};
    window.diagnosticOverlayHandlers.snrGate = handleSnrGateToggle;
    window.syncGimbalDrawerBounds = syncGimbalDrawerBounds;

    const snapshotBtn = document.getElementById("snapshotBtn") || document.querySelector('button[data-action="snapshot"], .snapshot-trigger');
    if (snapshotBtn && !snapshotBtn.dataset.bound && typeof window.captureSpatialSnapshot === "function") {
        snapshotBtn.dataset.bound = "true";
        snapshotBtn.addEventListener("click", (e) => {
            e.preventDefault();
            window.captureSpatialSnapshot();
        });
    }
}