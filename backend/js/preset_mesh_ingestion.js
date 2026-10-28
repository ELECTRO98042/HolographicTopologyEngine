// backend/js/preset_mesh_ingestion.js
/**
 * v2.7.8 Mesh Ingestion & Three.js 3D Grid Renderer
 * Ingests zero-copy Float32 WebSocket array streams and updates the CH-04
 * 6-layer spectral mesh visualization in real time.
 */

import * as THREE from 'three';

export class PresetMeshIngestionEngine {
    constructor(canvasElement, presetId) {
        this.canvas = canvasElement;
        this.presetId = presetId;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
        
        this.initScene();
        this.connectWebSocket();
    }

    initScene() {
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.camera.position.set(0, -5, 10);
        this.camera.lookAt(0, 0, 0);

        // Create 6-layer spectral grid planes
        this.layers = [];
        const geometry = new THREE.PlaneGeometry(6, 6, 32, 32);
        
        for (let i = 0; i < 6; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(i * 0.15, 0.8, 0.5),
                wireframe: true,
                transparent: true,
                opacity: 0.75
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.z = (i - 2.5) * 0.8;
            this.scene.add(mesh);
            this.layers.push(mesh);
        }

        this.animate();
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/telemetry/${this.presetId}`;
        this.socket = new WebSocket(wsUrl);

        this.socket.onmessage = (event) => {
            const telemetry = JSON.parse(event.data);
            this.updateMeshDeformations(telemetry.tensor_norms);
        };
    }

    updateMeshDeformations(norms) {
        if (!norms || norms.length !== 6) return;
        this.layers.forEach((layer, idx) => {
            const scaleFactor = 1.0 + (norms[idx] * 0.05);
            layer.scale.set(scaleFactor, scaleFactor, 1.0);
        });
    }

    animate = () => {
        requestAnimationFrame(this.animate);
        this.scene.rotation.z += 0.002;
        this.renderer.render(this.scene, this.camera);
    }
}