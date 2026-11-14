import * as THREE from '/js/vendor/graphics/three.js';

export class ToroidalTopology {
    constructor() {
        this.name = 'toroidal';
    }

    createMesh(scale = 1.0) {
        const group = new THREE.Group();
        group.name = 'manifold_toroidal';

        // 6 Non-Overlapping Nested Toroidal Flux Surfaces (Scaling R & r together to preserve the core hole)
        // 1. White, 2. Yellow, 3. Orange, 4. Red, 5. Purple, 6. Blue
        const torusConfig = [
            { majorR: 50, tube: 15, color: 0xffffff, opacity: 0.02 }, // White (Innermost)
            { majorR: 85, tube: 25, color: 0xfacc15, opacity: 0.03 }, // Yellow
            { majorR: 125, tube: 35, color: 0xf97316, opacity: 0.04 }, // Orange
            { majorR: 170, tube: 45, color: 0xef4444, opacity: 0.07 }, // Red
            { majorR: 220, tube: 55, color: 0xa855f7, opacity: 0.09 }, // Purple
            { majorR: 275, tube: 65, color: 0x3b82f6, opacity: 0.08 }  // Blue (Outermost)
        ];

        torusConfig.forEach((cfg, index) => {
            const geometry = new THREE.TorusGeometry(
                cfg.majorR * scale,
                cfg.tube * scale,
                24,
                48
            );
            const material = new THREE.MeshBasicMaterial({
                color: cfg.color,
                wireframe: true,
                transparent: true,
                opacity: cfg.opacity,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            const torusMesh = new THREE.Mesh(geometry, material);
            torusMesh.rotation.x = Math.PI / 2;
            torusMesh.name = `torus_shell_${index}`;
            group.add(torusMesh);
        });

        // Core Magnetic Axis Ring
        const axisMat = new THREE.LineBasicMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });

        const axisPts = [];
        const segments = 64;
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * 2 * Math.PI;
            axisPts.push(new THREE.Vector3(170 * scale * Math.cos(theta), 0, 170 * scale * Math.sin(theta)));
        }
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(axisPts), axisMat));

        return group;
    }

    calculateTargets(nodes) {
        const count = nodes.length;
        const R = 170;
        const r = 45;

        nodes.forEach((node, i) => {
            const u = (i / count) * 2 * Math.PI;
            const v = i * 2.4;
            node.targetX = (R + r * Math.cos(v)) * Math.cos(u);
            node.targetY = r * Math.sin(v);
            node.targetZ = (R + r * Math.cos(v)) * Math.sin(u);
        });
    }

    enforceConstraints(nodePositions) {
        return nodePositions;
    }
}