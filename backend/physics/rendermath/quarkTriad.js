/**
 * Quark Triad & Color Confinement Render Module
 * Physics: QCD non-Abelian gluon flux tubes, asymptotic freedom, 3-body orbit.
 */
import * as THREE from 'three';

export class QuarkTriadRenderer {
    constructor(group) {
        this.group = group;
        this.initLayers();
    }

    initLayers() {
        // Layer 1: Surface (Boiling obsidian-and-gold plasma bag)
        const bagGeo = new THREE.IcosahedronGeometry(2.0, 2);
        this.bagMat = new THREE.MeshBasicMaterial({ color: 0xff2244, wireframe: true, transparent: true, opacity: 0.15 });
        this.bag = new THREE.Mesh(bagGeo, this.bagMat);
        this.group.add(this.bag);

        // Layer 2: Sub-models (3 Valence Quarks R, G, B)
        this.quarks = [
            new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0xff2a55 })),
            new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0x00ff88 })),
            new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0x2288ff }))
        ];
        this.quarks.forEach(q => this.group.add(q));

        // Layer 3: Ghost Mesh / Gluon Flux Tubes
        const tubeGeo = new THREE.BufferGeometry();
        tubeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
        const tubeMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
        this.fluxLines = new THREE.LineSegments(tubeGeo, tubeMat);
        this.group.add(this.fluxLines);
    }

    update(time, delta, layerStates, distanceToCamera, palette, nodeCol) {
        if (nodeCol) {
            if (this.bagMat) this.bagMat.color.copy(nodeCol);
            if (this.fluxLines && this.fluxLines.material) this.fluxLines.material.color.copy(nodeCol);
            if (this.quarks) {
                this.quarks.forEach(q => q.material.color.copy(nodeCol));
            }
        }

        if (layerStates.subModels || layerStates.ghostMesh) {
            this.quarks.forEach((q, i) => {
                const a = time * 4.0 + (i * Math.PI * 2) / 3;
                const r = 1.0 + 0.3 * Math.sin(time * 6.0 + i);
                q.position.set(Math.cos(a) * r, Math.sin(a * 1.2) * (r * 0.8), Math.sin(a) * r);
            });

            const posAttr = this.fluxLines.geometry.attributes.position;
            const pairs = [[0, 1], [1, 2], [2, 0]];
            pairs.forEach(([aIdx, bIdx], pIdx) => {
                const qa = this.quarks[aIdx].position;
                const qb = this.quarks[bIdx].position;
                posAttr.setXYZ(pIdx * 2, qa.x, qa.y, qa.z);
                posAttr.setXYZ(pIdx * 2 + 1, qb.x, qb.y, qb.z);
            });
            posAttr.needsUpdate = true;
            this.fluxLines.visible = true;
        } else {
            this.fluxLines.visible = false;
        }

        if (layerStates.surfaceMesh) {
            this.bag.rotation.y = time * 1.5;
            this.bagMat.opacity = 0.1 + 0.08 * Math.sin(time * 5.0);
        }
    }
}
