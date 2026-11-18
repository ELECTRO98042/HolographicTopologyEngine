// =============================================================================
// hud_render.js — Holographic Topology Engine GPU Renderer (Three.js)
// -----------------------------------------------------------------------------
// All screen rendering (spectral shells, floor grid, nodes, tethers, overlays,
// gimbal) lives here.
// =============================================================================

import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { ReferenceFrameManager } from '/physics/reference_frames.js';
import { SubatomicNodeFactory } from '/physics/rendermath/index.js';
import { ThermalOverlay } from '/physics/visuals/thermal_overlay.js';
import { EmpOverlay } from '/physics/visuals/emp_overlay.js';
import { QETetherManager } from '/physics/visuals/qe_tether_manager.js';
import { AdSOverlay } from '/physics/visuals/ads_overlay.js';
import { SNROverlay } from '../physics/visuals/snr_overlay.js';

const subatomicFactory = new SubatomicNodeFactory();
const nodeRenderGroups = new Map();
window.__nodeRenderGroups = nodeRenderGroups;

// -----------------------------------------------------------------------------
// Constants & States
// -----------------------------------------------------------------------------
const MAX_NODES = 32;
const MAX_TETHERS = 48;
const MAX_PAIRS = 1200;
const SEGMENTS_PER_TETHER = 18;
const VERTS_PER_TETHER = SEGMENTS_PER_TETHER * 2;
const MAX_NODE_INSTANCES = 2048;

const REST_DIST = 90.0;
const FLOOR_Y = -80.0;
const BASE_SPAN = 250.0;

// -----------------------------------------------------------------------------
// Module state
// -----------------------------------------------------------------------------
let initialized = false;
let renderer = null;
let labelRenderer = null;
let scene = null;
let camera = null;

let gizmoRenderer = null;
let gizmoScene = null;
let gizmoCamera = null;

let shellMaterial = null;
let shellMode = null;

let floorGrid = null;
let floorKey = '';

let nodeMesh = null;
let nodeGlow = null;
let dummyObject = null;
const nodeLabels = new Map();
const labelColor = new THREE.Color();

let tetherGeometry = null;
let tetherLines = null;
let tetherPositions = null;
let tetherColors = null;

let auraGeometry = null;
let auraLines = null;
let auraPositions = null;
let auraColors = null;

let ghostGeometry = null;
let ghostLines = null;
let ghostPositions = null;
let ghostColors = null;

let monoGeometry = null;
let monoPoints = null;
let monoPositions = null;
const MONO_PER_TETHER = 3;

let vaporPoints = null;
let vaporMaterial = null;
const VAPOR_COUNT = 12000;

let empMesh = null;
const EMP_RINGS_PER_NODE = 2;
const MAX_EMP_NODES = 8;

let thermalOverlay = null;
let empOverlay = null;
let qeTetherManager = null;
let snrOverlay = null;

let dopplerGeometry = null;
let dopplerLines = null;
let dopplerPositions = null;
let dopplerColors = null;

let raycaster = null;
let pointerNDC = new THREE.Vector2();
let dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let dragPoint = new THREE.Vector3();
let dragNode = null;
let isGizmoDragging = false;
let gizmoLastX = 0;
let gizmoLastY = 0;

let simulationTime = 0;
let lastTimestamp = performance.now();
let frameHandle = null;

const cameraState = {
    rotX: 0.3,
    rotY: 0.0,
    rotZ: 0.0,
    distance: 800
};

const fieldNodePos = Array.from({ length: MAX_NODES }, () => new THREE.Vector3());
const fieldNodeVel = Array.from({ length: MAX_NODES }, () => new THREE.Vector3());
const fieldNodeHot = new Array(MAX_NODES).fill(0);
const fieldTetherMid = Array.from({ length: MAX_TETHERS }, () => new THREE.Vector3());

const tempVec = new THREE.Vector3();
const tempColor = new THREE.Color();

// -----------------------------------------------------------------------------
// Initialisation
// -----------------------------------------------------------------------------
let adsOverlay = null;
export function initHUDRenderer(options = {}) {
    if (initialized) return getAPI();

    const canvas = options.canvas || document.getElementById('hudCanvas');
    if (!canvas) throw new Error('[HUD Renderer] Missing #hudCanvas');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05050a);
    scene.fog = new THREE.FogExp2(0x05050a, 0.00055);

    window.referenceFrameManager = new ReferenceFrameManager(scene);
    window.referenceFrameManager.switchFrame('open', 1.0);

    qeTetherManager = new QETetherManager(scene);
    adsOverlay = new AdSOverlay(scene, window.referenceFrameManager, '#deck-body-content');
    thermalOverlay = new ThermalOverlay(scene, window.referenceFrameManager, '#deck-body-content');
    empOverlay = new EmpOverlay(scene, window.referenceFrameManager, '#deck-body-content');
    snrOverlay = new SNROverlay(scene, window.referenceFrameManager, '#deck-body-content');
    window.snrOverlay = snrOverlay;

    window.toggleThermalOverlay = function (active) {
        if (!thermalOverlay) return;
        if (active) {
            thermalOverlay.enable();
            setOverlays({ thermal: true });
        } else {
            thermalOverlay.disable();
            setOverlays({ thermal: false });
        }
    };

    window.toggleEmpOverlay = function (active) {
        if (!empOverlay) return;
        if (active) {
            empOverlay.enable();
            setOverlays({ emp: true });
        } else {
            empOverlay.disable();
            setOverlays({ emp: false });
        }
    };

    camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 1, 6000);
    camera.position.set(0, 180, 480);

    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x05050a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    const labelContainer = labelRenderer.domElement;
    labelContainer.style.position = 'fixed';
    labelContainer.style.top = '0';
    labelContainer.style.left = '0';
    labelContainer.style.pointerEvents = 'none';
    labelContainer.style.zIndex = '20';
    document.body.appendChild(labelContainer);

    dummyObject = new THREE.Object3D();
    raycaster = new THREE.Raycaster();

    buildNodeMeshes();
    // Create particle buffer geometry for point sprites
    const glowGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_NODE_INSTANCES * 3);
    glowGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const glowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(0xffffff) },
            uIntensity: { value: 1.0 }
        },
        vertexShader: `
            attribute vec3 instanceColor;
            attribute float instanceSize;
            varying vec3 vColor;
            void main() {
                vColor = instanceColor;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                // Scale point size based on distance and individual node radius/speed
                gl_PointSize = instanceSize * (300.0 / -mvPosition.z);
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            void main() {
                float dist = distance(gl_PointCoord, vec2(0.5));
                if (dist > 0.5) discard;
                
                // True radial gradient: 45% luminous core fading smoothly to 1% at outer edge
                float falloff = smoothstep(0.5, 0.0, dist);
                float alpha = mix(0.01, 0.45, falloff);
                
                gl_FragColor = vec4(vColor, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
    });

    // Add custom attributes for instanced color and size per point
    glowGeometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(new Float32Array(MAX_NODE_INSTANCES * 3), 3));
    glowGeometry.setAttribute('instanceSize', new THREE.InstancedBufferAttribute(new Float32Array(MAX_NODE_INSTANCES), 1));

    nodeGlow = new THREE.Points(glowGeometry, glowMaterial);
    scene.add(nodeGlow);

    buildTetherMeshes();
    buildVaporField();
    // buildEMPField();
    buildDopplerField();
    buildShell(options.mode || 'open');
    buildGizmo(options.gizmoCanvas || document.getElementById('gizmoCanvas'));

    // Ensure empOverlay is initialized here:
    empOverlay = new EmpOverlay(scene, window.referenceFrameManager, '#deck-body-content');

    attachMainCanvasEvents(canvas);
    attachGizmoEvents(options.gizmoCanvas || document.getElementById('gizmoCanvas'));
    window.addEventListener('resize', handleResize);

    initialized = true;
    handleResize();
    setRenderMode(options.mode || 'open');
    lastTimestamp = performance.now();
    frameHandle = requestAnimationFrame(animationLoop);

    const api = getAPI();
    window.HUDRenderer = api;
    window.hudViewport = api;
    return api;
}

export function setColorPalette(schema) {
    if (!window.hudConfig) window.hudConfig = {};
    const targetSchema = schema || 'dynamic';
    window.hudConfig.colorPalette = targetSchema;

    // Sanitize and clear stale overlay flags when returning to dynamic
    if (!window.hudConfig.overlays) window.hudConfig.overlays = {};
    if (targetSchema === 'dynamic') {
        window.hudConfig.overlays.qe = false;
        window.hudConfig.overlays.quantumEntanglement = false;
        window.hudConfig.overlays.ads = false;
    }

    if (shellMaterial && shellMaterial.uniforms && shellMaterial.uniforms.uColorSchema) {
        const paletteModes = {
            'dynamic': 0, 'qe': 1, 'ads': 2, 'snr': 3,
            'thermal': 4, 'em': 5, 'doppler': 6, 'tension': 7,
            'vacuum': 8, 'composite': 9
        };
        shellMaterial.uniforms.uColorSchema.value = paletteModes[targetSchema] !== undefined ? paletteModes[targetSchema] : 0;
        shellMaterial.uniforms.uColorSchema.needsUpdate = true;
    }
}

export function setOverlays(overlays) {
    if (!window.hudConfig) window.hudConfig = {};
    window.hudConfig.overlays = Object.assign({}, window.hudConfig.overlays || {}, overlays || {});
}

function getAPI() {
    return {
        setMode: setRenderMode,
        resetCamera: resetRenderCamera,
        setColorPalette,
        setOverlays,
        getCameraState: () => ({ ...cameraState }),
        setCameraState: (next = {}) => {
            Object.assign(cameraState, next);
            updateCamera();
        },
        getRenderer: () => renderer,
        getScene: () => scene,
        getCamera: () => camera
    };
}

// -----------------------------------------------------------------------------
// Camera / viewport
// -----------------------------------------------------------------------------
function updateCamera() {
    const radius = cameraState.distance * 0.6;
    const pitch = cameraState.rotX;
    const yaw = cameraState.rotY;
    const cosPitch = Math.cos(pitch);

    camera.position.set(
        radius * Math.sin(yaw) * cosPitch,
        radius * Math.sin(pitch),
        radius * Math.cos(yaw) * cosPitch
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.rotateZ(cameraState.rotZ);
}

function handleResize() {
    if (!renderer || !camera) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (labelRenderer) labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

export function resetRenderCamera() {
    cameraState.rotX = 0.3;
    cameraState.rotY = 0.0;
    cameraState.rotZ = 0.0;
    cameraState.distance = 800;
}

export function setRenderMode(mode) {
    const nextMode = mode || 'open';
    window.hudMode = nextMode;

    if (window.referenceFrameManager && window.referenceFrameManager.activeFrameType === nextMode) {
        window.referenceFrameManager.setScale(window.hudConfig?.worldScale || 1.0);
        return;
    }

    buildShell(nextMode);
}

// -----------------------------------------------------------------------------
// 3D Gimbal
// -----------------------------------------------------------------------------
function buildGizmo(canvas) {
    if (!canvas) return;

    gizmoRenderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'low-power'
    });
    gizmoRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    gizmoRenderer.setSize(192, 100);
    gizmoRenderer.setClearColor(0x020205, 1);
    gizmoRenderer.outputColorSpace = THREE.SRGBColorSpace;

    gizmoScene = new THREE.Scene();
    gizmoCamera = new THREE.PerspectiveCamera(42, 192 / 100, 0.1, 100);

    const axes = [
        { dir: new THREE.Vector3(1, 0, 0), color: 0xff0055 },
        { dir: new THREE.Vector3(0, 1, 0), color: 0x00ffcc },
        { dir: new THREE.Vector3(0, 0, 1), color: 0x0066ff }
    ];

    axes.forEach(axis => {
        const arrow = new THREE.ArrowHelper(axis.dir, new THREE.Vector3(), 1.15, axis.color, 0.32, 0.18);
        gizmoScene.add(arrow);
        const tip = new THREE.Mesh(
            new THREE.SphereGeometry(0.07, 8, 6),
            new THREE.MeshBasicMaterial({ color: axis.color })
        );
        tip.position.copy(axis.dir).multiplyScalar(1.15);
        gizmoScene.add(tip);
    });

    gizmoScene.add(new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    ));
}

function renderGizmo() {
    if (!gizmoRenderer || !gizmoScene || !gizmoCamera) return;
    const dir = tempVec.copy(camera.position).normalize();
    gizmoCamera.position.copy(dir).multiplyScalar(3.4);
    gizmoCamera.up.set(0, 1, 0);
    gizmoCamera.lookAt(0, 0, 0);
    gizmoCamera.rotateZ(cameraState.rotZ);
    gizmoRenderer.render(gizmoScene, gizmoCamera);
}

function attachGizmoEvents(canvas) {
    if (!canvas) return;

    canvas.addEventListener('pointerdown', (event) => {
        isGizmoDragging = true;
        gizmoLastX = event.clientX;
        gizmoLastY = event.clientY;
        canvas.setPointerCapture?.(event.pointerId);
        canvas.style.cursor = 'grabbing';
        event.preventDefault();
    });

    canvas.addEventListener('pointermove', (event) => {
        if (!isGizmoDragging) return;
        const deltaX = event.clientX - gizmoLastX;
        const deltaY = event.clientY - gizmoLastY;

        cameraState.rotY += deltaX * 0.02;
        cameraState.rotX += deltaY * 0.02;
        cameraState.rotX = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, cameraState.rotX));

        gizmoLastX = event.clientX;
        gizmoLastY = event.clientY;
    });

    const endDrag = (event) => {
        if (!isGizmoDragging) return;
        isGizmoDragging = false;
        canvas.releasePointerCapture?.(event.pointerId);
        canvas.style.cursor = 'grab';
    };

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.style.touchAction = 'none';
}

// -----------------------------------------------------------------------------
// Spectral reference manifolds
// -----------------------------------------------------------------------------
function buildShell(mode) {
    shellMode = mode || 'open';

    if (!shellMaterial) {
        shellMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uScale: { value: 1 },
                uWarp: { value: 1 },
                uOpacity: { value: 1 },
                uNodes: { value: Array.from({ length: MAX_NODES }, () => new THREE.Vector3()) },
                uNodeCount: { value: 0 },
                uColorSchema: { value: 0 }
            },
            vertexShader: `
                uniform float uTime;
                uniform float uScale;
                uniform float uWarp;
                uniform int uColorSchema;
                uniform vec3 uNodes[${MAX_NODES}];
                uniform int uNodeCount;

                varying vec3 vColor;
                varying float vHighlight;

                void main() {
                    vec3 p = position * uScale;
                    vec3 radial = normalize(p + vec3(0.0001));
                    float harmonic = sin(p.y * 0.045 + uTime * 0.7) * 1.6
                                   + cos(p.x * 0.040 - uTime * 0.5) * 1.25;
                    p += radial * harmonic;

                    float highlight = 0.0;
                    for (int i = 0; i < ${MAX_NODES}; i++) {
                        if (i >= uNodeCount) break;
                        vec3 node = uNodes[i];
                        float dist = distance(p, node);
                        if (dist < 120.0) {
                            float falloff = (120.0 - dist) / 120.0;
                            p += normalize(p - node + vec3(0.0001)) * falloff * 8.0 * uWarp;
                            highlight = max(highlight, falloff);
                        }
                    }

                    vHighlight = highlight;

                    // --- Dynamic Schema Color Routing ---
                    vec3 col = color; // fallback to geometry base
                    if (uColorSchema == 1) {
                        col = vec3(0.61, 0.30, 0.87); // QE Purple
                    } else if (uColorSchema == 2) {
                        col = vec3(0.54, 0.36, 0.96); // AdS Violet
                    } else if (uColorSchema == 3) {
                        col = vec3(0.06, 0.72, 0.50); // SNR Emerald
                    } else {
                        col = vec3(0.08, 0.50, 0.75); // Clean Default / Dynamic Blue-Cyan
                    }

                    vColor = col;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uOpacity;
                varying vec3 vColor;
                varying float vHighlight;

                void main() {
                    vec3 col = mix(vColor, vec3(1.0), vHighlight * 0.55);
                    float alpha = (0.24 + vHighlight * 0.32) * uOpacity;
                    gl_FragColor = vec4(col, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true
        });
    }

    if (window.referenceFrameManager) {
        const currentScale = window.hudConfig?.worldScale || 1.0;
        window.referenceFrameManager.switchFrame(shellMode, currentScale);
    }
}
function createRadialGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    // Inner luminous core (15-20% opacity) fading smoothly to 1% at the outer boundary
    gradient.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
    gradient.addColorStop(0.25, 'rgba(255, 255, 255, 0.40)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.12)');
    gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.01)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}
// -----------------------------------------------------------------------------
// Nodes + labels
// -----------------------------------------------------------------------------
function buildNodeMeshes() {
    const geometry = new THREE.SphereGeometry(1, 16, 12);
    const material = new THREE.MeshBasicMaterial({
        toneMapped: false,
        transparent: false
    });

    nodeMesh = new THREE.InstancedMesh(geometry, material, MAX_NODE_INSTANCES);
    nodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    nodeMesh.frustumCulled = false;
    nodeMesh.count = 0;

    const glowGeometry = new THREE.SphereGeometry(1, 16, 12);
    const glowTexture = createRadialGlowTexture();

    const glowMaterial = new THREE.MeshBasicMaterial({
        map: glowTexture,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide
    });


    nodeGlow = new THREE.InstancedMesh(glowGeometry, glowMaterial, MAX_NODE_INSTANCES);
    nodeGlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    nodeGlow.frustumCulled = false;
    nodeGlow.count = 0;

    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < MAX_NODE_INSTANCES; i++) {
        nodeMesh.setColorAt(i, white);
        nodeGlow.setColorAt(i, white);
    }

    scene.add(nodeGlow);
    scene.add(nodeMesh);
}

function getNodeLabel(node) {
    const key = node.id || node.name || 'anonymous';
    let label = nodeLabels.get(key);
    if (label) return label;

    const element = document.createElement('div');
    element.className = 'hud-node-label';
    element.style.position = 'absolute';
    element.style.font = '10px "Courier New", monospace';
    element.style.color = 'rgba(255,255,255,0.88)';
    element.style.textShadow = '0 0 6px rgba(0,255,204,0.55)';
    element.style.pointerEvents = 'none';
    element.style.whiteSpace = 'nowrap';
    element.style.transform = 'translate(-50%, -50%)';
    element.style.zIndex = '20';

    label = new CSS2DObject(element);
    label.center.set(0, 0.5);
    label.userData.key = key;
    scene.add(label);
    nodeLabels.set(key, label);
    return label;
}

function updateNodeLabels(nodes, worldScale, visibleSet, resolvedColors) {
    nodeLabels.forEach((label, key) => {
        if (!visibleSet.has(key)) label.visible = false;
    });

    nodes.forEach((node, idx) => {
        const key = node.id || node.name || `node-${idx}`;
        visibleSet.add(key);
        const label = getNodeLabel(node);
        label.visible = true;
        const nx = node.position ? node.position.x : (node.x || 0);
        const ny = node.position ? node.position.y : (node.y || 0);
        const nz = node.position ? node.position.z : (node.z || 0);
        label.position.set(
            nx * worldScale + 8,
            ny * worldScale + 4,
            nz * worldScale
        );
        const el = label.element;
        const text = (node.data && node.data.name) ? node.data.name : (node.name || node.id || 'N-001');
        if (el.textContent !== text) el.textContent = text;
        const c = resolvedColors[idx] || labelColor.set(node.color || '#10b981');
        el.style.color = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, 0.95)`;
    });
}
function resolveSchemaNodeColor(node, palette, speed, isCore, outColor) {
    const baseHex = node.color || (isCore ? '#ffffff' : '#10b981');
    switch (palette) {
        case 'qe':
            outColor.set(isCore ? '#38bdf8' : '#a855f7');
            break;
        case 'ads':
            outColor.set(isCore ? '#facc15' : '#8b5cf6');
            break;
        case 'snr':
            outColor.set((node.entropy !== undefined && node.entropy < 0) ? '#ef4444' : '#10b981');
            break;
        case 'thermal':
            if (speed > 1.0 || isCore) outColor.setRGB(1.0, 0.32, 0.08);
            else outColor.setRGB(0.28, 0.52, 1.0);
            break;
        case 'em':
            outColor.set(isCore ? '#00f0ff' : '#3b82f6');
            break;
        case 'doppler':
            outColor.set((node.vx || 0) >= 0 ? '#06b6d4' : '#f43f5e');
            break;
        case 'tension':
            outColor.set(node.isPinned ? '#f59e0b' : '#00ffcc');
            break;
        case 'vacuum':
            outColor.set('#34d399');
            break;
        case 'composite':
            outColor.set(isCore ? '#ffffff' : '#c084fc');
            break;
        case 'dynamic':
        default:
            outColor.set(baseHex);
            break;
    }
    return outColor;
}
// Node & Point Sprite Color Assignment (updateNodes): Maps node positions, sizes, and point-sprite aura glow colors (nodeGlow).
function updateNodes(nodes, worldScale, palette, overlays, intensity) {
    const count = Math.min(nodes.length, MAX_NODE_INSTANCES);
    const visibleSet = new Set();
    const resolvedColors = new Array(count);

    nodeMesh.count = count;

    const empActive = !!(overlays.emp || overlays.em || palette === 'em');
    const thermalActive = !!overlays.thermal || palette === 'thermal';
    const waveActive = !!overlays.wave; // <--- Add this back
    const qeActive = !!(overlays.qe || overlays.quantumEntanglement || palette === 'qe');
    const compositeActive = palette === 'composite';
    const activeKeys = new Set();

    const cameraDistance = camera ? camera.position.distanceTo(new THREE.Vector3(0, 0, 0)) : 480;
    const time = simulationTime || 0;
    const dt = 0.016;

    const layerStates = {
        surfaceMesh: true,
        subModels: true,
        ghostMesh: true,
        referenceShells: true,
        tethers: true,
        tensors: true,
        volumetricPulses: true,
        observerCollapse: cameraDistance < 6.0
    };

    // Fetch buffer attribute references once before the loop
    const positionsAttr = nodeGlow.geometry.attributes.position;
    const colorsAttr = nodeGlow.geometry.attributes.instanceColor;
    const sizesAttr = nodeGlow.geometry.attributes.instanceSize;

    for (let i = 0; i < count; i++) {
        const node = nodes[i];
        const isCore = node.tier === 'BULK_CORE' || node.isCore;
        const speed = Math.sqrt(
            (node.vx || 0) ** 2 + (node.vy || 0) ** 2 + (node.vz || 0) ** 2
        );
        const radius = (isCore ? 8.0 : 5.0) * (0.9 + Math.min(0.35, speed * 0.05));
        const x = (node.position ? node.position.x : node.x || 0) * worldScale;
        const y = (node.position ? node.position.y : node.y || 0) * worldScale;
        const z = (node.position ? node.position.z : node.z || 0) * worldScale;

        // 1. Update solid node mesh matrix (unchanged)
        dummyObject.position.set(x, y, z);
        dummyObject.scale.setScalar(radius);
        dummyObject.rotation.set(0, 0, 0);
        dummyObject.updateMatrix();
        nodeMesh.setMatrixAt(i, dummyObject.matrix);

        const nodeCol = resolveSchemaNodeColor(node, palette, speed, isCore, new THREE.Color());
        if (window.selectedNode === node) {
            nodeCol.setHex(0xfacc15);
        }
        resolvedColors[i] = nodeCol;
        nodeMesh.setColorAt(i, nodeCol);

        // 2. Set point sprite position directly
        positionsAttr.setXYZ(i, x, y, z);

        let glowRadius = radius * 2.5;
        tempColor.copy(nodeCol);

        if (empActive) {
            tempColor.setRGB(0.55, 0.98, 1.0);
            glowRadius = radius * 3.6;
        } else if (thermalActive) {
            // =========================================================================
            // THREE-TIER THERMAL SCHEMA (Amplitude-Scaled Radiance)
            // =========================================================================
            if (speed > 1.8) {
                // HOT: Bright sky-blue to white radiance
                tempColor.setRGB(0.85, 0.95, 1.0);
                glowRadius = radius * 5.5;
            } else if (speed > 0.7) {
                // MEDIUM: Yellow to orange transition
                tempColor.setRGB(1.0, 0.65, 0.15);
                glowRadius = radius * 4.2;
            } else {
                // LOW: Red to red-brown gradient
                tempColor.setRGB(0.65, 0.20, 0.10);
                glowRadius = radius * 3.2;
            }

            // Clean scalar intensity without compounding distortion
            tempColor.multiplyScalar(Math.max(0.5, intensity));
        } else if (qeActive || palette === 'qe') {
            tempColor.setHex(0xa855f7); // Or 0x7b2cbf for deep violet
            glowRadius = radius * 3.2;
        } else if (waveActive) {
            tempColor.setRGB(0.0, 1.0, 0.94);
            glowRadius = radius * 3.2;
        } else if (compositeActive) {
            glowRadius = radius * 3.8;
        }

        if (!thermalActive) {
            tempColor.multiplyScalar(0.55 * Math.max(0.25, intensity));
        }

        // 3. Assign color and point size to the point sprite attribute buffers
        colorsAttr.setXYZ(i, tempColor.r, tempColor.g, tempColor.b);
        sizesAttr.setX(i, glowRadius * 14.0); // Scale multiplier for point sprite pixel sizing

        const key = node.id || node.name || `node-${i}`;
        activeKeys.add(key);
        let renderGroup = nodeRenderGroups.get(key);
        if (!renderGroup) {
            renderGroup = new THREE.Group();
            scene.add(renderGroup);

            let qftType = node.qftType;
            if (!qftType) {
                if (node.id === 'N-001') qftType = 'ENTANGLEMENT_PAIR';
                else if (node.id === 'N-002' || isCore) qftType = 'GRAVITON_TENSOR';
                else if (node.id === 'N-003') qftType = 'ELECTRON_DIRAC';
                else qftType = 'QUARK_TRIAD';
            }

            subatomicFactory.attachRenderer(renderGroup, qftType);
            renderGroup.scale.setScalar(7.0 * worldScale);
            nodeRenderGroups.set(key, renderGroup);
        }
        renderGroup.position.set(x, y, z);
        renderGroup.visible = true;

        subatomicFactory.updateNode(renderGroup, time, dt, layerStates, cameraDistance, palette, nodeCol);
    }

    nodeRenderGroups.forEach((group, key) => {
        if (!activeKeys.has(key)) {
            scene.remove(group);
            group.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            nodeRenderGroups.delete(key);
        }
    });

    // Update matrix flags for standard instanced node mesh
    nodeMesh.instanceMatrix.needsUpdate = true;
    if (nodeMesh.instanceColor) nodeMesh.instanceColor.needsUpdate = true;

    // Update geometry draw range for points if count changes
    nodeGlow.geometry.setDrawRange(0, count);

    // Point sprite buffer updates (removed invalid instanceMatrix calls)
    nodeGlow.geometry.attributes.position.needsUpdate = true;
    nodeGlow.geometry.attributes.instanceColor.needsUpdate = true;
    nodeGlow.geometry.attributes.instanceSize.needsUpdate = true;

    updateNodeLabels(nodes, worldScale, visibleSet, resolvedColors);
}
// -----------------------------------------------------------------------------
// Tethers
// -----------------------------------------------------------------------------
function makeDynamicLines(maxVerts, opacity, size = 1) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(maxVerts * 3);
    const colors = new Float32Array(maxVerts * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);

    const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
    });

    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    scene.add(lines);
    return { geometry, positions, colors, lines, material, size };
}

function buildTetherMeshes() {
    const tail = makeDynamicLines(MAX_PAIRS * VERTS_PER_TETHER, 0.72);
    tetherGeometry = tail.geometry;
    tetherPositions = tail.positions;
    tetherColors = tail.colors;
    tetherLines = tail.lines;

    const aura = makeDynamicLines(MAX_PAIRS * 2, 0.26);
    auraGeometry = aura.geometry;
    auraPositions = aura.positions;
    auraColors = aura.colors;
    auraLines = aura.lines;
    auraLines.visible = false;

    const ghost = makeDynamicLines(MAX_PAIRS * 4, 0.30);
    ghostGeometry = ghost.geometry;
    ghostPositions = ghost.positions;
    ghostColors = ghost.colors;
    ghostLines = ghost.lines;
    ghostLines.visible = false;

    monoGeometry = new THREE.BufferGeometry();
    monoPositions = new Float32Array(MAX_PAIRS * MONO_PER_TETHER * 3);
    monoGeometry.setAttribute('position', new THREE.BufferAttribute(monoPositions, 3).setUsage(THREE.DynamicDrawUsage));
    monoGeometry.setDrawRange(0, 0);
    monoPoints = new THREE.Points(monoGeometry, new THREE.PointsMaterial({
        color: 0xeab308,
        size: 3.4,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
    }));
    monoPoints.frustumCulled = false;
    monoPoints.visible = false;
    scene.add(monoPoints);
}

function buildPairList(nodes, edges, worldScale) {
    window.buildPairList = buildPairList;
    const pairs = [];

    const makePair = (a, b) => {
        const axRaw = a.position ? a.position.x : (a.x || 0);
        const ayRaw = a.position ? a.position.y : (a.y || 0);
        const azRaw = a.position ? a.position.z : (a.z || 0);
        const bxRaw = b.position ? b.position.x : (b.x || 0);
        const byRaw = b.position ? b.position.y : (b.y || 0);
        const bzRaw = b.position ? b.position.z : (b.z || 0);

        const ax = axRaw * worldScale;
        const ay = ayRaw * worldScale;
        const az = azRaw * worldScale;
        const bx = bxRaw * worldScale;
        const by = byRaw * worldScale;
        const bz = bzRaw * worldScale;

        const dx = bx - ax;
        const dy = by - ay;
        const dz = bz - az;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const rawDist = Math.sqrt((bxRaw - axRaw) ** 2 + (byRaw - ayRaw) ** 2 + (bzRaw - azRaw) ** 2);

        return {
            ax, ay, az, bx, by, bz,
            dx, dy, dz, dist, rawDist,
            tension: Math.min(1.0, Math.abs(rawDist - REST_DIST) / REST_DIST)
        };
    };

    if (Array.isArray(edges) && edges.length > 0) {
        const nodeMap = new Map();
        nodes.forEach((n, idx) => {
            if (n.id) nodeMap.set(String(n.id), n);
            if (n.name) nodeMap.set(String(n.name), n);
            nodeMap.set(idx, n);
        });

        for (let i = 0; i < edges.length; i++) {
            const e = edges[i];
            const srcKey = typeof e.source === 'object' && e.source !== null ? (e.source.id || e.source.name) : (e.source ?? e.from);
            const tgtKey = typeof e.target === 'object' && e.target !== null ? (e.target.id || e.target.name) : (e.target ?? e.to);
            const a = nodeMap.get(String(srcKey)) || (typeof srcKey === 'number' ? nodes[srcKey] : null);
            const b = nodeMap.get(String(tgtKey)) || (typeof tgtKey === 'number' ? nodes[tgtKey] : null);
            if (a && b && a !== b) {
                pairs.push(makePair(a, b));
            }
        }
    }

    if (pairs.length === 0) {
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                pairs.push(makePair(nodes[i], nodes[j]));
            }
        }
    }

    if (pairs.length > MAX_PAIRS) {
        pairs.sort((a, b) => a.dist - b.dist);
        pairs.length = MAX_PAIRS;
    }
    return pairs;
}

function pushVertex(positions, colors, index, x, y, z, color) {
    const offset = index * 3;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
    return index + 1;
}

function updateTethers(pairs, time, interpMode, palette, overlays, intensity, noiseThresh = 0.05) {
    let vi = 0;
    const stepMode = interpMode === 'discrete';
    const waveScale = interpMode === 'spline' ? 1.5 : 1.0;
    const primaryCol = new THREE.Color(0x06b6d4);
    const highTensionCol = new THREE.Color(0xff8c00);
    const color = new THREE.Color();

    if (palette === 'qe') { primaryCol.set(0xa855f7); highTensionCol.set(0xc77dff); }
    else if (palette === 'ads') { primaryCol.set(0x8b5cf6); highTensionCol.set(0xfacc15); }
    else if (palette === 'snr') { primaryCol.set(0x10b981); highTensionCol.set(0xef4444); }
    else if (palette === 'thermal') { primaryCol.set(0x3b82f6); highTensionCol.set(0xf97316); }
    else if (palette === 'em') { primaryCol.set(0x00f0ff); highTensionCol.set(0x3b82f6); }
    else if (palette === 'doppler') { primaryCol.set(0x06b6d4); highTensionCol.set(0xf43f5e); }
    else if (palette === 'tension') { primaryCol.set(0x00ffcc); highTensionCol.set(0xf59e0b); }
    else if (palette === 'vacuum') { primaryCol.set(0x34d399); highTensionCol.set(0x6ee7b7); }

    const auraActive = palette === 'ads' || palette === 'qe' || palette === 'composite' || !!overlays.ads;
    const signalParticlesActive = palette === 'snr' || palette === 'em' || palette === 'composite' || !!overlays.snr;
    const multipathActive = !!overlays.multipath;
    const waveOverlay = !!overlays.wave || !!overlays.qe;
    const noiseAttenuation = Math.max(0.2, 1.0 - noiseThresh * 1.5);

    let ai = 0;
    let gi = 0;
    let mi = 0;

    for (let p = 0; p < pairs.length; p++) {
        const pair = pairs[p];
        const { ax, ay, az, bx, by, bz, dx, dy, dz, dist, tension } = pair;
        if (dist < 0.001) continue;
        // Tether Gradient & Style Routing (updateTethers): Line geometry, tension colors, aura passes, and signal particle flow along node connections.
        color.copy(tension > 0.55 ? highTensionCol : primaryCol);

        // GPU Vapor Field Shaders (buildVaporField & updateVaporField): Volumetric background haze, atmospheric particle density, and dynamic glow passes.
        if (stepMode) {
            const steps = 8;
            for (let s = 0; s < steps; s++) {
                const t0 = s / steps;
                const t1 = (s + 1) / steps;
                const x0 = ax + dx * t0;
                const y0 = ay + dy * t0;
                const z0 = az + dz * t0;
                const x1 = ax + dx * t1;
                const y1 = ay + dy * t1;
                const z1 = az + dz * t1;
                vi = pushVertex(tetherPositions, tetherColors, vi, x0, y0, z0, color);
                vi = pushVertex(tetherPositions, tetherColors, vi, x1, y0, z0, color);
                vi = pushVertex(tetherPositions, tetherColors, vi, x1, y0, z0, color);
                vi = pushVertex(tetherPositions, tetherColors, vi, x1, y1, z1, color);
            }
        } else {
            const nx = -dz / dist;
            const nz = dx / dist;
            const amplitude = 7.0 * tension * waveScale;
            let prevX = ax, prevY = ay, prevZ = az;

            for (let s = 1; s <= SEGMENTS_PER_TETHER; s++) {
                const t = s / SEGMENTS_PER_TETHER;
                const envelope = Math.sin(t * Math.PI);
                const wave = Math.sin(t * Math.PI * 6.0 + time * 1.5) * amplitude * envelope;
                const vertical = Math.sin(t * Math.PI * 4.0 + time * 1.15) * amplitude * 0.45 * envelope;
                const x = ax + dx * t + nx * wave;
                const y = ay + dy * t + vertical;
                const z = az + dz * t + nz * wave;

                vi = pushVertex(tetherPositions, tetherColors, vi, prevX, prevY, prevZ, color);
                vi = pushVertex(tetherPositions, tetherColors, vi, x, y, z, color);
                prevX = x; prevY = y; prevZ = z;
            }
        }

        if (auraActive && ai + 2 <= MAX_PAIRS * 2) {
            tempColor.setRGB(0.66, 0.33, 0.97).multiplyScalar(0.55 + Math.abs(Math.sin(time * 4.0 + dist * 0.05)) * 0.25);
            ai = pushVertex(auraPositions, auraColors, ai, ax, ay, az, tempColor);
            ai = pushVertex(auraPositions, auraColors, ai, bx, by, bz, tempColor);
        }

        if (multipathActive && gi + 4 <= MAX_PAIRS * 4) {
            const ox = -dy / dist * 16.0;
            const oz = dx / dist * 16.0;
            for (let m = 1; m <= 2; m++) {
                const offset = m * 16.0 + Math.sin(time * 3.0 + m) * 4.0;
                tempColor.setRGB(0.94, 0.75, 0.16).multiplyScalar(0.42 / m);
                gi = pushVertex(ghostPositions, ghostColors, gi, ax + ox * offset / 16, ay, az + oz * offset / 16, tempColor);
                gi = pushVertex(ghostPositions, ghostColors, gi, bx + ox * offset / 16, by, bz + oz * offset / 16, tempColor);
            }
        }

        if (signalParticlesActive && mi + MONO_PER_TETHER * 3 <= MAX_PAIRS * MONO_PER_TETHER * 3) {
            for (let i = 0; i < MONO_PER_TETHER; i++) {
                const t = (time * 0.16 + i / MONO_PER_TETHER) % 1.0;
                const px = ax + dx * t;
                const py = ay + dy * t;
                const pz = az + dz * t;
                monoPositions[mi++] = px;
                monoPositions[mi++] = py;
                monoPositions[mi++] = pz;
            }
        }

        if (waveOverlay && vi + 2 <= MAX_PAIRS * VERTS_PER_TETHER) {
            vi = pushVertex(tetherPositions, tetherColors, vi, ax, ay, az, tempColor.setRGB(0.0, 1.0, 0.94));
            vi = pushVertex(tetherPositions, tetherColors, vi, bx, by, bz, tempColor);
        }
    }

    tetherGeometry.setDrawRange(0, vi);
    tetherGeometry.attributes.position.needsUpdate = true;
    tetherGeometry.attributes.color.needsUpdate = true;
    tetherLines.material.opacity = 0.66 * Math.max(0.2, intensity);

    auraLines.visible = auraActive;
    if (auraActive) {
        auraGeometry.setDrawRange(0, ai);
        auraGeometry.attributes.position.needsUpdate = true;
        auraGeometry.attributes.color.needsUpdate = true;
        auraLines.material.opacity = 0.30 * Math.max(0.2, intensity) * noiseAttenuation;
    }

    ghostLines.visible = multipathActive;
    if (multipathActive) {
        ghostGeometry.setDrawRange(0, gi);
        ghostGeometry.attributes.position.needsUpdate = true;
        ghostGeometry.attributes.color.needsUpdate = true;
        ghostLines.material.opacity = 0.32 * Math.max(0.2, intensity);
    }

    monoPoints.visible = signalParticlesActive;
    if (signalParticlesActive) {
        monoPoints.material.opacity = 0.9 * noiseAttenuation * Math.max(0.2, Math.min(1.5, intensity));
        monoGeometry.setDrawRange(0, mi / 3);
        monoGeometry.attributes.position.needsUpdate = true;
    }
}

// -----------------------------------------------------------------------------
// GPU Vapor Field
// -----------------------------------------------------------------------------

function buildVaporField() {
    const positions = new Float32Array(VAPOR_COUNT * 3);
    for (let i = 0; i < VAPOR_COUNT; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 900;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 760 + 35;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 620;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    vaporMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 1 },
            uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
            uAtmos: { value: 0 },
            uThermal: { value: 0 },
            uWave: { value: 0 },
            uEmp: { value: 0 },
            uDoppler: { value: 0 },
            uMultipath: { value: 0 },
            uQE: { value: 0 },
            uQEMode: { value: 0 },
            uNodePos: { value: fieldNodePos },
            uNodeVel: { value: fieldNodeVel },
            uNodeHot: { value: fieldNodeHot },
            uNodeCount: { value: 0 },
            uTetherMid: { value: fieldTetherMid },
            uTetherCount: { value: 0 }
        },
        vertexShader: `
            uniform float uQE;
            uniform float uQEMode;
            uniform float uTime;
            uniform float uIntensity;
            uniform float uPixelRatio;
            uniform float uAtmos;
            uniform float uThermal;
            uniform float uWave;
            uniform float uEmp;
            uniform float uDoppler;
            uniform float uMultipath;
            uniform vec3 uNodePos[${MAX_NODES}];
            uniform vec3 uNodeVel[${MAX_NODES}];
            uniform float uNodeHot[${MAX_NODES}];
            uniform int uNodeCount;
            uniform vec3 uTetherMid[${MAX_TETHERS}];
            uniform int uTetherCount;

            varying vec3 vColor;
            varying float vAlpha;

            void main() {
                vec3 p = position;
                float density = 0.05;
                vec3 col = vec3(0.70, 0.78, 0.90);

                if (uQEMode > 0.5) {
                    col = vec3(0.61, 0.30, 0.87); // Luminous QE Purple (matching #9d4edd)
                }

                if (uAtmos > 0.5) {
                    float haze1 = sin(p.x * 0.015 + uTime * 0.8) * cos(p.y * 0.015 - uTime * 0.6) * 0.5 + 0.5;
                    float haze2 = sin((p.x * 0.03 - p.y * 0.03) + uTime * 1.2) * 0.3;
                    float shear = 0.0;
                    for (int i = 0; i < ${MAX_NODES}; i++) {
                        if (i >= uNodeCount) break;
                        vec3 n = uNodePos[i];
                        vec2 d = p.xy - n.xy;
                        float dist = length(d);
                        if (dist < 340.0) {
                            float f = pow(1.0 - dist / 340.0, 1.8);
                            shear += f * 0.35 * (sin(dist * 0.05 - uTime * 2.0) * 0.5 + 0.5);
                        }
                    }
                    density += 0.05 + (haze1 + haze2) * 0.12 + shear;
                    col = vec3(0.47, 0.92, 0.72);
                }

                if (uThermal > 0.5) {
                    float potential = 0.0;
                    for (int i = 0; i < ${MAX_NODES}; i++) {
                        if (i >= uNodeCount) break;
                        vec3 n = uNodePos[i];
                        float vMag = length(uNodeVel[i]);
                        float hot = uNodeHot[i];
                        vec3 d = p - n;
                        d.y += 18.0;
                        float dist = length(d);
                        if (dist < 330.0) {
                            float env = pow(1.0 - dist / 330.0, 1.9) * hot;
                            if (vMag > 0.8 || hot > 1.2) potential = max(potential, env);
                            else potential = min(potential, -env * 0.75);
                        }
                    }
                    if (potential > 0.05) {
                        density += potential * 0.48;
                        col = vec3((225.0 + potential * 30.0) / 255.0, (55.0 + potential * 65.0) / 255.0, 10.0 / 255.0);
                    } else if (potential < -0.05) {
                        float cold = abs(potential);
                        density += cold * 0.42;
                        col = vec3(45.0 / 255.0, (75.0 + cold * 55.0) / 255.0, (220.0 + cold * 35.0) / 255.0);
                    } else {
                        density += 0.04;
                        col = vec3(55.0 / 255.0, 35.0 / 255.0, 130.0 / 255.0);
                    }
                }

                if (uWave > 0.5) {
                    float jitter = sin(p.x * 0.1 + p.y * 0.1 + uTime * 8.0) * 0.015
                                 + cos(p.z * 0.2 - uTime * 6.0) * 0.01;
                    density += abs(jitter);
                    float cumulative = 0.0;
                    for (int i = 0; i < ${MAX_NODES}; i++) {
                        if (i >= uNodeCount) break;
                        vec3 n = uNodePos[i];
                        float dist = distance(p, n);
                        if (dist < 360.0) {
                            float f = pow(1.0 - dist / 360.0, 1.4);
                            float k = dist * 0.065;
                            float freq = sqrt(k * k + 0.0016);
                            cumulative += sin(k - uTime * 5.0 * freq + float(i) * 1.2) * f;
                        }
                    }
                    if (abs(cumulative) > 0.05 || abs(jitter) > 0.01) {
                        density += abs(cumulative) * 0.48;
                        if (cumulative > 0.82) {
                            col = vec3(1.0);
                            density += 0.28;
                        } else if (cumulative > 0.32) {
                            col = vec3(0.0, 1.0, 0.94);
                        } else {
                            col = vec3(25.0 / 255.0, max(0.0, 120.0 - cumulative * 35.0) / 255.0, 1.0);
                        }
                    }
                }

                if (uEmp > 0.5) {
                    float pulseRadius = mod(uTime * 220.0, 320.0);
                    for (int i = 0; i < ${MAX_NODES}; i++) {
                        if (i >= uNodeCount) break;
                        vec3 n = uNodePos[i];
                        vec3 d = p - n;
                        float ringDist = abs(length(d) - pulseRadius);
                        if (ringDist < 14.0) {
                            float shock = pow(1.0 - ringDist / 14.0, 2.5);
                            density += shock * 0.45;
                            col = vec3(0.08, 0.48, 0.58);
                        }
                    }
                }

                if (uDoppler > 0.5) {
                    for (int i = 0; i < ${MAX_NODES}; i++) {
                        if (i >= uNodeCount) break;
                        vec3 vel = uNodeVel[i];
                        float speed = length(vel);
                        if (speed > 0.1) {
                            vec3 d = p - uNodePos[i];
                            float dist = length(d);
                            if (dist < 340.0 && dist > 5.0) {
                                float f = pow(1.0 - dist / 340.0, 1.5);
                                float cosTheta = dot(d / dist, vel / speed);
                                float beta = min(0.75, speed * 0.15);
                                float shift = 1.0 / (1.0 - beta * cosTheta);
                                density += abs(shift - 1.0) * f * 0.45;
                                if (shift > 1.15) col = vec3(20.0 / 255.0, min(1.0, (240.0 + (shift - 1.15) * 15.0) / 255.0), 1.0);
                                else if (shift < 0.85) col = vec3(1.0, min(1.0, (20.0 + shift * 50.0) / 255.0), 140.0 / 255.0);
                            }
                        }
                    }
                }

                if (uMultipath > 0.5) {
                    for (int i = 0; i < ${MAX_TETHERS}; i++) {
                        if (i >= uTetherCount) break;
                        vec3 mid = uTetherMid[i];
                        vec2 d = p.xy - mid.xy;
                        float dist = length(d);
                        if (dist < 220.0) {
                            float caustic = pow(1.0 - dist / 220.0, 2.0) * (sin(uTime * 4.0 + dist * 0.05) * 0.5 + 0.5);
                            density += caustic * 0.3;
                            col = vec3(240.0 / 255.0, 190.0 / 255.0, 40.0 / 255.0);
                        }
                    }
                }

                vColor = col;
                vAlpha = clamp(density * uIntensity, 0.02, 0.68);

                vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
                gl_PointSize = clamp(uPixelRatio * 700.0 / max(1.0, -mvPosition.z) * 1.6, 1.0, 2.5);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vAlpha;

            void main() {
                float d = length(gl_PointCoord - vec2(0.5));
                float soft = smoothstep(0.5, 0.05, d);
                if (soft <= 0.01) discard;
                gl_FragColor = vec4(vColor, vAlpha * soft);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    vaporPoints = new THREE.Points(geometry, vaporMaterial);
    vaporPoints.frustumCulled = false;
    vaporPoints.visible = false;
    scene.add(vaporPoints);
}

function updateVaporField(nodes, pairs, overlayFlags, intensity, time, worldScale = 1) {
    const atmosActive = !!overlayFlags.atmos || !!overlayFlags.vacuum;
    const thermalActive = !!overlayFlags.thermal;
    const waveActive = !!overlayFlags.wave;
    const empActive = !!overlayFlags.emp || !!overlayFlags.em;
    const dopplerActive = !!overlayFlags.doppler;
    const multipathActive = !!overlayFlags.multipath || !!overlayFlags.snr;
    const qeActive = !!overlayFlags.qe || !!overlayFlags.quantumEntanglement; // Declared once here cleanly
    const allOff = !atmosActive && !thermalActive && !waveActive
        && !empActive && !dopplerActive && !multipathActive && !qeActive;

    vaporPoints.visible = !allOff;
    if (allOff) return;

    const nodeCount = Math.min(nodes.length, MAX_NODES);
    for (let i = 0; i < nodeCount; i++) {
        const node = nodes[i];
        const nx = node.position ? node.position.x : (node.x || 0);
        const ny = node.position ? node.position.y : (node.y || 0);
        const nz = node.position ? node.position.z : (node.z || 0);
        fieldNodePos[i].set(nx * worldScale, ny * worldScale, nz * worldScale);
        fieldNodeVel[i].set(node.vx || 0, node.vy || 0, node.vz || 0);
        const speed = Math.sqrt((node.vx || 0) ** 2 + (node.vy || 0) ** 2 + (node.vz || 0) ** 2);
        const isCore = node.tier === 'BULK_CORE' || node.isCore;
        fieldNodeHot[i] = isCore ? 1.4 : (0.7 + speed * 0.6);
    }

    const tetherCount = Math.min(pairs.length, MAX_TETHERS);
    for (let i = 0; i < tetherCount; i++) {
        const pair = pairs[i];
        fieldTetherMid[i].set(
            (pair.ax + pair.bx) * 0.5,
            (pair.ay + pair.by) * 0.5,
            (pair.az + pair.bz) * 0.5
        );
    }

    const u = vaporMaterial.uniforms;
    u.uTime.value = time;
    u.uIntensity.value = intensity;
    u.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
    u.uAtmos.value = atmosActive ? 1 : 0;
    u.uThermal.value = thermalActive ? 1 : 0;
    u.uWave.value = waveActive ? 1 : 0;
    u.uEmp.value = empActive ? 1 : 0;
    u.uDoppler.value = dopplerActive ? 1 : 0;
    u.uMultipath.value = multipathActive ? 1 : 0;
    u.uQE.value = qeActive ? 1 : 0;
    u.uNodeCount.value = nodeCount;
    u.uTetherCount.value = tetherCount;
    u.uNodeCount.value = nodeCount;
}

// -----------------------------------------------------------------------------
// EMP shock rings
// -----------------------------------------------------------------------------
/*function buildEMPField() {
    const geometry = new THREE.SphereGeometry(1.0, 64, 48);

    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.04,
        blending: THREE.NormalBlending,
        depthWrite: false,
        toneMapped: false
    });

    empMesh = new THREE.InstancedMesh(geometry, material, MAX_EMP_NODES * EMP_RINGS_PER_NODE);
    empMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    empMesh.frustumCulled = false;
    empMesh.count = 0;

    const dullCyan = new THREE.Color(0x0e7490);
    for (let i = 0; i < MAX_EMP_NODES * EMP_RINGS_PER_NODE; i++) {
        empMesh.setColorAt(i, dullCyan);
    }
    scene.add(empMesh);
}*/

/*function updateEMP(nodes, worldScale, active, time, intensity) {
    empMesh.visible = active;
    if (!active) return;

    const count = Math.min(nodes.length, MAX_EMP_NODES);
    empMesh.count = count * EMP_RINGS_PER_NODE;
    let index = 0;

    for (let i = 0; i < count; i++) {
        const node = nodes[i];
        const x = (node.position ? node.position.x : node.x || 0) * worldScale;
        const y = (node.position ? node.position.y : node.y || 0) * worldScale;
        const z = (node.position ? node.position.z : node.z || 0) * worldScale;
        const distFromCenter = Math.sqrt(x * x + y * y + z * z);
        const isOutOfBounds = distFromCenter > 1500 * worldScale;

        for (let ring = 0; ring < EMP_RINGS_PER_NODE; ring++) {
            dummyObject.position.set(x, y, z);

            const phase = (time * 0.20 + ring / EMP_RINGS_PER_NODE + i * 0.13) % 1.0;
            const radius = isOutOfBounds ? 0 : (12 + phase * 260) * worldScale;
            dummyObject.position.set(x, y, z);
            dummyObject.scale.set(radius, radius, radius);
            dummyObject.rotation.set(0, time * 0.12 * (ring % 2 === 0 ? 1 : -1), 0);
            dummyObject.updateMatrix();
            empMesh.setMatrixAt(index, dummyObject.matrix);

            const fadeIn = Math.min(1.0, phase * 5.0);
            const fadeOut = Math.pow(1.0 - phase, 1.8);
            const falloff = fadeIn * fadeOut * Math.min(1.2, Math.max(0.3, intensity));

            tempColor.setRGB(0.06, 0.45, 0.56).multiplyScalar(falloff);
            empMesh.setColorAt(index, tempColor);
            index++;
        }
    }

    empMesh.instanceMatrix.needsUpdate = true;
    if (empMesh.instanceColor) empMesh.instanceColor.needsUpdate = true;
}*/

// -----------------------------------------------------------------------------
// Doppler velocity streaks
// -----------------------------------------------------------------------------
function buildDopplerField() {
    dopplerGeometry = new THREE.BufferGeometry();
    dopplerPositions = new Float32Array(MAX_NODES * 2 * 3);
    dopplerColors = new Float32Array(MAX_NODES * 2 * 3);
    dopplerGeometry.setAttribute('position', new THREE.BufferAttribute(dopplerPositions, 3).setUsage(THREE.DynamicDrawUsage));
    dopplerGeometry.setAttribute('color', new THREE.BufferAttribute(dopplerColors, 3).setUsage(THREE.DynamicDrawUsage));
    dopplerGeometry.setDrawRange(0, 0);

    dopplerLines = new THREE.LineSegments(dopplerGeometry, new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
    }));
    dopplerLines.frustumCulled = false;
    dopplerLines.visible = false;
    scene.add(dopplerLines);
}

function updateDoppler(nodes, worldScale, active, intensity) {
    dopplerLines.visible = active;
    if (!active) return;

    let vi = 0;
    for (let i = 0; i < nodes.length && i < MAX_NODES; i++) {
        const node = nodes[i];
        const vx = node.vx || 0;
        const vy = node.vy || 0;
        const vz = node.vz || 0;
        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (speed < 0.1) continue;

        const inv = 1 / speed;
        const len = 10 + speed * 6;
        const x = (node.position ? node.position.x : node.x || 0) * worldScale;
        const y = (node.position ? node.position.y : node.y || 0) * worldScale;
        const z = (node.position ? node.position.z : node.z || 0) * worldScale;

        tempColor.setRGB(
            vx * inv >= 0 ? 0.1 : 1.0,
            vx * inv >= 0 ? 0.95 : 0.15,
            vx * inv >= 0 ? 1.0 : 0.55
        ).multiplyScalar(0.85 * Math.max(0.3, intensity));

        vi = pushVertex(dopplerPositions, dopplerColors, vi, x - vx * inv * len, y - vy * inv * len, z - vz * inv * len, tempColor);
        vi = pushVertex(dopplerPositions, dopplerColors, vi, x + vx * inv * len, y + vy * inv * len, z + vz * inv * len, tempColor);
    }

    dopplerGeometry.setDrawRange(0, vi);
    dopplerGeometry.attributes.position.needsUpdate = true;
    dopplerGeometry.attributes.color.needsUpdate = true;
}

// -----------------------------------------------------------------------------
// Floor grid
// -----------------------------------------------------------------------------
function syncFloor(config) {
    const worldScale = config.worldScale ?? 1;
    const divisions = Math.max(4, Math.round((config.gridDensity ?? 10) * 2));
    const key = `${worldScale.toFixed(2)}|${divisions}`;

    if (key !== floorKey) {
        if (floorGrid) {
            scene.remove(floorGrid);
            floorGrid.geometry.dispose();
            floorGrid.material.dispose();
        }

        floorGrid = new THREE.GridHelper(BASE_SPAN * 2 * worldScale, divisions, 0x00ffcc, 0x003333);
        floorGrid.position.y = FLOOR_Y;
        floorGrid.material.transparent = true;
        floorGrid.material.opacity = 0.25;
        floorGrid.material.depthWrite = false;
        floorGrid.material.blending = THREE.AdditiveBlending;
        floorGrid.material.toneMapped = false;
        floorGrid.frustumCulled = false;
        scene.add(floorGrid);
        floorKey = key;
    }

    floorGrid.visible = config.showFloor !== false;
}

// -----------------------------------------------------------------------------
// Main canvas interaction
// -----------------------------------------------------------------------------
function getVisibleNodes() {
    const nodes = window.nodes || [];
    const filter = window.hudConfig?.streamFilter || 'all';
    if (filter === 'primary') {
        return nodes.filter(node => node.isCore || node.tier === 'BULK_CORE' || node.id === 'N-001');
    }
    if (filter === 'anomaly') {
        return nodes.filter(node => node.entropy < 0 || (node.jitter && node.jitter > 200));
    }
    return nodes;
}

function pickNodeAt(clientX, clientY, canvas) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const worldScale = window.hudConfig?.worldScale ?? 1;
    const nodes = getVisibleNodes();

    camera.updateMatrixWorld();
    let best = null;
    let bestDistance = 24;

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const nx = node.position ? node.position.x : (node.x || 0);
        const ny = node.position ? node.position.y : (node.y || 0);
        const nz = node.position ? node.position.z : (node.z || 0);

        tempVec.set(nx * worldScale, ny * worldScale, nz * worldScale).project(camera);

        if (tempVec.z < -1 || tempVec.z > 1) continue;

        const px = (tempVec.x * 0.5 + 0.5) * rect.width;
        const py = (-tempVec.y * 0.5 + 0.5) * rect.height;
        const dx = mouseX - px;
        const dy = mouseY - py;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < bestDistance) {
            bestDistance = distance;
            best = node;
        }
    }
    return best;
}

function attachMainCanvasEvents(canvas) {
    canvas.style.touchAction = 'none';

    canvas.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        const node = pickNodeAt(event.clientX, event.clientY, canvas);
        if (!node) return;

        dragNode = node;
        window.selectedNode = node;
        const ny = (node.position ? node.position.y : (node.y || 0)) * (window.hudConfig?.worldScale || 1);
        dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, ny, 0));

        try { canvas.setPointerCapture?.(event.pointerId); } catch (error) { /* synthetic pointer */ }
        canvas.style.cursor = 'grabbing';
        event.preventDefault();
    });

    canvas.addEventListener('pointermove', (event) => {
        if (!dragNode) {
            canvas.style.cursor = pickNodeAt(event.clientX, event.clientY, canvas) ? 'grab' : 'default';
            return;
        }

        const rect = canvas.getBoundingClientRect();
        pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNDC, camera);

        if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
            const worldScale = window.hudConfig?.worldScale || 1;
            const newX = dragPoint.x / worldScale;
            const newZ = dragPoint.z / worldScale;
            dragNode.x = newX;
            dragNode.z = newZ;
            if (dragNode.position) {
                dragNode.position.x = newX;
                dragNode.position.z = newZ;
            }
            dragNode.vx = 0;
            dragNode.vy = 0;
            dragNode.vz = 0;

            if (typeof window.broadcastHUDStateToBuilder === 'function' && window.nodes) {
                window.broadcastHUDStateToBuilder(window.nodes);
            }
        }
    });

    const endDrag = (event) => {
        if (!dragNode) return;
        dragNode.isPinned = true;
        if (typeof window.broadcastHUDStateToBuilder === 'function' && window.nodes) {
            window.broadcastHUDStateToBuilder(window.nodes);
        }
        dragNode = null;
        window.selectedNode = null;
        try { canvas.releasePointerCapture?.(event.pointerId); } catch (error) { /* synthetic pointer */ }
        canvas.style.cursor = 'default';
    };

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', () => {
        if (!dragNode) canvas.style.cursor = 'default';
    });
}

// -----------------------------------------------------------------------------
// Animation loopGlobal delta timing, physics steps, overlay state unpacking (qeActive, thermalActive, empActive), and pushing active values down to material uniforms.
// -----------------------------------------------------------------------------
const clock = new THREE.Clock();
function animationLoop(timestamp = performance.now()) {
    if (!renderer) return;

    const dt = Math.min(0.05, Math.max(0, (timestamp - lastTimestamp) * 0.001));
    lastTimestamp = timestamp;

    const config = window.hudConfig || (window.hudConfig = {});
    const motionSpeed = config.motionSpeed ?? 1.0;
    simulationTime += dt * motionSpeed;
    config.simulationTime = simulationTime;

    const overlays = config.overlays || {};

    if (typeof window.hudPhysicsStep === 'function') {
        window.hudPhysicsStep();
    }

    updateCamera();

    const worldScale = config.worldScale ?? 1.0;
    const nodes = getVisibleNodes();
    const edges = window.edges || [];
    const palette = config.colorPalette || 'dynamic';
    const intensity = config.overlayIntensity ?? 1.0;
    const interpolation = config.interpolationMode || 'linear';

    // Ensure dynamic mode or other standard palettes explicitly clear stale overlays if not selected
    const isDynamicDefault = (palette === 'dynamic' || palette === '' || !palette);

    // Strictly gate qeActive and adsActive so they can NEVER render under Dynamic (Default)
    const qeActive = !isDynamicDefault && !!(overlays.qe || overlays.quantumEntanglement || palette === 'qe');
    const adsActive = !isDynamicDefault && !!(overlays.ads || palette === 'ads' || palette === 'ads-cft');
    const thermalActive = !!(overlays.thermal || palette === 'thermal');
    const empActive = !!(overlays.emp || overlays.em || palette === 'em');

    // --- Automatic Overlay Sync & Update ---
    if (thermalOverlay) {
        if (thermalActive && !thermalOverlay.active) thermalOverlay.enable();
        else if (!thermalActive && thermalOverlay.active) thermalOverlay.disable();
        if (thermalOverlay.active) {
            thermalOverlay.update(nodes, dt);
        }
    }
  
    if (empOverlay) {
        if (empActive && !empOverlay.active) empOverlay.enable();
        else if (!empActive && empOverlay.active) empOverlay.disable();
        if (empOverlay.active) {
            empOverlay.update(nodes, dt, motionSpeed, worldScale); // Drives wireframe mesh
        }
    }

    if (adsOverlay) {
        if (adsActive && !adsOverlay.active) adsOverlay.enable();
        else if (!adsActive && adsOverlay.active) adsOverlay.disable();
        if (adsOverlay.active) {
            adsOverlay.update(nodes, simulationTime, intensity, worldScale);
        }
    }

    const noiseThreshold = config.noiseThreshold ?? 0.15;
    // Strictly decouple noiseThreshold from activation state
    const snrActive = !!(overlays.snr || palette === 'snr');
    if (snrOverlay) {
        if (snrActive && !snrOverlay.active) snrOverlay.enable();
        else if (!snrActive && snrOverlay.active) snrOverlay.disable();
        if (snrOverlay.active) {
            snrOverlay.update(edges, nodes, simulationTime, noiseThreshold, worldScale);
        }
    }

    // --- Synchronized Uniform Feed from EmpOverlay pulseRings (Leading Edge & Diffusion Parity) ---
    if (window.referenceFrameManager && window.referenceFrameManager.empUniforms) {
        window.referenceFrameManager.empUniforms.uEmpActive.value = empActive && empOverlay && empOverlay.active ? 1 : 0;

        if (empActive && empOverlay && empOverlay.active && empOverlay.pulseRings) {
            const radiiVal = window.referenceFrameManager.empUniforms.uEmpRadii.value;
            const opacitiesVal = window.referenceFrameManager.empUniforms.uEmpOpacities.value;
            const centersVal = window.referenceFrameManager.empUniforms.uEmpCenters.value;
            const rings = empOverlay.pulseRings;

            for (let j = 0; j < 16; j++) {
                if (j < rings.length) {
                    radiiVal[j] = rings[j].radius;
                    const lifeProgress = rings[j].radius / rings[j].maxRadius;
                    opacitiesVal[j] = Math.max(0.0, 0.35 * (1.0 - lifeProgress));
                    centersVal[j].copy(rings[j].mesh.position);
                } else {
                    radiiVal[j] = 0.0;
                    opacitiesVal[j] = 0.0;
                }
            }
            window.referenceFrameManager.empUniforms.uEmpRadii.needsUpdate = true;
            window.referenceFrameManager.empUniforms.uEmpOpacities.needsUpdate = true;
        } else {
            const radiiVal = window.referenceFrameManager.empUniforms.uEmpRadii.value;
            const opacitiesVal = window.referenceFrameManager.empUniforms.uEmpOpacities.value;
            for (let j = 0; j < 16; j++) {
                radiiVal[j] = 0.0;
                opacitiesVal[j] = 0.0;
            }
            window.referenceFrameManager.empUniforms.uEmpRadii.needsUpdate = true;
            window.referenceFrameManager.empUniforms.uEmpOpacities.needsUpdate = true;
        }
    }

    if (shellMaterial) {
        shellMaterial.uniforms.uTime.value = simulationTime;
        shellMaterial.uniforms.uScale.value = worldScale;
        shellMaterial.uniforms.uWarp.value = config.warpExaggeration ?? 1.0;
        shellMaterial.uniforms.uOpacity.value = Math.max(0.35, Math.min(1.8, intensity));

        const shellNodeCount = Math.min(nodes.length, MAX_NODES);
        shellMaterial.uniforms.uNodeCount.value = shellNodeCount;
        for (let i = 0; i < shellNodeCount; i++) {
            const node = nodes[i];
            const nx = node.position ? node.position.x : (node.x || 0);
            const ny = node.position ? node.position.y : (node.y || 0);
            const nz = node.position ? node.position.z : (node.z || 0);
            shellMaterial.uniforms.uNodes.value[i].set(nx * worldScale, ny * worldScale, nz * worldScale);
        }
    }

    syncFloor(config);

    const pairs = buildPairList(nodes, edges, worldScale);
    updateNodes(nodes, worldScale, palette, overlays, intensity);
    updateTethers(pairs, simulationTime, interpolation, palette, overlays, intensity, config.noiseThresh ?? 0.05);
    updateVaporField(nodes, pairs, overlays, intensity, simulationTime, worldScale);
    updateDoppler(nodes, worldScale, !!overlays.doppler, intensity);

    if (qeTetherManager) {
        qeTetherManager.update(pairs, simulationTime, qeActive);
    }
    window.qeTetherManager = qeTetherManager; // Expose globally for console debugging

    renderer.render(scene, camera);
    if (labelRenderer) labelRenderer.render(scene, camera);
    renderGizmo();

    frameHandle = requestAnimationFrame(animationLoop);
}    

// -----------------------------------------------------------------------------
// Teardown
// -----------------------------------------------------------------------------
export function disposeHUDRenderer() {
    if (!initialized) return;
    if (frameHandle) cancelAnimationFrame(frameHandle);
    frameHandle = null;

    window.removeEventListener('resize', handleResize);
    if (labelRenderer?.domElement?.parentNode) {
        labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
    }

    scene.traverse(object => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
            if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
            else object.material.dispose();
        }
    });

    if (renderer) renderer.dispose();
    if (gizmoRenderer) gizmoRenderer.dispose();

    renderer = null;
    labelRenderer = null;
    scene = null;
    camera = null;
    gizmoRenderer = null;
    gizmoScene = null;
    gizmoCamera = null;
    nodeLabels.clear();
    initialized = false;
}