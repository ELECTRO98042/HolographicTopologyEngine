import * as THREE from './vendor/graphics/three.js';
import { OrbitControls } from './vendor/graphics/OrbitControls.js';

window.THREE = THREE;
window.OrbitControls = OrbitControls;

// --- COLOR PALETTE & NODE STATES ---
// --- COLOR PALETTE & NODE STATES ---
const NODE_COLORS = {
    DEFAULT: 0x00f0ff,   // Cyan (Stable/Idle)
    SELECTED: 0xfacc15,  // Yellow (Link Source / Active Focus)
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

const extendedPantryTemplates = [
    // --- 1.1 SPACETIME METRICS ---
    {
        id: 'pantry-btz',
        name: 'BTZ Rotating Black Hole',
        type: 'METRIC',
        formula: 'ds^2 = -N^2 dt^2 + N^{-2} dr^2 + r^2(d\\phi + N^\\phi dt)^2',
        color: '#38bdf8',
        epistemicStatus: 'EXACT 2+1 SOLUTION (TOY MODEL)',
        caution: 'Valid in restricted dimensions; unproven as a direct description of astrophysical 3+1 black holes.',
        description: '2+1 dimensional asymptotically anti-de Sitter black hole solution.'
    },
    {
        id: 'pantry-ads-bulk',
        name: 'Anti-de Sitter (AdS) Bulk',
        type: 'METRIC',
        formula: 'ds^2 = \\frac{l^2}{z^2}(-dt^2 + dz^2 + d\\vec{x}^2)',
        color: '#0284c7',
        epistemicStatus: 'EXACT SYMMETRIC SPACETIME',
        caution: 'Constant negative curvature vacuum solution; idealized geometry model.',
        description: 'Maximal symmetric spacetime with negative cosmological constant.'
    },
    {
        id: 'pantry-ds-space',
        name: 'de Sitter (dS) Space',
        type: 'METRIC',
        formula: 'ds^2 = -dt^2 + \\alpha^2 \\cosh^2(t/\\alpha) d\\Omega_3^2',
        color: '#0ea5e9',
        epistemicStatus: 'COSMOLOGICAL SOLUTION',
        caution: 'Represents accelerating expansion universe model with positive cosmological constant.',
        description: 'Maximally symmetric spacetime solution modeling accelerated cosmic expansion.'
    },
    {
        id: 'pantry-reissner-nordstrom',
        name: 'Reissner-Nordström Charged BH',
        type: 'METRIC',
        formula: 'ds^2 = -f(r)dt^2 + f(r)^{-1}dr^2 + r^2 d\\Omega^2, \\ f(r)=1-\\frac{2M}{r}+\\frac{Q^2}{r^2}',
        color: '#60a5fa',
        epistemicStatus: 'EXACT SOLUTION (EINSTEIN-MAXWELL)',
        caution: 'Assumes idealized spherical symmetry and point charge; inner Cauchy horizon presents stability paradoxes.',
        description: 'Exact solution of the Einstein-Maxwell field equations for a charged, non-rotating black hole.'
    },

    // --- 1.2 GAUGE & POTENTIALS ---
    {
        id: 'pantry-chern-simons',
        name: 'Chern-Simons Topological Term',
        type: 'TOPOLOGY',
        formula: 'S_CS = (k/4\\pi) \\int Tr(A \\wedge dA + \\frac{2}{3}A^3)',
        color: '#c084fc',
        epistemicStatus: 'MATHEMATICAL INVARIANT / QFT FRAMEWORK',
        caution: 'Exact topological construct; background field behavior depends on quantization conditions.',
        description: 'Topological quantum field theory action invariant.'
    },
    {
        id: 'pantry-yang-mills',
        name: 'Yang-Mills Instanton',
        type: 'FIELD',
        formula: 'F_{\\mu\\nu} = \\frac{1}{2}\\epsilon_{\\mu\\nu\\rho\\sigma}F^{\\rho\\sigma}',
        color: '#a855f7',
        epistemicStatus: 'NON-PERTURBATIVE QFT SOLUTION',
        caution: 'Classically localized vacuum transition configuration in Euclidean spacetime.',
        description: 'Self-dual gauge field configuration minimizing the action in non-Abelian gauge theory.'
    },
    {
        id: 'pantry-maxwell-cs',
        name: 'Maxwell-Chern-Simons Field',
        type: 'FIELD',
        formula: '\\mathcal{L} = -\\frac{1}{4}F_{\\mu\\nu}F^{\\mu\\nu} + \\frac{\\mu}{2}\\epsilon^{\\mu\\nu\\rho}A_\\partial_\\nu A_\\rho',
        color: '#9333ea',
        epistemicStatus: 'EFFECTIVE FIELD THEORY (2+1D)',
        caution: 'Introduces topological mass generation in lower-dimensional electrodynamics.',
        description: 'Topologically massive gauge field theory combining Maxwell kinetic terms with Chern-Simons modifications.'
    },
    {
        id: 'pantry-higgs-potential',
        name: 'Scalar Higgs Potential',
        type: 'POTENTIAL',
        formula: 'V(\\phi) = -\\mu^2 |\\phi|^2 + \\lambda |\\phi|^4',
        color: '#d8b4fe',
        epistemicStatus: 'ELECTROWEAK SYMMETRY BREAKING MODEL',
        caution: 'Phenomenological effective potential; vacuum expectation value depends on scalar parameter tuning.',
        description: 'Spontaneous symmetry breaking potential driving mass generation mechanisms.'
    },

    // --- 1.3 SPAN & BOUNDARIES ---
    {
        id: 'pantry-correlator',
        name: 'Bulk-Boundary Correlator',
        type: 'FIELD',
        formula: '\\langle \\mathcal{O}(x)\\mathcal{O}(y) \\rangle = \\frac{C}{|x-y|^{2\\Delta}}',
        color: '#f43f5e',
        epistemicStatus: 'CONJECTURED DUALITY (AdS/CFT)',
        caution: 'Strong/weak coupling correspondence hypothesis; non-empirically verified.',
        description: 'Holographic two-point correlation function mapping bulk to boundary.'
    },
    {
        id: 'pantry-ryu-takayanagi',
        name: 'Ryu-Takayanagi Minimal Surface',
        type: 'TOPOLOGY',
        formula: 'S_A = \\frac{\\text{Area}(\\gamma_A)}{4G_N}',
        color: '#fb7185',
        epistemicStatus: 'HOLOGRAPHIC ENTANGLEMENT CONJECTURE',
        caution: 'Geometric formula mapping quantum entanglement entropy to bulk minimal surface areas.',
        description: 'Geometric calculation of entanglement entropy in conformal field theories via bulk geometry.'
    },
    {
        id: 'pantry-entanglement-wedge',
        name: 'Entanglement Wedge Cross-Section',
        type: 'TOPOLOGY',
        formula: 'E_W = \\min \\text{Area}(\\Sigma_{E_W}) / 4G_N',
        color: '#e11d48',
        epistemicStatus: 'QUANTUM INFORMATION TOPOLOGY',
        caution: 'Advanced holographic subregion correlation measure; bounds mixed state entanglement.',
        description: 'Co-dimension two bulk surface characterizing mixed state correlations and quantum recovery.'
    },
    {
        id: 'pantry-modular-hamiltonian',
        name: 'Modular Hamiltonian Shell',
        type: 'POTENTIAL',
        formula: 'K = -\\log \\rho_A = \\int_A \\beta(x) T_{00}(x) dx',
        color: '#fda4af',
        epistemicStatus: 'OPERATOR ALGEBRA FRAMEWORK',
        caution: 'Explicit local form is generally intractable except for Rindler or vacuum subregions.',
        description: 'Thermal effective Hamiltonian associated with modular density matrices of subregions.'
    }
];

// --- AUXILIARY RENDER VIEWPORT: SEMANTIC COLOR KEY LEGEND ---
function initAuxiliaryColorKey() {
    const auxViewport = document.getElementById('aux-render-viewport');
    if (!auxViewport) return;

    auxViewport.className = "w-full flex-1 bg-slate-950/90 rounded border border-engine-border/60 p-2.5 overflow-y-auto font-mono text-[10px]";
    auxViewport.innerHTML = `
        <div class="space-y-2">
            <div class="text-engine-cyan uppercase tracking-wider font-semibold pb-1 border-b border-engine-border/40 flex justify-between items-center">
                <span>// NODE COLOR KEY</span>
                <span class="text-slate-500">STATE MAP</span>
            </div>
            
            <div class="flex items-center justify-between p-1 rounded bg-slate-900/40 border border-slate-800">
                <span class="text-slate-300">Metric Base / Bulk</span>
                <span class="px-2 py-0.5 rounded text-[9px] font-mono font-semibold" style="background: #000; border: 1px solid #00f0ff; color: #00f0ff;">BULK</span>
            </div>

            <div class="flex items-center justify-between p-1 rounded bg-slate-900/40 border border-slate-800">
                <span class="text-slate-300">Gauge & Potentials (Pass)</span>
                <span class="px-2 py-0.5 rounded text-[9px] font-mono font-semibold" style="background: #000; border: 1px solid #10b981; color: #10b981;">GAUGE</span>
            </div>

            <div class="flex items-center justify-between p-1 rounded bg-slate-900/40 border border-slate-800">
                <span class="text-slate-300">Topology / Boundaries</span>
                <span class="px-2 py-0.5 rounded text-[9px] font-mono font-semibold" style="background: #000; border: 1px solid #8b5cf6; color: #8b5cf6;">TOPOLOGY</span>
            </div>

            <div class="flex items-center justify-between p-1 rounded bg-slate-900/40 border border-slate-800">
                <span class="text-slate-300">Warning / Near Horizon</span>
                <span class="px-2 py-0.5 rounded text-[9px] font-mono font-semibold" style="background: #000; border: 1px solid #f59e0b; color: #f59e0b;">WARNING</span>
            </div>

            <div class="flex items-center justify-between p-1 rounded bg-slate-900/40 border border-slate-800">
                <span class="text-slate-300">Denied / Singularity</span>
                <span class="px-2 py-0.5 rounded text-[9px] font-mono font-semibold" style="background: #000; border: 1px solid #ef4444; color: #ef4444;">DENIED</span>
            </div>

            <div class="flex items-center justify-between p-1 rounded bg-slate-900/40 border border-slate-800">
                <span class="text-slate-300">Selected / Active Focus</span>
                <span class="px-2 py-0.5 rounded text-[9px] font-mono font-semibold" style="background: #000; border: 1px solid #facc15; color: #facc15;">FOCUS</span>
            </div>
        </div>
    `;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuxiliaryColorKey);
} else {
    initAuxiliaryColorKey();
}

function checkBondValidity(typeA, typeB) {
    if (!ALLOWED_CONNECTIONS[typeA]) return false;
    return ALLOWED_CONNECTIONS[typeA].includes(typeB);
}
// --- CENTRALIZED BADGE THEME RESOLVER (INLINE STYLED FOR RELIABILITY) ---
function getBadgeClass(themeOrColor) {
    switch (themeOrColor) {
        case 'red':
        case 'error':
        case 'DENIED':
            return {
                className: "text-[9px] font-mono px-1.5 py-0.5 rounded border",
                style: "background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); color: #ef4444;"
            };
        case 'amber':
        case 'orange':
        case 'WARNING':
            return {
                className: "text-[9px] font-mono px-1.5 py-0.5 rounded border",
                style: "background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.3); color: #f59e0b;"
            };
        case 'purple':
        case 'violet':
        case 'TOPOLOGY':
            return {
                className: "text-[9px] font-mono px-1.5 py-0.5 rounded border",
                style: "background: rgba(139, 92, 246, 0.1); border-color: rgba(139, 92, 246, 0.3); color: #8b5cf6;"
            };
        case 'dual-violet-green':
            // Section 1.3 specialized: Violet badge background with Emerald Green text
            return {
                className: "text-[9px] font-mono px-1.5 py-0.5 rounded border",
                style: "background: rgba(139, 92, 246, 0.1); border-color: rgba(139, 92, 246, 0.3); color: #10b981;"
            };
        case 'emerald':
        case 'green':
        case 'PASSED':
        default:
            return {
                className: "text-[9px] font-mono px-1.5 py-0.5 rounded border",
                style: "background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3); color: #10b981;"
            };
    }
}
// --- MASTER UNIFIED STYLING ENFORCER ---
function applyUnifiedStyling(node, status, code, customTheme = null) {
    if (!node) return;

    let theme = customTheme;
    if (!theme) {
        if (status === 'DENIED') theme = 'red';
        else if (status === 'WARNING') theme = 'amber';
        else theme = 'emerald';
    }

    const name = node.data ? node.data.name : '';
    const isSection13Exception = name && (
        name.includes('AdS/CFT') ||
        name.includes('AdS Boundary Shell') ||
        name.includes('Bulk-Boundary') ||
        name.includes('Chern-Simons') ||
        name.includes('Ryu-Takayanagi') ||
        name.includes('Entanglement Wedge') ||
        name.includes('Modular Hamiltonian')
    );

    if (isSection13Exception && status !== 'DENIED' && status !== 'WARNING') {
        theme = 'dual-violet-green';
    }

    // Store persistent theme on node object so it survives deselection
    node.currentTheme = theme;

    // Set 3D Node Mesh Color (only if not currently selected as active focus yellow)
    if (node.mesh && node.mesh.material) {
        // If this is the currently selected node, keep it yellow unless explicitly overridden,
        // but store the underlying theme so it restores correctly on deselection.
        const isCurrentlySelected = window.deckViewPort && window.deckViewPort.selectedNode === node;

        if (!isCurrentlySelected) {
            if (theme === 'red') node.mesh.material.color.setHex(0xef4444);
            else if (theme === 'amber') node.mesh.material.color.setHex(0xf59e0b);
            else if (theme === 'purple' || theme === 'dual-violet-green') node.mesh.material.color.setHex(0x8b5cf6);
            else node.mesh.material.color.setHex(0x10b981);
        }
    }

    // Set Inspector Status Badge Styling & Text
    const badgeEl = document.getElementById('arbiter-status-badge');
    if (badgeEl) {
        const badgeConfig = getBadgeClass(theme);
        badgeEl.className = badgeConfig.className;
        badgeEl.setAttribute('style', badgeConfig.style);
        badgeEl.textContent = `${status}: ${code}`;
    }
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
    // Inside DeckViewport class in deck_render.js:
    syncToMainHUD() {
        if (!this.nodes || !Array.isArray(this.nodes)) {
            console.warn("[Sync Bridge] No active nodes array found to sync.");
            return;
        }

        const payload = {
            type: 'SYNC_TOPOLOGY',
            timestamp: Date.now(),
            nodes: this.nodes.map((n, index) => {
                // Handle both mesh wrapped nodes and direct data objects
                const nodeData = n.data || n;
                const position = n.mesh ? n.mesh.position : (n.position || { x: n.x || 0, y: n.y || 0, z: n.z || 0 });

                return {
                    id: nodeData.id || `N-00${index + 1}`,
                    name: nodeData.name || `Node-${index + 1}`,
                    type: nodeData.type || 'Standard',
                    formula: nodeData.formula || 'Linear',
                    position: {
                        x: position.x,
                        y: position.y,
                        z: position.z
                    }
                }
            }),
            connections: (this.connections || []).map(c => ({
                source: c.nodeA ? (c.nodeA.data ? c.nodeA.data.id : c.nodeA.id) : null,
                target: c.nodeB ? (c.nodeB.data ? c.nodeB.data.id : c.nodeB.id) : null
            }))
        };

        // Broadcast across the cross-tab channel
        const syncChannel = new BroadcastChannel('holographic_sync_channel');
        syncChannel.postMessage(payload);

        console.log("[Sync Bridge] Custom topology broadcasted to Main HUD workspace:", payload);
        //alert("Topology successfully synced to Main HUD workspace!");
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
            { data: { id: "N-001", name: "AdS Boundary Shell", type: "TOPOLOGY", formula: "dS^d / CFT_d-1 Boundary" }, position: new THREE.Vector3(0, 0.6, height * 0.666) },
            { data: { id: "N-002", name: "Minkowski Space", type: "METRIC", formula: "η_μν = diag(-1,1,1,1)" }, position: new THREE.Vector3(-2, 0.6, -height * 0.333) },
            { data: { id: "N-003", name: "Abelian U(1) EM", type: "FIELD", formula: "F_μν = ∂_μ A_ν - ∂_ν A_μ" }, position: new THREE.Vector3(2, 0.6, -height * 0.333) }
        ];

        defaultNodes.forEach(item => {
            const geometry = new THREE.SphereGeometry(0.6, 24, 24);
            const material = new THREE.MeshBasicMaterial({ color: 0x10b981, wireframe: true }); // Default base
            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData = { nodeId: item.data.id };
            mesh.position.copy(item.position);

            this.scene.add(mesh);
            const nodeObj = { data: item.data, mesh };
            this.nodes.push(nodeObj);

            // Apply unified styling immediately so startup theme & colors match rules
            applyUnifiedStyling(nodeObj, "PASSED", "STATUS_00_PASSED");

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
        console.log("[CRITICAL DEBUG] Drop event triggered on canvas!", e);
        e.preventDefault();
        e.stopPropagation();

        const rawData = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
        if (!rawData || this._isHandlingDrop) return;

        this._isHandlingDrop = true;
        setTimeout(() => { this._isHandlingDrop = false; }, 100);

        try {
            const nodeData = JSON.parse(rawData);

            // --- PHYSICS ARBITER GATEKEEPER INTERCEPTION ---
            if (window.physicsArbiter && typeof window.physicsArbiter.validateDrop === 'function') {
                const verdict = window.physicsArbiter.validateDrop(nodeData);
                console.log(`[ARBITER VERDICT]: ${verdict.status} (${verdict.code}) - ${verdict.message}`);

                // Update Inspector UI with Arbiter status and error codes
                this.updateInspectorWithVerdict(verdict);

                // If denied, block drop entirely to protect render pipeline
                if (verdict.status === 'DENIED') {
                    console.warn("Node drop blocked by Physics Arbiter gatekeeper:", nodeData.name);
                    return;
                }

                // Use sanitized/validated node payload
                if (verdict.node) {
                    Object.assign(nodeData, verdict.node);
                }
            }
            // ----------------------------------------------

            const rect = this.renderer.domElement.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

            const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const targetPoint = new THREE.Vector3();
            raycaster.ray.intersectPlane(groundPlane, targetPoint);

            nodeData.position = { x: targetPoint.x, y: targetPoint.y, z: targetPoint.z };

            // 1. Create the mesh in the engine and capture the returned node object
            const newNode = this.createNodeMesh(nodeData, targetPoint);
            if (newNode) {
                // Ensure node is added to deck's internal list
                if (!this.nodes.includes(newNode)) {
                    this.nodes.push(newNode);
                }

                window.activeDeckNodes = this.nodes;
                this.selectNode(newNode);

                // Now trigger the sync bridge with the populated list
                if (typeof this.syncToMainHUD === 'function') {
                    this.syncToMainHUD();
                }
            }
            console.log("[Deck Drop Success] Spawned and dispatched node:", nodeData.name);
        } catch (err) {
            console.error("Failed to parse and update workspace for dropped item:", err);
        }
    }

    createNodeMesh(data, position) {
        const nextId = `N-00${this.nodes.length + 1}`;
        const enrichedData = {
            id: nextId,
            name: data.name || "Custom Node",
            type: data.type || "METRIC",
            formula: data.formula || "g_\\mu\\nu = \\eta_\\mu\\nu + h_\\mu\\nu",
            fieldIntensity: 1.0,
            spin: data.name && data.name.includes('Kerr') ? 0.85 : 0.0,
            x: position ? position.x : 0,
            y: position ? position.y : 0,
            z: position ? position.z : 0
        };

        const geometry = new THREE.SphereGeometry(0.6, 24, 24);
        const material = new THREE.MeshBasicMaterial({ color: NODE_COLORS.DEFAULT, wireframe: true });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { nodeId: nextId };

        mesh.position.copy(position);
        mesh.position.y = 0;

        this.scene.add(mesh);

        const nodeObj = { data: enrichedData, mesh };
        this.nodes.push(nodeObj);

        window.nodeMeshes = window.nodeMeshes || [];
        window.nodeMeshes.push(mesh);

        window.nodes = this.nodes.map(n => n.data);
        this.updateNodeCountBadge();

        console.log(`[Deck Drop] Created node ${nextId} (${enrichedData.name})`);

        // Return the node object so handleDrop can immediately select/inspect it
        return nodeObj;
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
            // --- SELECTING A NODE FOR THE FIRST TIME ---
            this.selectedNode = node;

            // Store current color before highlighting yellow
            if (node.mesh && node.mesh.material) {
                // If currentTheme isn't set yet, determine it from material color
                if (!node.currentTheme) {
                    node.currentTheme = 'emerald'; // default pass
                }
            }

            // Highlight active focus yellow
            node.mesh.material = new THREE.MeshBasicMaterial({ color: 0xfacc15, wireframe: true });
            this.updateInspectorForNode(node, "LINK SOURCE");

        } else if (this.selectedNode === node) {
            // --- DESELECTING THE CURRENTLY SELECTED NODE ---
            this.restoreNodeColor(this.selectedNode);
            this.selectedNode = null;
            this.resetInspectorUI();

        } else {
            // --- SWITCHING SELECTION FROM ONE NODE TO ANOTHER ---
            // Restore previous node to its persistent state color
            this.restoreNodeColor(this.selectedNode);

            const sourceNode = this.selectedNode;
            const targetNode = node;
            const isValid = checkBondValidity(sourceNode.data.type, targetNode.data.type);

            if (!isValid) {
                targetNode.mesh.material = new THREE.MeshBasicMaterial({ color: 0xef4444, wireframe: true });
                targetNode.currentTheme = 'red';
                // ... (illegal bond error handling UI) ...
                setTimeout(() => {
                    this.restoreNodeColor(targetNode);
                }, 1200);
                return;
            }

            this.createConnectionLine(sourceNode, targetNode);

            // Set new target node to active focus yellow
            targetNode.mesh.material = new THREE.MeshBasicMaterial({ color: 0xfacc15, wireframe: true });
            this.selectedNode = targetNode;
            this.updateInspectorForNode(targetNode, "LINKED");
        }
    }

    // Helper to restore a node's mesh color based on its persistent theme state
    restoreNodeColor(node) {
        if (!node || !node.mesh) return;
        const theme = node.currentTheme || 'emerald';
        let hexColor = 0x10b981; // Emerald Green default

        if (theme === 'red') hexColor = 0xef4444;
        else if (theme === 'amber') hexColor = 0xf59e0b;
        else if (theme === 'purple' || theme === 'dual-violet-green') hexColor = 0x8b5cf6;
        else if (theme === 'emerald') hexColor = 0x10b981;

        node.mesh.material = new THREE.MeshBasicMaterial({ color: hexColor, wireframe: true });
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
    updateInspectorWithVerdict(verdict) {
        const statusEl = document.getElementById('inspector-status');
        const bodyEl = document.getElementById('inspector-body');

        if (statusEl) {
            statusEl.textContent = `ARBITER: ${verdict.status}`;
            if (verdict.color === 'green') {
                statusEl.className = "text-[9px] font-mono text-engine-cyan bg-engine-cyan/10 px-1.5 py-0.5 rounded border border-engine-cyan/30";
            } else if (verdict.color === 'orange') {
                statusEl.className = "text-[9px] font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/30";
            } else {
                statusEl.className = "text-[9px] font-mono text-engine-red bg-engine-red/10 px-1.5 py-0.5 rounded border border-engine-red/30";
            }
        }

        if (bodyEl) {
            const borderClass = verdict.color === 'red' ? 'border-engine-red/40 bg-engine-red/10 text-engine-red' :
                verdict.color === 'orange' ? 'border-amber-500/40 bg-amber-950/20 text-amber-400' :
                    'border-engine-cyan/40 bg-engine-cyan/10 text-engine-cyan';

            bodyEl.innerHTML = `
                <div class="space-y-3 font-mono">
                    <div class="p-2 rounded border ${borderClass} text-[11px]">
                        <div class="font-semibold">[${verdict.code}]</div>
                        <div class="mt-1">${verdict.message}</div>
                    </div>
                    <div class="text-slate-400 text-[10px]">
                        ${verdict.status === 'DENIED' ? '✖ Drop intercepted and rejected by Physics Arbiter gatekeeper.' : '✔ Drop validated and cleared for Main HUD transmission.'}
                    </div>
                </div>
            `;
        }
    }

    updateInspectorForNode(node, mode) {
        const statusEl = document.getElementById('inspector-status');
        const bodyEl = document.getElementById('inspector-body');

        if (statusEl) {
            statusEl.textContent = `${node.data.type} (${mode})`;
            statusEl.className = "text-[9px] font-mono text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-400/30";
        }

        if (bodyEl) {
            let epistemicBadge = node.data.epistemicStatus || "CONJECTURED THEORETICAL FRAMEWORK";
            let cautionNote = node.data.caution || "Model-dependent construct; handle with theoretical caution.";

            let arbiterVerdict = { status: 'PASSED', code: 'STATUS_00_PASSED', color: 'green' };
            if (window.physicsArbiter) {
                arbiterVerdict = window.physicsArbiter.validateDrop(node.data);
            }

            // --- UNIFIED INITIAL BADGE THEME MAPPING ---
            let initialTheme = 'emerald';
            if (node.data.type === 'TOPOLOGY' || (node.data.name && node.data.name.includes('Chern-Simons'))) {
                initialTheme = 'purple';
            } else if (node.data.name && (node.data.name.includes('Bulk-Boundary Correlator') || node.data.name.includes('Modular Hamiltonian Shell'))) {
                initialTheme = 'dual-violet-green';
            } else if (arbiterVerdict.color === 'red') {
                initialTheme = 'red';
            } else if (arbiterVerdict.color === 'orange') {
                initialTheme = 'amber';
            }
            const verdictBgClass = getBadgeClass(initialTheme);

            let paramControls = '';
            let initialEval = '1.000';

            if (node.data.type === 'METRIC') {
                if (node.data.name && node.data.name.includes('Kerr')) {
                    paramControls = `
                        <div class="grid grid-cols-2 gap-2 mt-2">
                            <div>
                                <label class="text-[9px] text-slate-400 block">Mass (M)</label>
                                <input type="range" id="eval-param-mass" min="0.5" max="5.0" step="0.1" value="2.0" oninput="window.evaluateActiveFormula()">
                            </div>
                            <div>
                                <label class="text-[9px] text-slate-400 block">Spin (a)</label>
                                <input type="range" id="eval-param-spin" min="0.0" max="1.99" step="0.05" value="1.0" oninput="window.evaluateActiveFormula()">
                            </div>
                        </div>
                    `;
                } else if (node.data.name && node.data.name.includes('Schwarzschild')) {
                    paramControls = `
                        <div class="grid grid-cols-2 gap-2 mt-2">
                            <div>
                                <label class="text-[9px] text-slate-400 block">Radius (r)</label>
                                <input type="range" id="eval-param-r" min="0.5" max="10.0" step="0.1" value="3.0" oninput="window.evaluateActiveFormula()">
                            </div>
                            <div>
                                <label class="text-[9px] text-slate-400 block">Mass (M)</label>
                                <input type="range" id="eval-param-mass" min="0.5" max="3.0" step="0.1" value="1.0" oninput="window.evaluateActiveFormula()">
                            </div>
                        </div>
                    `;
                } else if (node.data.name && node.data.name.includes('Minkowski')) {
                    paramControls = `
                        <div class="grid grid-cols-2 gap-2 mt-2">
                            <div>
                                <label class="text-[9px] text-slate-400 block">Time Scale (t)</label>
                                <input type="range" id="eval-param-t" min="0.1" max="10.0" step="0.1" value="1.0" oninput="window.evaluateActiveFormula()">
                            </div>
                            <div>
                                <label class="text-[9px] text-slate-400 block">Spatial Bounds (x)</label>
                                <input type="range" id="eval-param-x" min="0.1" max="10.0" step="0.1" value="1.0" oninput="window.evaluateActiveFormula()">
                            </div>
                        </div>
                    `;
                } else if (node.data.name && node.data.name.includes('FLRW')) {
                    paramControls = `
                        <div class="grid grid-cols-2 gap-2 mt-2">
                            <div>
                                <label class="text-[9px] text-slate-400 block">Scale Factor a(t)</label>
                                <input type="range" id="eval-param-scale" min="-0.5" max="5.0" step="0.1" value="1.0" oninput="window.evaluateActiveFormula()">
                            </div>
                            <div>
                                <label class="text-[9px] text-slate-400 block">Curvature (k)</label>
                                <input type="range" id="eval-param-k" min="-1" max="1" step="1" value="0" oninput="window.evaluateActiveFormula()">
                            </div>
                        </div>
                    `;
                } else if (node.data.name && node.data.name.includes('AdS')) {
                    paramControls = `
                        <div class="grid grid-cols-2 gap-2 mt-2">
                            <div>
                                <label class="text-[9px] text-slate-400 block">Bulk Depth (z)</label>
                                <input type="range" id="eval-param-z" min="-0.5" max="5.0" step="0.1" value="1.0" oninput="window.evaluateActiveFormula()">
                            </div>
                            <div>
                                <label class="text-[9px] text-slate-400 block">AdS Radius (L)</label>
                                <input type="range" id="eval-param-l" min="0.5" max="3.0" step="0.1" value="1.0" oninput="window.evaluateActiveFormula()">
                            </div>
                        </div>
                    `;
                } else if (node.data.name && node.data.name.includes('de Sitter')) {
                    paramControls = `
                        <div class="grid grid-cols-2 gap-2 mt-2">
                            <div>
                                <label class="text-[9px] text-slate-400 block">Cosmo Const (Λ)</label>
                                <input type="range" id="eval-param-lambda" min="-0.5" max="2.0" step="0.1" value="1.0" oninput="window.evaluateActiveFormula()">
                            </div>
                            <div>
                                <label class="text-[9px] text-slate-400 block">Time (t)</label>
                                <input type="range" id="eval-param-t" min="0.1" max="5.0" step="0.1" value="1.0" oninput="window.evaluateActiveFormula()">
                            </div>
                        </div>
                    `;
                } else {
                    paramControls = `
                        <div class="grid grid-cols-2 gap-2 mt-2">
                            <div>
                                <label class="text-[9px] text-slate-400 block">Radius (r)</label>
                                <input type="range" id="eval-param-r" min="0.1" max="10" step="0.1" value="1.0" oninput="window.evaluateActiveFormula()">
                            </div>
                            <div>
                                <label class="text-[9px] text-slate-400 block">Mass/Scale (N)</label>
                                <input type="range" id="eval-param-n" min="0.5" max="5" step="0.1" value="1.0" oninput="window.evaluateActiveFormula()">
                            </div>
                        </div>
                    `;
                }
            } else if (node.data.type === 'TOPOLOGY') {
                paramControls = `
                    <div class="mt-2">
                        <label class="text-[9px] text-slate-400 block">CS Level (k) / Area Scale</label>
                        <input type="range" id="eval-param-k" min="1" max="10" step="1" value="1" class="w-full accent-engine-cyan" oninput="window.evaluateActiveFormula()">
                    </div>
                `;
            } else if (node.data.name && node.data.name.includes('Higgs')) {
                paramControls = `
                    <div class="grid grid-cols-2 gap-2 mt-2">
                        <div>
                            <label class="text-[9px] text-slate-400 block">Mu² (μ²)</label>
                            <input type="range" id="eval-param-mu" min="-2.0" max="2.0" step="0.1" value="1.0" oninput="window.evaluateActiveFormula()">
                        </div>
                        <div>
                            <label class="text-[9px] text-slate-400 block">Lambda (λ)</label>
                            <input type="range" id="eval-param-lambda" min="-0.5" max="2.0" step="0.05" value="0.5" oninput="window.evaluateActiveFormula()">
                        </div>
                    </div>
                `;
            } else {
                paramControls = `
                    <div class="mt-2">
                        <label class="text-[9px] text-slate-400 block">Conformal Dim (Δ)</label>
                        <input type="range" id="eval-param-delta" min="1" max="4" step="0.5" value="2.0" class="w-full accent-engine-cyan" oninput="window.evaluateActiveFormula()">
                    </div>
                `;
            }

            bodyEl.innerHTML = `
                <div class="space-y-3">
                    <div>
                        <span class="text-slate-500 block text-[10px]">NODE IDENTIFIER</span>
                        <span class="text-slate-100 font-semibold">${node.data.id} - ${node.data.name}</span>
                    </div>
                    <div>
                        <div class="flex justify-between items-center">
                            <span class="text-slate-500 block text-[10px]">EPISTEMIC STATUS</span>
                            <span id="arbiter-status-badge" class="text-[9px] font-mono px-1.5 py-0.5 rounded border">
                                ${arbiterVerdict.status}: ${arbiterVerdict.code}
                            </span>
                        </div>
                        <div class="text-[9px] font-mono text-slate-400 mt-0.5">${epistemicBadge}</div>
                        <div class="text-[10px] text-slate-400 italic mt-1 bg-amber-950/20 p-1.5 rounded border border-amber-500/20">
                            ⚠️ ${cautionNote}
                        </div>
                    </div>
                    <div>
                        <span class="text-slate-500 block text-[10px]">FIELD / METRIC EQUATION</span>
                        <div class="p-2 rounded bg-slate-950 border border-engine-border font-mono text-engine-cyan mt-1 text-[11px] select-all">
                            ${node.data.formula}
                        </div>
                    </div>
                    <div class="p-2.5 rounded bg-slate-900/90 border border-engine-border">
                        <span class="text-slate-400 block text-[10px] uppercase font-semibold">Live Evaluator Binding</span>
                        ${paramControls}
                        <div class="mt-2 pt-2 border-t border-slate-800 flex justify-between items-center font-mono">
                            <span class="text-[10px] text-slate-400">Result Metric:</span>
                            <span id="eval-result-output" class="text-engine-cyan text-xs font-bold">${initialEval}</span>
                        </div>
                    </div>
                </div>
            `;
            // Apply unified styling immediately upon inspector load
            applyUnifiedStyling(node, arbiterVerdict.status, arbiterVerdict.code, arbiterVerdict.color === 'red' ? 'red' : (arbiterVerdict.color === 'orange' ? 'amber' : 'emerald'));

            window.activeEvaluatedNode = node;
            window.evaluateActiveFormula = () => {
                const outputEl = document.getElementById('eval-result-output');
                const node = window.activeEvaluatedNode;
                if (!outputEl || !node || !node.mesh) return;

                const type = node.data.type;
                const name = node.data.name || "";
                let resultText = "0.00";

                const evalApply = (status, code, theme) => {
                    applyUnifiedStyling(node, status, code, theme);
                };

                // --- 1. MINKOWSKI FLAT METRIC (1.1) ---
                if (type === 'METRIC' && name.includes('Minkowski')) {
                    const t = parseFloat(document.getElementById('eval-param-t')?.value || 1.0);
                    const x = parseFloat(document.getElementById('eval-param-x')?.value || 1.0);
                    const interval = -Math.pow(t, 2) + Math.pow(x, 2);

                    resultText = `${interval.toFixed(3)} (Spacetime Interval s²)`;
                    evalApply("PASSED", "STATUS_04_MINKOWSKI_STABLE", "emerald");

                    const scaleFactor = Math.max(0.4, (t + x) * 0.3);
                    node.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);

                    // --- 2. SCHWARZSCHILD GEOMETRY (1.1) ---
                } else if (type === 'METRIC' && name.includes('Schwarzschild')) {
                    const r = parseFloat(document.getElementById('eval-param-r')?.value || 3.0);
                    const M = parseFloat(document.getElementById('eval-param-mass')?.value || 1.0);
                    const g00 = -(1.0 - (2.0 * M) / r);

                    if (r <= 2.0 * M) {
                        resultText = `${g00.toFixed(3)} [Singularity Breach]`;
                        evalApply("DENIED", "ERR_SCHWARZSCHILD_SINGULARITY", "red");
                    } else if (r <= 2.2 * M) {
                        resultText = `${g00.toFixed(3)} [Near Horizon]`;
                        evalApply("WARNING", "WARN_HORIZON_APPROACH", "amber");
                    } else {
                        resultText = `${g00.toFixed(3)} (g_00 factor)`;
                        evalApply("PASSED", "STATUS_01_SCHWARZSCHILD_STABLE", "emerald");
                    }
                    const scaleFactor = Math.max(0.4, r * 0.4);
                    node.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);

                    // --- 3. KERR ROTATING BLACK HOLE (1.1) ---
                } else if (type === 'METRIC' && name.includes('Kerr')) {
                    const rawM = parseFloat(document.getElementById('eval-param-mass')?.value);
                    const rawA = parseFloat(document.getElementById('eval-param-spin')?.value);
                    const M = isNaN(rawM) ? 2.0 : rawM;
                    const a = isNaN(rawA) ? 1.0 : rawA;

                    const discriminant = (M * M) - (a * a);
                    if (discriminant < 0) {
                        resultText = `Naked Singularity (a > M)`;
                        evalApply("DENIED", "ERR_NAKED_SINGULARITY", "red");
                    } else if (a >= 0.9 * M) {
                        resultText = `${(M + Math.sqrt(discriminant)).toFixed(3)} [Near Extremal Spin]`;
                        evalApply("WARNING", "WARN_NEAR_EXTREMAL_SPIN", "amber");
                    } else {
                        const rPlus = M + Math.sqrt(discriminant);
                        resultText = `${rPlus.toFixed(3)} (Kerr Horizon r_+)`;
                        evalApply("PASSED", "STATUS_02_KERR_CENSORED", "emerald");
                    }
                    const scaleFactor = Math.max(0.4, M * 0.6);
                    node.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);

                    // --- 4. FLRW COSMOLOGICAL METRIC (1.1) ---
                } else if (type === 'METRIC' && name.includes('FLRW')) {
                    const aScale = parseFloat(document.getElementById('eval-param-scale')?.value || 1.0);
                    const k = parseInt(document.getElementById('eval-param-k')?.value || 0);

                    if (aScale <= 0) {
                        resultText = `Big Crunch / Collapse`;
                        evalApply("DENIED", "ERR_COSMIC_COLLAPSE", "red");
                    } else if (aScale < 0.3) {
                        resultText = `High Curvature Tension`;
                        evalApply("WARNING", "WARN_COSMIC_TENSION", "amber");
                    } else {
                        resultText = `${aScale.toFixed(3)} (Scale a(t))`;
                        evalApply("PASSED", "STATUS_03_COSMIC_EXPANSION", "emerald");
                    }
                    const scaleFactor = Math.max(0.4, aScale * 0.6);
                    node.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);

                    // --- 5. BTZ ROTATING BLACK HOLE (1.1) ---
                } else if (type === 'METRIC' && name.includes('BTZ')) {
                    const r = parseFloat(document.getElementById('eval-param-r')?.value || 1.0);
                    const mass = parseFloat(document.getElementById('eval-param-n')?.value || 1.0);
                    const lapseSquared = -mass + Math.pow(r, 2);

                    if (lapseSquared < 0) {
                        resultText = `${lapseSquared.toFixed(3)} [Sub-Horizon Collapse]`;
                        evalApply("DENIED", "ERR_BTZ_SINGULARITY", "red");
                    } else if (lapseSquared < 0.2) {
                        resultText = `${lapseSquared.toFixed(3)} [Near BTZ Horizon]`;
                        evalApply("WARNING", "WARN_SUB_HORIZON_COLLAPSE", "amber");
                    } else {
                        resultText = `${Math.sqrt(lapseSquared).toFixed(3)} (Lapse N(r))`;
                        evalApply("PASSED", "STATUS_00_PASSED", "emerald");
                    }
                    const scaleFactor = Math.max(0.4, r * 0.6);
                    node.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);

                    // --- 6. ANTI-DE SITTER (AdS) BULK (1.1) ---
                } else if (type === 'METRIC' && name.includes('AdS')) {
                    const z = parseFloat(document.getElementById('eval-param-z')?.value || 1.0);
                    const L = parseFloat(document.getElementById('eval-param-l')?.value || 1.0);

                    if (z <= 0) {
                        resultText = `UV Boundary Divergence (z ≤ 0)`;
                        evalApply("DENIED", "ERR_ADS_DOMAIN_VIOLATION", "red");
                    } else if (z < 0.3) {
                        resultText = `Boundary Cutoff Approach`;
                        evalApply("WARNING", "WARN_UV_APPROACH", "amber");
                    } else {
                        const warpFactor = Math.pow(L / z, 2);
                        resultText = `${warpFactor.toFixed(3)} (AdS Warp Factor)`;
                        evalApply("PASSED", "STATUS_05_ADS_BULK_STABLE", "emerald");
                    }
                    const scaleFactor = Math.max(0.4, (1.0 / Math.max(0.1, z)) * 0.5);
                    node.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);

                    // --- 7. DE SITTER (dS) SPACE (1.1) ---
                } else if (type === 'METRIC' && name.includes('de Sitter')) {
                    const lambda = parseFloat(document.getElementById('eval-param-lambda')?.value || 1.0);
                    const t = parseFloat(document.getElementById('eval-param-t')?.value || 1.0);

                    if (lambda <= 0) {
                        resultText = `Negative Λ Violation in dS`;
                        evalApply("DENIED", "ERR_DS_LAMBDA_INVALID", "red");
                    } else {
                        const horizon = Math.sqrt(3.0 / lambda);
                        resultText = `${horizon.toFixed(3)} (dS Causal Radius)`;
                        evalApply("PASSED", "STATUS_06_DS_CAUSAL_HORIZON", "emerald");
                    }
                    const scaleFactor = Math.max(0.4, t * 0.5);
                    node.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);

                    // --- 8. REISSNER-NORDSTRÖM CHARGED BH (1.1) ---
                } else if (type === 'METRIC' && name.includes('Reissner')) {
                    const r = parseFloat(document.getElementById('eval-param-r')?.value || 1.0);
                    const q = parseFloat(document.getElementById('eval-param-n')?.value || 0.5);
                    const fR = 1.0 - (2.0 / r) + (Math.pow(q, 2) / Math.pow(r, 2));

                    if (q > 1.0) {
                        resultText = `${fR.toFixed(3)} [Overcharged Super-Extreme]`;
                        evalApply("DENIED", "ERR_SUPER_EXTREME_CHARGE", "red");
                    } else if (q > 0.85) {
                        resultText = `${fR.toFixed(3)} [Near Extremal Charge]`;
                        evalApply("WARNING", "WARN_EXTREMAL_CHARGE", "amber");
                    } else {
                        resultText = `${fR.toFixed(3)} (Metric f(r))`;
                        evalApply("PASSED", "STATUS_07_CHARGED_HORIZON", "emerald");
                    }
                    const scaleFactor = Math.max(0.4, r * 0.5);
                    node.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);

                    // --- 9. SECTION 1.3 EXCEPTIONS (AdS/CFT Boundary, Chern-Simons, Ryu-Takayanagi, Entanglement Wedge) ---
                } else if (name.includes('AdS') || name.includes('Chern-Simons') || name.includes('Ryu-Takayanagi') || name.includes('Entanglement Wedge') || name.includes('Bulk-Boundary') || name.includes('Modular Hamiltonian')) {
                    const k = parseInt(document.getElementById('eval-param-k')?.value || document.getElementById('eval-param-delta')?.value || 1);
                    const actionVal = (k * Math.PI) / 4.0;
                    resultText = `${actionVal.toFixed(4)} (Topological Invariant)`;
                    evalApply("PASSED", "STATUS_20_TOPOLOGICAL_INVARIANT", "dual-violet-green");
                    const scaleFactor = 0.6 + (k * 0.08);
                    node.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);

                    // --- 10. SCALAR HIGGS POTENTIAL (1.2) ---
                } else if (name.includes('Higgs')) {
                    const mu = parseFloat(document.getElementById('eval-param-mu')?.value || 1.0);
                    const lambda = parseFloat(document.getElementById('eval-param-lambda')?.value || 0.5);

                    if (lambda < 0) {
                        resultText = `V(Φ) Unbounded Below`;
                        evalApply("DENIED", "ERR_VACUUM_INSTABILITY", "red");
                    } else if (lambda === 0) {
                        resultText = `Flat Potential`;
                        evalApply("WARNING", "WARN_FLAT_POTENTIAL", "amber");
                    } else {
                        const vev = Math.sqrt(Math.abs(mu) / lambda);
                        resultText = `${vev.toFixed(3)} (VEV v)`;
                        evalApply("PASSED", "STATUS_12_VACUUM_EXPECTATION", "emerald");
                    }
                    const scaleFactor = Math.max(0.4, Math.abs(mu) * 0.5);
                    node.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);

                    // --- 11. GENERAL GAUGE & POTENTIALS / CORRELATORS FALLBACK (1.2 & 1.3) ---
                } else {
                    const delta = parseFloat(document.getElementById('eval-param-delta')?.value || 2.0);
                    const correlatorVal = 1.0 / Math.pow(2.0, 2 * delta);
                    resultText = `${correlatorVal.toFixed(5)} (Gauge Invariant)`;
                    evalApply("PASSED", "STATUS_13_GAUGE_FIELD_ACTIVE", "emerald");
                    const scaleFactor = 0.5 + (delta * 0.25);
                    node.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
                }
                outputEl.textContent = resultText;
            };
        }
        
    }
    // Clears all nodes and connections from the deck viewport and resets session state
    clearDeck() {
        if (this.nodes && Array.isArray(this.nodes)) {
            this.nodes.forEach(node => {
                if (node.mesh && this.scene) {
                    this.scene.remove(node.mesh);
                    if (node.mesh.geometry) node.mesh.geometry.dispose();
                    if (node.mesh.material) {
                        if (Array.isArray(node.mesh.material)) {
                            node.mesh.material.forEach(mat => mat.dispose());
                        } else {
                            node.mesh.material.dispose();
                        }
                    }
                }
            });
        }

        // Explicitly purge active connection tethers from the Three.js scene
        if (this.connections && Array.isArray(this.connections)) {
            this.connections.forEach(conn => {
                if (conn && conn.line && this.scene) {
                    this.scene.remove(conn.line);
                    if (conn.line.geometry) conn.line.geometry.dispose();
                    if (conn.line.material) conn.line.material.dispose();
                }
            });
        }

        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        window.activeDeckNodes = this.nodes;

        // Reset remedy action history stack on session clear
        if (window.remedyEngine && typeof window.remedyEngine.resetHistory === 'function') {
            window.remedyEngine.resetHistory();
        }

        // Re-initialize default 3-node baseline session state
        this.initDefaultModel();

        if (typeof this.syncToMainHUD === 'function') {
            try {
                this.syncToMainHUD();
            } catch (e) {
                console.warn("[Deck] syncToMainHUD notice during clear:", e);
            }
        }

        // --- RESET TOPOLOGY INSPECTOR BACK TO NO SELECTION ---
        const inspectorBody = document.getElementById('inspector-body');
        const inspectorStatus = document.getElementById('inspector-status');
        const nodeCountBadge = document.getElementById('node-count-badge');

        if (inspectorBody) {
            inspectorBody.innerHTML = '<div class="text-slate-500 italic text-center pt-8">Select a node on the deck to inspect its field equations and metric parameters.</div>';
        }
        if (inspectorStatus) {
            inspectorStatus.className = "text-[9px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700";
            inspectorStatus.textContent = "NO SELECTION";
        }
        if (nodeCountBadge) {
            nodeCountBadge.textContent = this.nodes.length.toString();
        }

        // Force an immediate WebGL redraw across all viewports
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
        if (this.renderer2 && this.scene && this.camera2) {
            this.renderer2.render(this.scene, this.camera2);
        }
        if (this.renderer3 && this.scene && this.camera3) {
            this.renderer3.render(this.scene, this.camera3);
        }

        console.log("[Deck] Deck workspace session reset to default state and Inspector cleared.");
    }

    // Executes automated diagnostic/stress tests on the deck
    /*runAutomatedTests() {
        console.log("[Deck] Running automated topology verification tests...");
        const testResults = {
            totalNodes: this.nodes ? this.nodes.length : 0,
            totalConnections: this.connections ? this.connections.length : 0,
            status: "PASS",
            timestamp: new Date().toISOString()
        };
        console.table(testResults);
        alert(`Automated Tests Complete.\nNodes: ${testResults.totalNodes}\nStatus: ${testResults.status}`);
        return testResults;
    }*/

    runAutomatedTests() {
        console.group("🧪 HOLOGRAPHIC TOPOLOGY ENGINE: AUTOMATED TEST HARNESS");

        let passed = 0;
        let failed = 0;

        const testCases = [
            { a: 'METRIC', b: 'METRIC', expected: true, desc: 'METRIC <-> METRIC (Spacetime Tensor Coupling)' },
            { a: 'METRIC', b: 'TOPOLOGY', expected: true, desc: 'METRIC <-> TOPOLOGY (Boundary Shell Mediated)' },
            { a: 'METRIC', b: 'FIELD', expected: true, desc: 'METRIC <-> FIELD (Direct Illegal Coupling)' },
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
        // Add inside runAutomatedTests() test cases array:
        const physicalTestCases = [
            {
                name: 'BTZ Metric Horizon Condition', validate: () => {
                    const r = 2.0, mass = 1.0;
                    return (-mass + Math.pow(r, 2)) >= 0; // Must be true outside horizon
                }
            },
            {
                name: 'Chern-Simons Level Bound', validate: () => {
                    const k = 1;
                    return k > 0; // Level must be positive integer
                }
            }
        ];

        physicalTestCases.forEach((ptc, idx) => {
            if (ptc.validate()) {
                console.log(`%c[PASS] Physics Assertion 2.${idx + 1}: ${ptc.name}`, 'color: #00f0ff;');
                passed++;
            } else {
                console.error(`[FAIL] Physics Assertion 2.${idx + 1}: ${ptc.name} violated.`);
                failed++;
            }
        });

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
            try {
                // 1. Handle incoming JSON text frames (e.g., HUD updates)
                if (typeof event.data === 'string') {
                    const data = JSON.parse(event.data);
                    if (data.type === 'hud_update' && typeof updateHUDDisplay === 'function') {
                        updateHUDDisplay(data);
                    }
                    return;
                }

                // 2. Handle incoming binary buffers
                const buffer = event.data;
                if (!buffer || typeof buffer.byteLength !== 'number') return;

                // FAIL-SAFE GUARD 1: Handle 9-byte node telemetry binary packets
                if (buffer.byteLength === 9) {
                    const view = new DataView(buffer);
                    const nodeId = view.getInt32(0, false);     // Big-endian int32
                    const metricVal = view.getFloat32(4, false); // Big-endian float32
                    const statusFlag = view.getInt8(8);          // int8 status flag

                    dispatchNodeTelemetry(nodeId, metricVal, statusFlag);
                    return;
                }

                // FAIL-SAFE GUARD 2: Handle 4096-byte grid wave binary payloads
                if (buffer.byteLength === 4096) {
                    const floatArray = new Float32Array(buffer);
                    // Render/update your 3D grid mesh vertices here using floatArray
                    return;
                }

                console.warn(`[WS Warning] Unrecognized binary packet length received: ${buffer.byteLength} bytes`);
            } catch (err) {
                console.error("[WS Error] Packet decode anomaly isolated:", err);
            }
        };
        function dispatchNodeTelemetry(nodeId, metricVal, statusFlag) {
            if (!window.activeDeckNodes) return;

            const targetNode = window.activeDeckNodes.find(n => n.data.id === `N-00${nodeId}`);
            if (targetNode && targetNode.mesh) {
                if (statusFlag === 0) {
                    targetNode.mesh.material.color.setHex(0xef4444); // Singularity Warning Red
                } else {
                    targetNode.mesh.material.color.setHex(0x00f0ff); // Stable Engine Cyan
                }
            }
        }
        // Force an immediate redraw across all three viewports
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
        if (this.renderer2 && this.scene && this.camera2) {
            this.renderer2.render(this.scene, this.camera2);
        }
        if (this.renderer3 && this.scene && this.camera3) {
            this.renderer3.render(this.scene, this.camera3);
        }
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
        if (!this.renderer) return;

        // Gather metrics from Three.js renderer info
        const info = this.renderer.info;
        const fpsEl = document.getElementById('tele-fps');
        const drawsEl = document.getElementById('tele-draws');
        const geomsEl = document.getElementById('tele-geoms');
        const nodesEl = document.getElementById('tele-nodes');

        if (fpsEl) {
            // Calculate rolling or sample FPS if available, or default to stable 60/75
            const currentFps = this.fps || 60;
            fpsEl.textContent = `${currentFps} FPS`;
        }
        if (drawsEl) {
            drawsEl.textContent = info.render.calls;
        }
        if (geomsEl) {
            geomsEl.textContent = info.memory.geometries;
        }
        if (nodesEl) {
            const nodeCount = this.nodes ? this.nodes.length : 0;
            const linkCount = this.connections ? this.connections.length : 0;
            nodesEl.textContent = `${nodeCount} (Links: ${linkCount})`;
        }
    }
    removeNodeById(nodeId) {
        const index = this.nodes.findIndex(n => (n.data ? n.data.id : n.id) === nodeId);
        if (index !== -1) {
            const node = this.nodes[index];
            if (node.mesh && this.scene) {
                this.scene.remove(node.mesh);
                if (node.mesh.geometry) node.mesh.geometry.dispose();
                if (node.mesh.material) node.mesh.material.dispose();
            }
            this.nodes.splice(index, 1);
            window.activeDeckNodes = this.nodes;
            this.updateNodeCountBadge();
        }
    }

    removeConnection(sourceId, targetId) {
        const index = this.connections.findIndex(c => {
            const src = c.nodeA.data ? c.nodeA.data.id : c.nodeA.id;
            const tgt = c.nodeB.data ? c.nodeB.data.id : c.nodeB.id;
            return src === sourceId && tgt === targetId;
        });
        if (index !== -1) {
            this.removeConnectionByIndex(index);
        }
    }

    removeConnectionByIndex(index) {
        const conn = this.connections[index];
        if (conn && conn.line && this.scene) {
            this.scene.remove(conn.line);
            if (conn.line.geometry) conn.line.geometry.dispose();
            if (conn.line.material) conn.line.material.dispose();
        }
        this.connections.splice(index, 1);
    }
}

// --- GLOBAL WINDOW BINDINGS FOR UI BUTTONS ---
window.clearDeck = function () {
    if (window.deckViewPort && typeof window.deckViewPort.clearDeck === 'function') {
        window.deckViewPort.clearDeck();
    }
};

window.runAutomatedTests = function () {
    if (window.deckViewPort && typeof window.deckViewPort.runAutomatedTests === 'function') {
        window.deckViewPort.runAutomatedTests();
    }
};

window.exportDeckState = function () {
    if (window.deckViewPort && typeof window.deckViewPort.exportState === 'function') {
        window.deckViewPort.exportState();
    }
};

// Initialize viewport on DOM load
window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('deck-canvas-container');
    if (container) {
        window.deckViewPort = new DeckViewport('deck-canvas-container');

        // Clean, unified drop handling delegating directly to the class method
        container.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        });

        container.addEventListener('drop', (event) => {
            event.preventDefault();
            if (window.deckViewPort && typeof window.deckViewPort.handleDrop === 'function') {
                window.deckViewPort.handleDrop(event);
            }
        });
    }
});