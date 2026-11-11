// backend/js/tetherAssistant.js
/**
 * Tether Assistant
 * Guides the observer node-by-node through establishing verified, rule-compliant tethers,
 * prioritizing core/boundary anchors before orbiting quantum fields.
 */
export class TetherAssistant {
    constructor(deckViewport) {
        this.deck = deckViewport;
        this.activeSession = null;
        this.currentIndex = 0;
        this.stagedModel = null;
    }

    startGuidedSession(stagedModel) {
        this.stagedModel = stagedModel;
        this.currentIndex = 0;

        if (this.stagedModel && this.stagedModel.nodes) {
            this.stagedModel.nodes.sort((a, b) => {
                const aIsCore = a.id.startsWith('N-') || (a.type && a.type.includes('TOPOLOGY'));
                const bIsCore = b.id.startsWith('N-') || (b.type && b.type.includes('TOPOLOGY'));
                if (aIsCore && !bIsCore) return -1;
                if (!aIsCore && bIsCore) return 1;
                return a.id.localeCompare(b.id);
            });
        }

        this.renderWizardModal();
    }

    renderWizardModal() {
        let modal = document.getElementById('tether-wizard-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'tether-wizard-modal';
            modal.style.cssText = "position: fixed; top: 76px; right: 380px; z-index: 10000; width: 380px; font-family: monospace;";
            document.body.appendChild(modal);
        }

        const nodes = this.stagedModel.nodes || [];
        if (nodes.length === 0) return;

        if (this.currentIndex >= nodes.length) {
            this.finishGuidedSession(modal);
            return;
        }

        const currentNode = nodes[this.currentIndex];
        const edges = this.stagedModel.edges || this.stagedModel.connections || [];

        const currentTethers = edges.filter(e => {
            const src = typeof e.source === 'object' ? (e.source.id || e.source.name) : e.source;
            const tgt = typeof e.target === 'object' ? (e.target.id || e.target.name) : e.target;
            return String(src) === String(currentNode.id) || String(tgt) === String(currentNode.id);
        });

        modal.innerHTML = `
            <div style="background: rgba(12, 16, 23, 0.95); border: 1px solid rgba(0, 240, 255, 0.4); backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0,0,0,0.8);" class="p-4 rounded-lg text-slate-200 space-y-3">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                    <h3 class="text-engine-cyan font-bold text-xs">// TETHER ASSISTANT [Node ${this.currentIndex + 1} of ${nodes.length}]</h3>
                    <button id="wizard-close" style="background: #1e293b; border: 1px solid #334155; color: #94a3b8; padding: 2px 6px; border-radius: 4px;" class="hover:text-white hover:bg-slate-700 text-xs cursor-pointer">✕</button>
                </div>
                
                <div style="background: #090d13; border: 1px solid #1e293b;" class="p-2.5 rounded space-y-1">
                    <div class="text-[10px] text-slate-400">Current Focus Node:</div>
                    <div class="text-emerald-400 font-bold text-xs">${currentNode.id} - ${currentNode.name || currentNode.id}</div>
                    <div class="text-[9px] text-slate-500">Type: ${currentNode.type} | Active Tethers: ${currentTethers.length}</div>
                </div>

                <div>
                    <div class="text-[10px] text-slate-400 mb-1">Attached Tethers:</div>
                    <div class="max-h-24 overflow-y-auto space-y-1 pr-1">
                        ${currentTethers.length > 0 ? currentTethers.map((t) => {
            const sId = typeof t.source === 'object' ? t.source.id : t.source;
            const tId = typeof t.target === 'object' ? t.target.id : t.target;
            const globalIndex = edges.findIndex(edge => {
                const es = typeof edge.source === 'object' ? edge.source.id : edge.source;
                const et = typeof edge.target === 'object' ? edge.target.id : edge.target;
                const curS = typeof t.source === 'object' ? t.source.id : t.source;
                const curT = typeof t.target === 'object' ? t.target.id : t.target;
                return String(es) === String(curS) && String(et) === String(curT);
            });
            return `
                                <div style="background: #090d13; border: 1px solid #1e293b;" class="flex justify-between items-center p-1.5 rounded text-[11px]">
                                    <span class="text-slate-300">${sId} ↔ ${tId}</span>
                                    <button data-remove-edge="${globalIndex}" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); color: #ef4444; padding: 2px 6px; border-radius: 4px;" class="text-[10px] hover:bg-red-950 cursor-pointer">Untether</button>
                                </div>
                            `;
        }).join('') : '<div class="text-slate-500 text-[10px] italic">No tethers currently attached.</div>'}
                    </div>
                </div>

                <div class="flex space-x-2 pt-2 border-t border-slate-800">
                    <button id="wizard-skip" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1;" class="flex-1 py-1.5 rounded text-xs transition-all cursor-pointer hover:bg-slate-700">Skip / Next</button>
                    <button id="wizard-add" style="background: rgba(0, 240, 255, 0.2); border: 1px solid rgba(0, 240, 255, 0.5); color: #00f0ff;" class="flex-1 py-1.5 rounded text-xs font-bold transition-all cursor-pointer hover:bg-cyan-950">+ Add Tether...</button>
                </div>

                <div class="flex justify-between pt-1">
                    <button id="wizard-exit" style="background: #1e293b; border: 1px solid #334155; color: #94a3b8; padding: 2px 8px; border-radius: 4px;" class="text-[10px] cursor-pointer hover:text-white hover:bg-slate-700">Exit to Free-form</button>
                </div>
            </div>
        `;

        modal.style.display = 'block';

        document.getElementById('wizard-close').onclick = () => { modal.style.display = 'none'; };
        document.getElementById('wizard-exit').onclick = () => { modal.style.display = 'none'; };
        document.getElementById('wizard-skip').onclick = () => {
            this.currentIndex++;
            this.renderWizardModal();
        };

        document.getElementById('wizard-add').onclick = () => {
            this.promptTargetSelection(currentNode);
        };

        modal.querySelectorAll('[data-remove-edge]').forEach(btn => {
            btn.onclick = (e) => {
                const edgeIdx = parseInt(e.target.getAttribute('data-remove-edge'));
                if (!isNaN(edgeIdx) && edgeIdx > -1) {
                    edges.splice(edgeIdx, 1);
                    this.stagedModel.edges = edges;
                    this.deck.applySyncedNodes(nodes, edges);
                    if (window.limboController) window.limboController.validateAndRefreshCommitButton();
                    this.renderWizardModal();
                }
            };
        });
    }

    promptTargetSelection(sourceNode) {
        const modal = document.getElementById('tether-wizard-modal');
        const availableNodes = (this.stagedModel.nodes || []).filter(n => n.id !== sourceNode.id);

        modal.innerHTML = `
            <div style="background: rgba(12, 16, 23, 0.95); border: 1px solid rgba(0, 240, 255, 0.4); backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0,0,0,0.8);" class="p-4 rounded-lg text-slate-200 space-y-3">
                <h3 class="text-engine-cyan font-bold text-xs border-b border-slate-800 pb-2">// SELECT TARGET TETHER NODE</h3>
                <p class="text-[11px] text-slate-300">
                    Choose a target node to bind with <span class="text-emerald-400 font-bold">${sourceNode.id}</span>:
                </p>

                <div class="max-h-48 overflow-y-auto space-y-1 pr-1">
                    ${availableNodes.map(n => `
                        <div class="target-option p-2 rounded bg-slate-950 border border-slate-800 hover:border-engine-cyan cursor-pointer flex justify-between items-center text-xs" data-target-id="${n.id}">
                            <span class="text-slate-200">${n.id} - ${n.name || n.id}</span>
                            <span class="text-[9px] text-slate-500 font-mono">${n.type}</span>
                        </div>
                    `).join('')}
                </div>

                <div class="flex justify-end pt-2 border-t border-slate-800">
                    <button id="target-back" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1;" class="px-3 py-1.5 rounded text-xs cursor-pointer hover:bg-slate-700">Back</button>
                </div>
            </div>
        `;

        document.getElementById('target-back').onclick = () => this.renderWizardModal();

        modal.querySelectorAll('.target-option').forEach(el => {
            el.onclick = () => {
                const targetId = el.getAttribute('data-target-id');
                this.validateAndCreateTether(sourceNode.id, targetId);
            };
        });
    }

    validateAndCreateTether(srcId, tgtId) {
        if (!this.stagedModel.edges) this.stagedModel.edges = [];

        if (srcId === tgtId) {
            alert("Fault Check: A node cannot tether to itself.");
            return;
        }

        const exists = this.stagedModel.edges.some(
            e => (String(e.source) === String(srcId) && String(e.target) === String(tgtId)) ||
                (String(e.source) === String(tgtId) && String(e.target) === String(srcId))
        );
        if (exists) {
            alert("Fault Check: Active tether already exists between these two nodes.");
            return;
        }

        this.stagedModel.edges.push({
            source: srcId,
            target: tgtId,
            label: 'Guided Tether'
        });

        this.deck.applySyncedNodes(this.stagedModel.nodes, this.stagedModel.edges);
        if (window.limboController) {
            window.limboController.validateAndRefreshCommitButton();
        }

        this.currentIndex++;
        this.renderWizardModal();
    }

    finishGuidedSession(modal) {
        modal.innerHTML = `
            <div style="background: rgba(12, 16, 23, 0.95); border: 1px solid rgba(16, 185, 129, 0.4); backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0,0,0,0.8);" class="p-4 rounded-lg text-slate-200 space-y-3 font-mono">
                <h3 class="text-emerald-400 font-bold text-xs border-b border-slate-800 pb-2">// GUIDED SESSION COMPLETE</h3>
                <p class="text-[11px] text-slate-300">
                    All core and orbital nodes evaluated. Review validation gates in Auxiliary Subsystems and commit when ready.
                </p>
                <div class="flex justify-end pt-2">
                    <button id="wizard-close" style="background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.5); color: #34d399;" class="px-3 py-1.5 rounded text-xs font-bold hover:bg-emerald-950 cursor-pointer">
                        Close Assistant
                    </button>
                </div>
            </div>
        `;
        document.getElementById('wizard-close').onclick = () => modal.remove();
    }
}