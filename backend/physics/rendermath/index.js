import { ElectronRenderer } from './electron.js';
import { PhotonRenderer } from './photon.js';
import { QuarkTriadRenderer } from './quarkTriad.js';
import { HiggsCondensateRenderer } from './higgsCondensate.js';
import { NeutrinoRenderer } from './neutrino.js';
import { EntanglementRenderer } from './entanglement.js';
import { VacuumFluctuationsRenderer } from './vacuumFluctuations.js';
import { GravitonRenderer } from './graviton.js';

export class SubatomicNodeFactory {
    constructor() {
        this.renderers = {
            'ELECTRON_DIRAC': ElectronRenderer,
            'PHOTON_BOSON': PhotonRenderer,
            'QUARK_TRIAD': QuarkTriadRenderer,
            'HIGGS_CONDENSATE': HiggsCondensateRenderer,
            'NEUTRINO_FLAVOR': NeutrinoRenderer,
            'ENTANGLEMENT_PAIR': EntanglementRenderer,
            'VACUUM_FOAM': VacuumFluctuationsRenderer,
            'GRAVITON_TENSOR': GravitonRenderer
        };
    }

    attachRenderer(group, qftType) {
        const RendererClass = this.renderers[qftType];
        if (RendererClass) {
            group.userData.mathRenderer = new RendererClass(group);
        } else {
            group.userData.mathRenderer = new ElectronRenderer(group);
        }
    }

    updateNode(group, time, delta, layerStates, distanceToCamera, palette, nodeCol) {
        if (nodeCol && this.mat) { // (or appropriate material reference)
            this.mat.color.copy(nodeCol);
        }
        if (group.userData.mathRenderer && typeof group.userData.mathRenderer.update === 'function') {
            group.userData.mathRenderer.update(time, delta, layerStates, distanceToCamera, palette, nodeCol);
        }
    }
}