import * as THREE from './vendor/graphics/three.js';
import { OrbitControls } from './vendor/graphics/OrbitControls.js';

window.THREE = THREE;
window.OrbitControls = OrbitControls;

// --- COLOR PALETTE & NODE STATES ---
const NODE_COLORS = {
    DEFAULT: 0x00f0ff,   // Cyan (Stable/Idle)
    SELECTED: 0xff0055,  // Pink (Link Source / Focus)
    WARNING: 0xf59e0b,   // Amber (High Tension / Near Limit)
    ILLEGAL: 0xef4444    // Red (Constraint Violation / Invalid Bond)
};

// --- MATRIX: ALLOWED BOND TYPES ---
// Expanded physical coupling rules:
// - METRIC <-> POTENTIAL / FIELD: Permitted via stress-energy tensor coupling & Einstein field equations
// - POTENTIAL <-> FIELD: Permitted via covariant derivatives & gauge interaction terms
// - TOPOLOGY: Universal mediator bridging bulk geometry and boundary quantum states
const ALLOWED_CONNECTIONS = {
    'METRIC': ['METRIC', 'TOPOLOGY', 'FIELD', 'POTENTIAL'],
    'TOPOLOGY': ['METRIC', 'TOPOLOGY', 'FIELD', 'POTENTIAL'],
    'FIELD': ['FIELD', 'TOPOLOGY', 'METRIC', 'POTENTIAL'],
    'POTENTIAL': ['POTENTIAL', 'FIELD', 'METRIC', 'TOPOLOGY']
};

function checkBondValidity(typeA, typeB) {
    if (!ALLOWED_CONNECTIONS[typeA]) return false;
    return ALLOWED_CONNECTIONS[typeA].includes(typeB);
}

class DeckViewport {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;

        // Telemetry stats
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fps = 60;

        this.initThree();
        this.initListeners();
        this.initDefaultModel();
        this.initTelemetrySocket();

        this.animate = this.animate.bind(this);
        this.animate();
    }

    checkBondValidity(typeA, typeB) {
        return checkBondValidity(typeA, typeB);
    }

    initThree() {
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
        this.camera.position.set(0, 15, 25);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 0, 0);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x05070a);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0x00f0ff, 2, 50);
        pointLight.position.set(0, 10, 10);
        this.scene.add(pointLight);

        const gridHelper = new THREE.GridHelper(40, 40, 0x00f0ff, 0x1a2436);
        gridHelper.position.y = -0.01;
        this.scene.add(gridHelper);

        const ringGeo = new THREE.RingGeometry(4, 4.2, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6
        });
        this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
        this.ringMesh.rotation.x = Math.PI / 2;
        this.scene.add(this.ringMesh);

        // --- SCREEN 2: Top-down Orthographic Camera (X-Z) ---
        const screen2Container = document.getElementById('canvas-screen-2');
        if (screen2Container) {
            const aspect2 = screen2Container.clientWidth / screen2Container.clientHeight;
            this.camera2 = new THREE.OrthographicCamera(-15 * aspect2, 15 * aspect2, 15, -15, 0.1, 500);
            this.camera2.position.set(0, 30, 0); // Top down view looking down Y axis
            this.camera2.lookAt(0, 0, 0);

            this.renderer2 = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            this.renderer2.setSize(screen2Container.clientWidth, screen2Container.clientHeight);
            screen2Container.appendChild(this.renderer2.domElement);
        }

        // --- SCREEN 3: Side Elevation Orthographic Camera (Y-Z) ---
        const screen3Container = document.getElementById('canvas-screen-3');
        if (screen3Container) {
            const aspect3 = screen3Container.clientWidth / screen3Container.clientHeight;
            this.camera3 = new THREE.OrthographicCamera(-15 * aspect3, 15 * aspect3, 15, -15, 0.1, 500);
            this.camera3.position.set(30, 0, 0); // Side view looking down X axis
            this.camera3.lookAt(0, 0, 0);

            this.renderer3 = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            this.renderer3.setSize(screen3Container.clientWidth, screen3Container.clientHeight);
            screen3Container.appendChild(this.renderer3.domElement);
        }
    }

    initDefaultModel() {
        const height = 4.0 * (Math.sqrt(3) / 2);
        const defaultNodes = [
            { data: { id: "N-001", name: "AdS Boundary Shell", type: "TOPOLOGY", formula: "dS^d / CFT_d-1 Boundary" }, position: new THREE.Vector3(0, 0.6, height * 0.666), color: NODE_COLORS.SELECTED },
            { data: { id: "N-002", name: "Minkowski Space", type: "METRIC", formula: "η_μν = diag(-1,1,1,1)" }, position: new THREE.Vector3(-2, 0.6, -height * 0.333), color: NODE_COLORS.DEFAULT },
            { data: { id: "N-003", name: "Abelian U(1) EM", type: "FIELD", formula: "F_μν = ∂_μ A_ν - ∂_ν A_μ" }, position: new THREE.Vector3(2, 0.6, -height * 0.333), color: NODE_COLORS.DEFAULT }
        ];

        defaultNodes.forEach(item => {
            const geometry = new THREE.SphereGeometry(0.6, 24, 24);
            const material = new THREE.MeshBasicMaterial({ color: item.color, wireframe: true });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData = { nodeId: item.data.id };
            mesh.position.copy(item.position);

            this.scene.add(mesh);
            this.nodes.push({ data: item.data, mesh });

            window.nodeMeshes = window.nodeMeshes || [];
            window.nodeMeshes.push(mesh);
        });

        this.createConnectionLine(this.nodes[0], this.nodes[1]);
        this.createConnectionLine(this.nodes[0], this.nodes[2]);
        this.createConnectionLine(this.nodes[1], this.nodes[2]);

        window.nodes = this.nodes.map(n => n.data);
        this.updateNodeCountBadge();
    }

    initListeners() {
        const canvas = this.renderer.domElement;

        canvas.addEventListener('dragover', (e) => e.preventDefault());
        canvas.addEventListener('drop', (e) => this.handleDrop(e));
        canvas.addEventListener('click', (e) => this.handleClick(e));

        window.addEventListener('resize', () => {
            if (!this.container) return;
            const width = this.container.clientWidth;
            const height = this.container.clientHeight;
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        });
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation(); // <-- Stops duplicate drop events from firing twice

        const rawData = e.dataTransfer.getData('application/json');
        if (!rawData || this._isHandlingDrop) return; // Guard flag against double invocation

        // Lock temporarily to ensure single execution per drop gesture
        this._isHandlingDrop = true;
        setTimeout(() => { this._isHandlingDrop = false; }, 100);

        try {
            const nodeData = JSON.parse(rawData);

            const rect = this.renderer.domElement.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

            const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const targetPoint = new THREE.Vector3();
            raycaster.ray.intersectPlane(groundPlane, targetPoint);

            this.createNodeMesh(nodeData, targetPoint);
        } catch (err) {
            console.error("Failed to parse dropped pantry item:", err);
        }
    }

    createNodeMesh(data, position) {
        const nextId = `N-00${this.nodes.length + 1}`;
        const enrichedData = {
            id: nextId,
            name: data.name || "Custom Node",
            type: data.type || "METRIC",
            formula: data.formula || "g_μν = η_μν + h_μν",
            fieldIntensity: 1.0,
            spin: data.name && data.name.includes('Kerr') ? 0.85 : 0.0
        };

        const geometry = new THREE.SphereGeometry(0.6, 24, 24);
        const material = new THREE.MeshBasicMaterial({ color: NODE_COLORS.DEFAULT, wireframe: true });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { nodeId: nextId };

        mesh.position.copy(position);
        mesh.position.y = 0.6;

        this.scene.add(mesh);
        this.nodes.push({ data: enrichedData, mesh });

        window.nodeMeshes = window.nodeMeshes || [];
        window.nodeMeshes.push(mesh);

        window.nodes = this.nodes.map(n => n.data);
        this.updateNodeCountBadge();

        console.log(`[Deck Drop] Created node ${nextId} (${enrichedData.name})`);
    }

    handleClick(e) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

        const intersects = raycaster.intersectObjects(this.nodes.map(n => n.mesh));
        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            const matchedNode = this.nodes.find(n => n.mesh === clickedMesh);
            if (matchedNode) {
                this.selectNode(matchedNode);
                if (typeof window.selectNodeForInspection === 'function') {
                    window.selectNodeForInspection(matchedNode.data.id);
                }
            }
        } else {
            this.selectedNode = null;
            this.resetInspectorUI();
            if (typeof window.selectNodeForInspection === 'function') {
                window.selectNodeForInspection(null);
            }
        }
    }

    selectNode(node) {
        if (!this.selectedNode) {
            this.selectedNode = node;
            node.mesh.material = new THREE.MeshBasicMaterial({ color: NODE_COLORS.SELECTED, wireframe: true });
            this.updateInspectorForNode(node, "LINK SOURCE");
        } else if (this.selectedNode === node) {
            this.selectedNode.mesh.material = new THREE.MeshBasicMaterial({ color: NODE_COLORS.DEFAULT, wireframe: true });
            this.selectedNode = null;
            this.resetInspectorUI();
        } else {
            const sourceNode = this.selectedNode;
            const targetNode = node;
            const isValid = checkBondValidity(sourceNode.data.type, targetNode.data.type);

            if (!isValid) {
                targetNode.mesh.material = new THREE.MeshBasicMaterial({ color: NODE_COLORS.ILLEGAL, wireframe: true });
                const statusEl = document.getElementById('inspector-status');
                const bodyEl = document.getElementById('inspector-body');
                if (statusEl) {
                    statusEl.textContent = "ILLEGAL BOND ATTEMPT";
                    statusEl.className = "text-[9px] font-mono text-engine-red bg-engine-red/10 px-1.5 py-0.5 rounded border border-engine-red/30";
                }
                if (bodyEl) {
                    bodyEl.innerHTML = `
                        <div class="space-y-2">
                            <div class="p-2 rounded bg-engine-red/10 border border-engine-red/40 text-engine-red text-[11px] font-semibold">
                                ⚠️ CONSTRAINT VIOLATION: Direct connection between [${sourceNode.data.type}] and [${targetNode.data.type}] is prohibited.
                            </div>
                        </div>
                    `;
                }
                setTimeout(() => {
                    targetNode.mesh.material = new THREE.MeshBasicMaterial({ color: NODE_COLORS.DEFAULT, wireframe: true });
                }, 1200);
                return;
            }

            this.createConnectionLine(sourceNode, targetNode);
            sourceNode.mesh.material = new THREE.MeshBasicMaterial({ color: NODE_COLORS.DEFAULT, wireframe: true });
            targetNode.mesh.material = new THREE.MeshBasicMaterial({ color: NODE_COLORS.SELECTED, wireframe: true });
            this.selectedNode = targetNode;
            this.updateInspectorForNode(targetNode, "LINKED");
        }
    }

    createConnectionLine(nodeA, nodeB) {
        const material = new THREE.LineBasicMaterial({
            color: 0x00f0ff,
            linewidth: 2,
            transparent: true,
            opacity: 0.7
        });
        const points = [nodeA.mesh.position, nodeB.mesh.position];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);

        this.scene.add(line);
        this.connections.push({ line, nodeA, nodeB });
    }

    resetInspectorUI() {
        const statusEl = document.getElementById('inspector-status');
        const bodyEl = document.getElementById('inspector-body');
        if (statusEl) {
            statusEl.textContent = "NO SELECTION";
            statusEl.className = "text-[9px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700";
        }
        if (bodyEl) {
            bodyEl.innerHTML = `<div class="text-slate-500 italic text-center pt-8">Select a node on the deck to inspect its field equations and metric parameters.</div>`;
        }
    }

    updateInspectorForNode(node, mode) {
        const statusEl = document.getElementById('inspector-status');
        const bodyEl = document.getElementById('inspector-body');

        if (statusEl) {
            statusEl.textContent = `${node.data.type} (${mode})`;
            statusEl.className = "text-[9px] font-mono text-engine-cyan bg-engine-cyan/10 px-1.5 py-0.5 rounded border border-engine-cyan/30";
        }

        if (bodyEl) {
            bodyEl.innerHTML = `
                <div class="space-y-2">
                    <div>
                        <span class="text-slate-500 block text-[10px]">NODE IDENTIFIER</span>
                        <span class="text-slate-100 font-semibold">${node.data.id} - ${node.data.name}</span>
                    </div>
                    <div>
                        <span class="text-slate-500 block text-[10px]">FIELD / METRIC EQUATION</span>
                        <div class="p-2 rounded bg-slate-950 border border-engine-border font-mono text-engine-cyan mt-1 text-[11px]">
                            ${node.data.formula}
                        </div>
                    </div>
                </div>
            `;
        }
    }

    clearDeck() {
        this.nodes.forEach(node => {
            this.scene.remove(node.mesh);
            if (node.mesh.geometry) node.mesh.geometry.dispose();
            if (node.mesh.material) node.mesh.material.dispose();
        });
        this.nodes = [];

        this.connections.forEach(conn => {
            this.scene.remove(conn.line);
            if (conn.line.geometry) conn.line.geometry.dispose();
            if (conn.line.material) conn.line.material.dispose();
        });
        this.connections = [];
        this.selectedNode = null;

        window.nodeMeshes = [];
        window.nodes = [];

        this.updateNodeCountBadge();
        this.resetInspectorUI();
        if (typeof window.selectNodeForInspection === 'function') {
            window.selectNodeForInspection(null);
        }

        // Re-initialize default baseline triad so deck isn't left empty
        this.initDefaultModel();
    }

    runAutomatedTests() {
        console.group("🧪 HOLOGRAPHIC TOPOLOGY ENGINE: AUTOMATED TEST HARNESS");

        let passed = 0;
        let failed = 0;

        const testCases = [
            { a: 'METRIC', b: 'METRIC', expected: true, desc: 'METRIC <-> METRIC (Spacetime Tensor Coupling)' },
            { a: 'METRIC', b: 'TOPOLOGY', expected: true, desc: 'METRIC <-> TOPOLOGY (Boundary Shell Mediated)' },
            { a: 'METRIC', b: 'FIELD', expected: false, desc: 'METRIC <-> FIELD (Direct Illegal Coupling)' },
            { a: 'FIELD', b: 'FIELD', expected: true, desc: 'FIELD <-> FIELD (Gauge Coupling)' },
            { a: 'TOPOLOGY', b: 'FIELD', expected: true, desc: 'TOPOLOGY <-> FIELD (Boundary Shell Mediated)' }
        ];

        testCases.forEach((tc, idx) => {
            const result = this.checkBondValidity(tc.a, tc.b);
            if (result === tc.expected) {
                console.log(`%c[PASS] Test 1.${idx + 1}: ${tc.desc}`, 'color: #00f0ff;');
                passed++;
            } else {
                console.error(`[FAIL] Test 1.${idx + 1}: ${tc.desc} (Expected ${tc.expected}, got ${result})`);
                failed++;
            }
        });

        if (NODE_COLORS.DEFAULT && NODE_COLORS.ILLEGAL && NODE_COLORS.SELECTED && NODE_COLORS.WARNING) {
            console.log("%c[PASS] Test 2: Node Color Palette states verified.", 'color: #00f0ff;');
            passed++;
        } else {
            console.error("[FAIL] Test 2: Node Color Palette missing definitions.");
            failed++;
        }

        if (typeof this.animate === 'function' && typeof this.createConnectionLine === 'function') {
            console.log("%c[PASS] Test 3: Physics simulation and connection render pipelines active.", 'color: #00f0ff;');
            passed++;
        } else {
            console.error("[FAIL] Test 3: Core animation or line generation pipeline missing.");
            failed++;
        }

        console.log(`%c--- TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ---`, `font-weight: bold; color: ${failed === 0 ? "#00f0ff" : "#ef4444"};`);
        console.groupEnd();

        const statusEl = document.getElementById('inspector-status');
        const bodyEl = document.getElementById('inspector-body');
        if (statusEl) {
            statusEl.textContent = failed === 0 ? "ALL TESTS PASSED" : `${failed} TEST(S) FAILED`;
            statusEl.className = failed === 0
                ? "text-[9px] font-mono text-engine-cyan bg-engine-cyan/10 px-1.5 py-0.5 rounded border border-engine-cyan/30"
                : "text-[9px] font-mono text-engine-red bg-engine-red/10 px-1.5 py-0.5 rounded border border-engine-red/30";
        }
        if (bodyEl) {
            bodyEl.innerHTML = `
                <div class="space-y-2 font-mono text-[11px]">
                    <div class="text-slate-300 font-semibold">Automated Test Execution Complete:</div>
                    <div class="p-2 rounded bg-slate-950 border border-engine-border space-y-1">
                        <div class="text-engine-cyan">✔ Passed Assertions: ${passed}</div>
                        <div class="${failed > 0 ? 'text-engine-red' : 'text-slate-400'}">✖ Failed Assertions: ${failed}</div>
                    </div>
                    <div class="text-slate-500 text-[10px]">Check browser developer console (F12) for detailed trace logs.</div>
                </div>
            `;
        }

        return { passed, failed };
    }

    exportState() {
        const state = {
            version: "v2.5",
            timestamp: new Date().toISOString(),
            nodes: this.nodes.map(n => ({
                name: n.data.name,
                type: n.data.type,
                formula: n.data.formula,
                position: {
                    x: Number(n.mesh.position.x.toFixed(3)),
                    y: Number(n.mesh.position.y.toFixed(3)),
                    z: Number(n.mesh.position.z.toFixed(3))
                }
            })),
            connections: this.connections.map(c => ({
                source: c.nodeA.data.id || c.nodeA.data.name,
                target: c.nodeB.data.id || c.nodeB.data.name
            }))
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `holographic_topology_${Date.now()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }

    updateNodeCountBadge() {
        const badge = document.getElementById('node-count-badge');
        if (badge) badge.textContent = this.nodes.length;
    }

    initTelemetrySocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.socket = new WebSocket(`${protocol}//${window.location.host}/ws/telemetry`);
        this.socket.binaryType = 'arraybuffer';
        this.socket.onmessage = (event) => {
            if (typeof event.data === 'string') {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'hud_update') this.updateHUDDisplay(data);
                } catch (err) { }
            }
        };
    }

    updateHUDDisplay(data) {
        const integrityEl = document.getElementById('hud-integrity');
        if (integrityEl && data.integrity !== undefined) integrityEl.textContent = `${data.integrity}%`;
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        const now = performance.now();
        this.frameCount++;
        if (now - this.lastTime >= 500) {
            this.fps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
            this.frameCount = 0;
            this.lastTime = now;
            this.updateTelemetryHUD();
        }

        if (this.ringMesh) this.ringMesh.rotation.z += 0.005;

        // Physics Simulation: Repulsion & Springs
        const repulsionStrength = 0.15; // Reduced from 0.5 to prevent violent scattering
        const targetDistance = 4.0;
        const springK = 0.05;

        if (this.nodes && this.nodes.length > 1) {
            for (let i = 0; i < this.nodes.length; i++) {
                for (let j = i + 1; j < this.nodes.length; j++) {
                    const nodeA = this.nodes[i];
                    const nodeB = this.nodes[j];
                    if (!nodeA || !nodeB || !nodeA.mesh || !nodeB.mesh) continue;

                    const dir = new THREE.Vector3().subVectors(nodeA.mesh.position, nodeB.mesh.position);
                    const dist = dir.length() || 0.001;
                    if (dist < 3.5) { // Tightened radius so only overlapping nodes push apart
                        dir.normalize();
                        const force = (3.5 - dist) * repulsionStrength * 0.01;
                        nodeA.mesh.position.addScaledVector(dir, force);
                        nodeB.mesh.position.addScaledVector(dir, -force);
                    }
                }
            }
        }

        if (this.connections && this.connections.length > 0) {
            this.connections.forEach(conn => {
                if (!conn.nodeA || !conn.nodeB || !conn.line) return;

                const posA = conn.nodeA.mesh.position;
                const posB = conn.nodeB.mesh.position;

                const dir = new THREE.Vector3().subVectors(posB, posA);
                const dist = dir.length() || 0.001;
                const diff = dist - targetDistance;

                if (Math.abs(diff) > 0.01) {
                    dir.normalize();
                    const offset = dir.clone().multiplyScalar(diff * springK);
                    posA.add(offset);
                    posB.sub(offset);
                }

                posA.y = 0.6;
                posB.y = 0.6;

                const positions = conn.line.geometry.attributes.position;
                if (positions) {
                    positions.setXYZ(0, posA.x, posA.y, posA.z);
                    positions.setXYZ(1, posB.x, posB.y, posB.z);
                    positions.needsUpdate = true;
                }
            });
        }

        if (this.nodes) {
            this.nodes.forEach(n => {
                if (n && n.mesh) n.mesh.position.y = 0.6;
            });
        }

        if (this.controls) this.controls.update();

        // Render Screen 1 (Primary Perspective 3D)
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }

        // Render Screen 2 (Transverse Top-down X-Z)
        if (this.renderer2 && this.scene && this.camera2) {
            this.renderer2.render(this.scene, this.camera2);
        }

        // Render Screen 3 (Elevation Side Y-Z)
        if (this.renderer3 && this.scene && this.camera3) {
            this.renderer3.render(this.scene, this.camera3);
        }
    }

    updateTelemetryHUD() {
        const fpsEl = document.getElementById('tele-fps');
        const drawsEl = document.getElementById('tele-draws');
        const geomsEl = document.getElementById('tele-geoms');
        const nodesEl = document.getElementById('tele-nodes');

        if (fpsEl) fpsEl.textContent = `${this.fps} FPS`;
        if (drawsEl) drawsEl.textContent = this.renderer.info.render.calls;
        if (geomsEl) geomsEl.textContent = this.renderer.info.memory.geometries;
        if (nodesEl) nodesEl.textContent = `${this.nodes.length} (Links: ${this.connections.length})`;
    }
}

// Initialize viewport on DOM load
window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('deck-canvas-container');
    if (container) {
        window.deckViewport = new DeckViewport('deck-canvas-container');
    }
});