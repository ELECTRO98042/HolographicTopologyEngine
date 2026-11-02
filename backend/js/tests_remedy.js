/**
 * backend/js/tests_remedy.js
 * Holographic Topology Engine - System State Audit & Remedy Harness (v2.7.8)
 */

class TopologyRemedyEngine {
    constructor(viewportInstance) {
        this.viewport = viewportInstance;
        this.actionHistory = []; // Stack for step-back / undo actions
        this.maxHistorySize = 50;
        this.initRemedyUI();
    }

    /**
     * 1. Record user interaction for history tracking & backtracking
     */
    logAction(actionType, description, payload, stateSnapshot) {
        const entry = {
            id: `action-${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: actionType, // 'NODE_ADD', 'NODE_REMOVE', 'TETHER_ADD', 'TETHER_REMOVE', 'SLIDER_CHANGE'
            description: description,
            payload: payload,
            snapshot: stateSnapshot
        };

        this.actionHistory.push(entry);
        if (this.actionHistory.length > this.maxHistorySize) {
            this.actionHistory.shift();
        }
        console.log(`[Remedy Engine] Logged action: [${actionType}] - ${description}`);
    }

    /**
     * 2. Step Backwards: Undo the last user interaction
     */
    stepBack() {
        if (this.actionHistory.length === 0) {
            console.warn("[Remedy Engine] No actions left in history stack to undo.");
            alert("Already at baseline state. No previous user actions to undo.");
            return false;
        }

        const lastAction = this.actionHistory.pop();
        console.log(`[Remedy Engine] Undoing action: ${lastAction.description}`);

        switch (lastAction.type) {
            case 'NODE_ADD':
                // Remove the specific added node by ID
                if (lastAction.payload && lastAction.payload.nodeId) {
                    this.viewport.removeNodeById(lastAction.payload.nodeId);
                }
                break;
            case 'TETHER_ADD':
                // Remove the specific connection between source and target
                if (lastAction.payload) {
                    this.viewport.removeConnection(lastAction.payload.sourceId, lastAction.payload.targetId);
                }
                break;
            case 'SLIDER_CHANGE':
                // Revert slider value if stored
                if (lastAction.payload && lastAction.payload.elementId) {
                    const el = document.getElementById(lastAction.payload.elementId);
                    if (el) {
                        el.value = lastAction.payload.previousValue;
                        if (typeof window.evaluateActiveFormula === 'function') window.evaluateActiveFormula();
                    }
                }
                break;
            default:
                console.warn("[Remedy Engine] Generic rollback triggered.");
                break;
        }

        this.viewport.syncToMainHUD();
        this.runDiagnosticAudit(); // Re-audit after undo
        return true;
    }

    /**
     * 3. Comprehensive System State Diagnostic Audit
     */
    runDiagnosticAudit() {
        const faults = [];
        const nodes = this.viewport.nodes || [];
        const connections = this.viewport.connections || [];

        // Check 1: Orphaned Connections (References missing nodes)
        connections.forEach((conn, index) => {
            const srcExists = nodes.some(n => (n.data ? n.data.id : n.id) === (conn.nodeA.data ? conn.nodeA.data.id : conn.nodeA.id));
            const tgtExists = nodes.some(n => (n.data ? n.data.id : n.id) === (conn.nodeB.data ? conn.nodeB.data.id : conn.nodeB.id));
            if (!srcExists || !tgtExists) {
                faults.push({
                    id: `fault-conn-${index}`,
                    severity: 'HIGH',
                    category: 'ORPHANED_TETHER',
                    message: `Connection tether references non-existent node ID.`,
                    remedyAction: () => this.viewport.removeConnectionByIndex(index)
                });
            }
        });

        // Check 2: Illegal Bond Validation across all active tethers
        connections.forEach((conn, index) => {
            const typeA = conn.nodeA.data ? conn.nodeA.data.type : conn.nodeA.type;
            const typeB = conn.nodeB.data ? conn.nodeB.data.type : conn.nodeB.type;
            if (this.viewport.checkBondValidity && !this.viewport.checkBondValidity(typeA, typeB)) {
                faults.push({
                    id: `fault-bond-${index}`,
                    severity: 'CRITICAL',
                    category: 'ILLEGAL_BOND',
                    message: `Illegal bond detected between [${typeA}] and [${typeB}].`,
                    remedyAction: () => this.viewport.removeConnectionByIndex(index)
                });
            }
        });

        // Check 3: HUD Bridge sync check
        if (!window.activeDeckNodes || window.activeDeckNodes.length !== nodes.length) {
            faults.push({
                id: 'fault-sync-bridge',
                severity: 'MEDIUM',
                category: 'HUD_DESYNC',
                message: `Window active deck nodes desynchronized from viewport node array.`,
                remedyAction: () => { window.activeDeckNodes = nodes; }
            });
        }

        this.renderReportModal(nodes, connections, faults);
        return faults;
    }

    /**
     * 4. Inject Pop-out Report Disclosure Modal Window into DOM
     */
    initRemedyUI() {
        // Inside your TopologyRemedyEngine audit / modal initialization method:
        if (!document.getElementById('remedy-modal-overlay')) {
            const modalOverlay = document.createElement('div');
            modalOverlay.id = 'remedy-modal-overlay';
            // Positioned as a floating panel without a blocking backdrop
            modalOverlay.style.cssText = `
        position: fixed;
        top: 100px;
        right: 50px;
        width: 650px;
        max-width: 90vw;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid #00ffcc;
        border-radius: 6px;
        box-shadow: 0 0 25px rgba(0, 255, 204, 0.3);
        font-family: 'Courier New', Courier, monospace;
        color: #00ffcc;
        z-index: 9999;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
    `;

            modalOverlay.innerHTML = `
        <!-- Draggable Header Handle -->
        <div id="remedy-drag-handle" style="
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            background: rgba(0, 255, 204, 0.1);
            border-bottom: 1px solid rgba(0, 255, 204, 0.3); 
            padding: 10px 14px;
            cursor: move;
            border-top-left-radius: 5px;
            border-top-right-radius: 5px;
        ">
            <h3 style="margin: 0; font-size: 13px; letter-spacing: 1.5px; text-transform: uppercase;">System State Audit & Remedy Console</h3>
            <button id="remedy-close-btn" style="background: transparent; border: 1px solid #ff0055; color: #ff0055; padding: 2px 8px; cursor: pointer; font-family: inherit; font-size: 11px; border-radius: 2px;">[CLOSE]</button>
        </div>
        
        <!-- Modal Body Content -->
        <div style="padding: 14px; display: flex; flex-direction: column; gap: 12px;">
            <div id="remedy-body-output" style="font-size: 12px; line-height: 1.5; color: #e2e8f0; max-height: 350px; overflow-y: auto;">
                <!-- Audit results injected here -->
            </div>
            
            <div style="display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid rgba(0, 255, 204, 0.2); padding-top: 10px;">
                <button id="remedy-undo-btn" style="background: rgba(0, 255, 204, 0.1); border: 1px solid #00ffcc; color: #00ffcc; padding: 6px 12px; cursor: pointer; font-family: inherit; font-size: 11px; border-radius: 2px;">Step Back (Undo)</button>
                <button id="remedy-apply-btn" style="background: #00ffcc; border: 1px solid #00ffcc; color: #05050a; font-weight: bold; padding: 6px 12px; cursor: pointer; font-family: inherit; font-size: 11px; border-radius: 2px;">Apply All Remedies</button>
            </div>
        </div>
    `;
            document.body.appendChild(modalOverlay);

            // --- Implement Draggable Behavior ---
            const header = document.getElementById("remedy-drag-handle");
            let isDragging = false;
            let startX, startY, initialLeft, initialTop;

            header.addEventListener("mousedown", (e) => {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;

                const rect = modalOverlay.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;

                modalOverlay.style.right = "auto";
                modalOverlay.style.left = `${initialLeft}px`;
                modalOverlay.style.top = `${initialTop}px`;

                e.preventDefault();
            });

            document.addEventListener("mousemove", (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                modalOverlay.style.left = `${initialLeft + dx}px`;
                modalOverlay.style.top = `${initialTop + dy}px`;
            });

            document.addEventListener("mouseup", () => {
                isDragging = false;
            });

            // Close Button Action
            document.getElementById('remedy-close-btn').addEventListener('click', () => {
                modalOverlay.classList.add('hidden');
            });
        }
    }

    renderReportModal(nodes, connections, faults) {
        const bodyEl = document.getElementById('remedy-modal-body');
        const countEl = document.getElementById('remedy-stack-count');
        if (countEl) countEl.textContent = this.actionHistory.length;

        if (!bodyEl) return;

        let faultsHTML = '';
        if (faults.length === 0) {
            faultsHTML = `<div class="p-3 rounded bg-engine-cyan/10 border border-engine-cyan/30 text-engine-cyan text-center">✔ All system states nominal. No topological or tether anomalies detected.</div>`;
        } else {
            faultsHTML = faults.map((f, i) => `
                <div class="p-2.5 rounded bg-slate-950 border border-${f.severity === 'CRITICAL' ? 'engine-red' : 'amber-500'}/40 flex justify-between items-center">
                    <div>
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-${f.severity === 'CRITICAL' ? 'engine-red' : 'amber-500'}/20 text-${f.severity === 'CRITICAL' ? 'engine-red' : 'amber-400'} font-bold">${f.severity}</span>
                        <span class="ml-2 text-slate-200">${f.message}</span>
                    </div>
                    <button onclick="window.remedyEngine.resolveFault('${f.id}')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-engine-cyan text-[10px]">REMEDY</button>
                </div>
            `).join('');
        }

        bodyEl.innerHTML = `
            <div class="space-y-3">
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="p-2 rounded bg-slate-950 border border-engine-border">
                        <span class="text-[10px] text-slate-500 block">ACTIVE NODES</span>
                        <span class="text-sm font-bold text-slate-100">${nodes.length}</span>
                    </div>
                    <div class="p-2 rounded bg-slate-950 border border-engine-border">
                        <span class="text-[10px] text-slate-500 block">ACTIVE TETHERS</span>
                        <span class="text-sm font-bold text-slate-100">${connections.length}</span>
                    </div>
                    <div class="p-2 rounded bg-slate-950 border border-engine-border">
                        <span class="text-[10px] text-slate-500 block">DETECTED FAULTS</span>
                        <span class="text-sm font-bold ${faults.length > 0 ? 'text-engine-red' : 'text-engine-cyan'}">${faults.length}</span>
                    </div>
                </div>
                <div>
                    <span class="text-slate-400 text-[11px] font-semibold block mb-2">DIAGNOSTIC FAULT AUDIT:</span>
                    <div class="space-y-2">${faultsHTML}</div>
                </div>
            </div>
        `;

        this.currentFaults = faults;
        document.getElementById('remedy-modal-overlay').classList.remove('hidden');
    }

    resolveFault(faultId) {
        const fault = this.currentFaults.find(f => f.id === faultId);
        if (fault && typeof fault.remedyAction === 'function') {
            fault.remedyAction();
            console.log(`[Remedy Engine] Resolved fault: ${faultId}`);
            this.runDiagnosticAudit(); // Refresh audit
        }
    }

    executeAllRemedies() {
        if (this.currentFaults) {
            this.currentFaults.forEach(f => {
                if (typeof f.remedyAction === 'function') f.remedyAction();
            });
            this.runDiagnosticAudit();
        }
    }

    closeModal() {
        document.getElementById('remedy-modal-overlay').classList.add('hidden');
    }
    resetHistory() {
        this.actionHistory = [];
        console.log("[Remedy Engine] Action history stack purged and reset for new session.");
    }
}
window.TopologyRemedyEngine = TopologyRemedyEngine;

window.runAutomatedTests = function () {
    if (window.deckViewPort) {
        if (!window.remedyEngine) {
            window.remedyEngine = new TopologyRemedyEngine(window.deckViewPort);
        }
        window.remedyEngine.runDiagnosticAudit();
    } else {
        console.warn("[Remedy Engine] DeckViewport not initialized yet.");
    }
};