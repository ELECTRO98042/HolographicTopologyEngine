import { PreCommitValidator } from './preCommitValidator.js';
// backend/js/limboStateController.js
/**
 * Limbo State Controller
 * Manages the uncommitted staging state in the Freestyle Deck viewport.
 */
export class LimboStateController {
    constructor(deckViewport) {
        this.deck = deckViewport;
        this.isLimbo = false;
        this.stagedModel = null;
        this.initUI();
    }

    initUI() {
        // Create staging HUD banner overlay
        this.banner = document.createElement('div');
        this.banner.id = 'limbo-staging-banner';
        this.banner.style.display = 'none';
        this.banner.className = 'absolute top-4 left-1/2 transform -translate-x-1/2 bg-amber-950/90 border border-amber-500/50 text-amber-400 px-4 py-2 rounded font-mono text-xs z-50 flex items-center space-x-3 shadow-lg';
        this.banner.innerHTML = `
            <span>[MODE: STAGING LIMBO - UNCOMMITTED MODEL]</span>
            <button id="btn-commit-model" disabled class="bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/50 px-2 py-1 rounded text-[10px] font-bold disabled:opacity-40 disabled:cursor-not-allowed">
                COMMIT MODEL
            </button>
        `;
        document.body.appendChild(this.banner);
    }

    enterLimbo(sanitizedModel) {
        this.isLimbo = true;
        this.stagedModel = sanitizedModel;
        this.deck.isExternalSync = true; // Prevent outgoing sync broadcast to Main HUD
        this.banner.style.display = 'flex';

        // Render model locally on the deck only
        this.deck.applySyncedNodes(sanitizedModel.nodes, sanitizedModel.edges);

        this.promptTetherAssistant();
    }

    promptTetherAssistant() {
        const modal = document.createElement('div');
        modal.id = 'tether-prompt-modal';
        // Changed from full-screen center overlay to top-center anchored positioning
        modal.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 font-mono';
        modal.innerHTML = `
            <div class="bg-slate-900 border border-engine-cyan/40 p-5 rounded-lg max-w-md text-slate-200 space-y-3 shadow-2xl backdrop-blur-md bg-slate-900/95">
                <h3 class="text-engine-cyan font-bold text-sm border-b border-slate-800 pb-2">// NEW MODEL IMPORT DETECTED</h3>
                <p class="text-xs text-slate-300 leading-relaxed">
                    Model staging complete (${this.stagedModel.nodes.length} nodes, ${this.stagedModel.edges.length} edges). 
                    Would you like to initialize the Tether Assistant to establish a verified bound state?
                </p>
                <div class="flex justify-end space-x-2 pt-2">
                    <button id="btn-tether-no" class="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-400">
                        NO (Free-form Edit)
                    </button>
                    <button id="btn-tether-yes" class="px-3 py-1.5 rounded bg-engine-cyan/20 border border-engine-cyan/50 text-engine-cyan hover:bg-engine-cyan/30 text-xs font-bold">
                        YES (Guided Tethering)
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('btn-tether-yes').onclick = () => {
            modal.remove();
            if (window.tetherAssistant) window.tetherAssistant.startGuidedSession(this.stagedModel);
        };

        document.getElementById('btn-tether-no').onclick = () => {
            modal.remove();
            // User enters free-form edit mode in limbo state
        };
    }

    validateAndRefreshCommitButton() {
        if (!this.stagedModel) return;

        const validationResult = this.validator.validate(this.stagedModel);
        const violationsList = document.getElementById('limbo-violations-list');
        const commitBtn = document.getElementById('btn-commit-model');
        const statusText = document.getElementById('limbo-status-text');
        const banner = document.getElementById('import-limbo-banner');

        if (violationsList) {
            let html = '';
            html += `<div class="text-engine-cyan mb-1">🔗 Active Tethers Parsed: ${validationResult.edgeCount || (this.stagedModel.edges ? this.stagedModel.edges.length : 0)}</div>`;

            if (validationResult.violations.length > 0) {
                validationResult.violations.forEach(v => {
                    html += `<div class="text-engine-red">✖ [${v.code}] ${v.message}</div>`;
                });
            }

            if (validationResult.warnings.length > 0) {
                validationResult.warnings.forEach(w => {
                    html += `<div class="text-amber-400">⚠️ ${w}</div>`;
                });
            }

            if (validationResult.isValid && validationResult.warnings.length === 0) {
                html += `<div class="text-emerald-400 font-bold">✔ All structural and physical gates passed successfully.</div>`;
            }

            violationsList.innerHTML = html;
        }

        if (statusText) {
            statusText.textContent = validationResult.isValid ? "Model Ready for Commit" : "Model Contains Structural Tensions";
        }

        if (commitBtn) {
            commitBtn.disabled = !validationResult.isValid;
        }

        // --- NOTE 4: LIVE LIMBO BANNER STATUS UPDATE ---
        if (banner) {
            if (validationResult.isValid && validationResult.warnings.length === 0) {
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
    }

    enterLimbo(sanitizedModel) {
        this.isLimbo = true;
        this.stagedModel = sanitizedModel;
        this.deck.isExternalSync = true;

        // 1. Position Import Banner cleanly at TOP CENTER of the entire viewport window
        let banner = document.getElementById('import-limbo-banner') || document.getElementById('import-prompt-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'import-limbo-banner';
            banner.style.cssText = "position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 99999; background: rgba(12, 16, 23, 0.95); border: 1px solid rgba(0, 240, 255, 0.6); padding: 12px 24px; border-radius: 8px; font-family: monospace; font-size: 11px; color: #00f0ff; backdrop-filter: blur(16px); box-shadow: 0 10px 30px rgba(0,0,0,0.8); text-align: center; pointer-events: auto;";
            document.body.appendChild(banner);
        }
        banner.innerHTML = `
            <div class="font-bold text-amber-400 mb-1 tracking-wider text-xs">⚡ LIMBO MODE ACTIVATED</div>
            <div class="text-slate-300 text-[11px]">Model staged (${sanitizedModel.nodes.length} nodes, ${sanitizedModel.edges?.length || 0} edges). Review validation gates or launch Tether Assistant.</div>
        `;
        banner.style.display = 'block';

        // 2. Reveal Auxiliary Staging Limbo Panel
        const limboPanel = document.getElementById('limbo-staging-panel');
        if (limboPanel) limboPanel.style.display = 'block';

        // 3. Render model in viewport
        this.deck.applySyncedNodes(sanitizedModel.nodes, sanitizedModel.edges || sanitizedModel.connections || []);

        // 4. Run validation and update telemetry UI
        this.validateAndRefreshCommitButton();
    }

    validateAndRefreshCommitButton() {
        if (!this.isLimbo || !this.stagedModel) return;

        const validator = new PreCommitValidator();
        const result = validator.validate(this.stagedModel);

        const statusText = document.getElementById('limbo-status-text');
        const violationsList = document.getElementById('limbo-violations-list');
        const commitBtn = document.getElementById('btn-commit-model');

        if (statusText) {
            statusText.textContent = result.isValid ? 'Model Ready for Commit' : `${result.violations.length} Violation(s) Detected`;
            statusText.className = result.isValid ? 'text-emerald-400 font-semibold' : 'text-amber-300 font-semibold';
        }

        if (violationsList) {
            if (result.isValid && result.warnings.length === 0) {
                violationsList.innerHTML = `<div class="text-emerald-400">✔ All physics and tether gates passed.</div>`;
            } else {
                const items = [
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
                commitBtn.onclick = () => this.exitLimboAndCommit();
            } else {
                commitBtn.setAttribute('disabled', 'true');
                commitBtn.className = 'flex-1 py-1 rounded bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold opacity-40 cursor-not-allowed';
                commitBtn.onclick = null;
            }
        }

        // Wire wizard launcher button
        const wizardBtn = document.getElementById('btn-launch-wizard');
        if (wizardBtn) {
            wizardBtn.onclick = () => {
                if (window.tetherAssistant) window.tetherAssistant.startGuidedSession(this.stagedModel);
            };
        }
    }
    commitModel() {
        if (!this.stagedModel) return;

        // Translate and format payload strictly for Main HUD consumption
        const hudPayload = ImportSanityNormalizer.formatForMainHUD(this.stagedModel);

        // 1. Broadcast via BroadcastChannel
        const deckSyncChannel = new BroadcastChannel('holographic_sync_channel');
        deckSyncChannel.postMessage(hudPayload);

        // 2. Persist to localStorage for cross-window sync pickup
        localStorage.setItem('holographic_latest_sync', JSON.stringify(hudPayload));

        console.log("[LIMBO] Model successfully committed and formatted for Main HUD:", hudPayload);

        // Dismiss Limbo UI
        this.exitLimbo();
    }

    exitLimboAndCommit() {
        if (!this.isLimbo) return;
        this.isLimbo = false;
        this.deck.isExternalSync = false;

        const limboPanel = document.getElementById('limbo-staging-panel');
        if (limboPanel) limboPanel.style.display = 'none';

        // Broadcast finalized model to Main HUD
        this.deck.syncToMainHUD();
        console.log("[LIMBO] Model successfully committed and synced to Main HUD.");
    }
}