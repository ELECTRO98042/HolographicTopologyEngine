import { DopplerShiftManager } from './doppler_shift_manager.js';

export class DopplerShiftOverlay {
    constructor(scene, referenceFrameManager, containerSelector = '#deck-body-content') {
        this.scene = scene;
        this.refManager = referenceFrameManager;
        this.container = typeof document !== 'undefined' ? document.querySelector(containerSelector) : null;
        this.active = false;
        this.manager = new DopplerShiftManager(scene, referenceFrameManager);
    }

    enable() {
        if (this.active) return;
        this.active = true;
        this.manager.setVisible(true);
        if (this.refManager && this.refManager.dopplerUniforms) {
            this.refManager.dopplerUniforms.uDopplerActive.value = 1;
        }
    }

    disable() {
        if (!this.active) return;
        this.active = false;
        this.manager.setVisible(false);
        if (this.refManager && this.refManager.dopplerUniforms) {
            this.refManager.dopplerUniforms.uDopplerActive.value = 0;
        }
    }

    setSubRenderEnabled(name, enabled) {
        this.manager.setSubRenderEnabled(name, enabled);
    }

    update(nodes, pairs, camera, time, intensity = 1.0, worldScale = 1.0) {
        if (!this.active) return;
        this.manager.update(nodes, pairs, camera, time, intensity, worldScale);
    }

    getTelemetry() {
        return this.manager.lastTelemetry;
    }

    dispose() {
        this.disable();
        this.manager.dispose();
    }
}