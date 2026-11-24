import { PreCommitValidator } from './preCommitValidator.js';
import { ImportSanityNormalizer } from './importSanityNormalizer.js';

/**
 * Limbo State Controller
 * Manages the uncommitted staging state in the Freestyle Deck viewport.
 */
export class LimboStateController {
    constructor(deckViewport) {
        this.deck = deckViewport;
        this.validator = new PreCommitValidator();
        this.isLimbo = false;
        this.stagedModel = null;
        this.initUI();
    }

    initUI() {
        const existingBanner = document.getElementById('limbo-staging-banner');
        if (existingBanner) existingBanner.remove();

        this.banner = document.createElement('div');
        this.banner.id = 'limbo-staging-banner';
        this.banner.style.display = 'none';
        this.banner.className = 'absolute top-4 left-1/2 transform -translate-x-1/2 bg-amber-950/90 border border-amber-500/50 text-amber-400 px-4 py-2 rounded font-mono text-xs z-50 flex items-center space-x-3 shadow-lg';
        this.banner.innerHTML = `
            <span>[MODE: STAGING LIMBO - UNCOMMITTED MODEL]</span>
            <button id="btn-banner-commit-model" disabled class="bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/50 px-2 py-1 rounded text-[10px] font-bold disabled:opacity-40 disabled:cursor-not-allowed">
                COMMIT MODEL
            </button>
        `;
        document.body.appendChild(this.banner);
    }

    enterLimbo(sanitizedModel) {
        this.isLimbo = true;
        this.stagedModel = sanitizedModel;
        if (this.deck) {
            this.deck.isExternalSync = true;
        }

        let banner = document.getElementById('import-limbo-banner') || document.getElementById('import-prompt-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'import-limbo-banner';
            banner.style.cssText = "position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 99999; background: rgba(12, 16, 23, 0.95); border: 1px solid rgba(0, 240, 255, 0.6); padding: 12px 24px; border-radius: 8px; font-family: monospace; font-size: 11px; color: #00f0ff; backdrop-filter: blur(16px); box-shadow: 0 10px 30px rgba(0,0,0,0.8); text-align: center; pointer-events: auto;";
            document.body.appendChild(banner);
        }
        banner.innerHTML = `
            <div class="font-bold text-amber-400 mb-1 tracking-wider text-xs">⚡ LIMBO MODE ACTIVATED</div>
            <div class="text-slate-300 text-[11px]">Model staged (${sanitizedModel.nodes?.length || 0} nodes, ${sanitizedModel.edges?.length || 0} edges). Review validation gates or launch Tether Assistant.</div>
        `;
        banner.style.display = 'block';

        const limboPanel = document.getElementById('limbo-staging-panel');
        if (limboPanel) limboPanel.style.display = 'block';

        if (this.deck && typeof this.deck.applySyncedNodes === 'function') {
            this.deck.applySyncedNodes(
                sanitizedModel.nodes || [],
                sanitizedModel.edges || sanitizedModel.connections || []
            );
        }

        this.validateAndRefreshCommitButton();
    }

    validateAndRefreshCommitButton() {
        if (!this.isLimbo || !this.stagedModel) return;

        const result = this.validator.validate(this.stagedModel);

        const statusText = document.getElementById('limbo-status-text');
        const violationsList = document.getElementById('limbo-violations-list');
        const commitBtn = document.getElementById('btn-commit-model');
        const banner = document.getElementById('import-limbo-banner');

        if (statusText) {
            statusText.textContent = result.isValid ? 'Model Ready for Commit' : `${result.violations.length} Violation(s) Detected`;
            statusText.className = result.isValid ? 'text-emerald-400 font-semibold' : 'text-amber-300 font-semibold';
        }

        if (violationsList) {
            if (result.isValid && result.warnings.length === 0) {
                violationsList.innerHTML = `<div class="text-emerald-400">✔ All physics and tether gates passed.</div>`;
            } else {
                const items = [
                    `<div class="text-engine-cyan mb-1">🔗 Active Tethers Parsed: ${result.edgeCount || (this.stagedModel.edges ? this.stagedModel.edges.length : 0)}</div>`,
                    ...result.violations.map(v => `<div class="text-engine-red">✖ [${v.code}] ${v.message}</div>`),
                    ...result.warnings.map(w => `<div class="text-amber-400">⚠️ ${w}</div>`)
                ];
                violationsList.innerHTML = items.join('');
            }
        }

        if (commitBtn) {
            if (result.isValid) {
                commitBtn.removeAttribute('disabled');
                commitBtn.className = 'flex-1 py-1 rounded bg-emerald-600 border border-emerald-500 text-white font-bold shadow hover:bg-emerald-500 cursor-pointer';
                commitBtn.onclick = () => this.commitModel();
            } else {
                commitBtn.setAttribute('disabled', 'true');
                commitBtn.className = 'flex-1 py-1 rounded bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold opacity-40 cursor-not-allowed';
                commitBtn.onclick = null;
            }
        }

        if (banner) {
            if (result.isValid && result.warnings.length === 0) {
                banner.style.borderColor = 'rgba(16, 185, 129, 0.6)';
                banner.innerHTML = `
                    <div class="font-bold text-emerald-400 mb-0.5 tracking-wider">✔ MODEL APPROVED — Safe to Commit</div>
                    <div class="text-slate-300 text-[10px]">Model is topologically sound and ready to commit as-is, or modify further if desired.</div>
                `;
            } else {
                banner.style.borderColor = 'rgba(0, 240, 255, 0.5)';
                banner.innerHTML = `
                    <div class="font-bold text-amber-400 mb-0.5">⚡ LIMBO MODE ACTIVATED</div>
                    <div class="text-slate-300">Model staged. Review validation gates & configure tethers before commit.</div>
                `;
            }
        }

        const wizardBtn = document.getElementById('btn-launch-wizard');
        if (wizardBtn) {
            wizardBtn.onclick = () => {
                if (window.tetherAssistant && this.stagedModel) {
                    window.tetherAssistant.startGuidedSession(this.stagedModel);
                }
            };
        }
    }

    commitModel() {
        if (!this.stagedModel) return;

        // Sync latest viewport positions/edges back into stagedModel before formatting
        if (this.deck && Array.isArray(this.deck.nodes) && this.deck.nodes.length > 0) {
            this.stagedModel.nodes = this.deck.nodes.map((n, idx) => {
                const existing = (this.stagedModel.nodes || []).find(sn => sn.id === n.data?.id) || {};
                const pos = n.mesh ? n.mesh.position : (n.position || {});
                return {
                    ...existing,
                    id: n.data?.id || existing.id || `Q-${String(idx + 1).padStart(3, '0')}`,
                    name: n.data?.name || existing.name || `Node-${idx + 1}`,
                    type: n.data?.type || existing.type || 'TOPOLOGY',
                    x: Number((pos.x ?? existing.x ?? 0).toFixed(4)),
                    y: Number((pos.y ?? existing.y ?? 0).toFixed(4)),
                    z: Number((pos.z ?? existing.z ?? 0).toFixed(4)),
                    color: n.mesh?.material?.color
                        ? '#' + n.mesh.material.color.getHexString()
                        : (existing.color || '#00ffcc'),
                    attrs: existing.attrs || n.data?.attrs || {}
                };
            });

            if (Array.isArray(this.deck.connections)) {
                this.stagedModel.edges = this.deck.connections.map((c, idx) => ({
                    index: idx,
                    source: String(c.nodeA?.data?.id || c.nodeA?.id || ''),
                    target: String(c.nodeB?.data?.id || c.nodeB?.id || ''),
                    label: 'Commit Tether'
                }));
            }
        }

        const hudPayload = ImportSanityNormalizer.formatForMainHUD(this.stagedModel);

        const deckSyncChannel = new BroadcastChannel('holographic_sync_channel');
        localStorage.setItem('holographic_latest_sync', JSON.stringify(hudPayload));
        deckSyncChannel.postMessage(hudPayload);
        deckSyncChannel.close();

        this.isLimbo = false;
        if (this.deck) {
            this.deck.isExternalSync = false;
        }

        const limboPanel = document.getElementById('limbo-staging-panel');
        if (limboPanel) limboPanel.style.display = 'none';
        const banner = document.getElementById('import-limbo-banner');
        if (banner) banner.style.display = 'none';
        if (this.banner) this.banner.style.display = 'none';

        console.log("[LIMBO] Model committed and formatted for Main HUD:", hudPayload);
    }
}