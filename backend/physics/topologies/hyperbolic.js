import * as THREE from 'three';

export class HyperbolicTopology {
    constructor() {
        this.name = 'hyperbolic';
    }

    createMesh(scale = 1.0) {
        const group = new THREE.Group();
        group.name = 'manifold_hyperbolic';
        group.position.set(0, 0, 0); // Explicitly anchor to world origin
        group.scale.set(scale, scale, scale);

        // 6 Nested Hyperboloid Shells using native THREE.LatheGeometry (Hyperbolic cosine profile)
        // 1. White, 2. Yellow, 3. Orange, 4. Red, 5. Purple, 6. Blue
        const hyperConfig = [
            { throat: 30, height: 70, color: 0xffffff, opacity: 0.03 },
            { throat: 60, height: 105, color: 0xfacc15, opacity: 0.04 },
            { throat: 95, height: 145, color: 0xf97316, opacity: 0.05 },
            { throat: 135, height: 190, color: 0xef4444, opacity: 0.07 },
            { throat: 180, height: 240, color: 0xa855f7, opacity: 0.09 },
            { throat: 230, height: 295, color: 0x3b82f6, opacity: 0.08 }
        ];

        hyperConfig.forEach((cfg, index) => {
            const points = [];
            const segments = 24;

            for (let j = 0; j <= segments; j++) {
                const v = (j / segments) * 2.0 - 1.0;
                const yCoord = v * cfg.height; // Scale handled by group.scale
                const radius = cfg.throat * Math.cosh(v * 1.1);
                points.push(new THREE.Vector2(radius, yCoord));
            }

            const geometry = new THREE.LatheGeometry(points, 24, 0, Math.PI * 2);
            geometry.computeBoundingSphere();
            geometry.computeBoundingBox();

            const material = new THREE.MeshBasicMaterial({
                color: cfg.color,
                wireframe: true,
                transparent: true,
                opacity: cfg.opacity,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = `hyperbolic_shell_${index}`;
            group.add(mesh);
        });

        // Asymptotic Throat Waist Ring at y = 0
        const waistMat = new THREE.LineBasicMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.25,
            blending: THREE.AdditiveBlending
        });

        const waistR = 30;
        const waistPts = [];
        const segs = 48;
        for (let i = 0; i <= segs; i++) {
            const theta = (i / segs) * 2 * Math.PI;
            waistPts.push(new THREE.Vector3(waistR * Math.cos(theta), 0, waistR * Math.sin(theta)));
        }

        const waistLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(waistPts), waistMat);
        group.add(waistLine);

        group.updateMatrixWorld(true); // Force matrix update on creation
        return group;
    }

    calculateTargets(nodes) {
        const count = nodes.length;
        nodes.forEach((node, i) => {
            const u = (i / count) * 4 * Math.PI;
            const h = ((i / count) - 0.5) * 200;
            const r = 40 * Math.cosh(h / 80);
            node.targetX = r * Math.cos(u);
            node.targetY = h;
            node.targetZ = r * Math.sin(u);
        });
    }

    enforceConstraints(nodePositions) {
        return nodePositions;
    }
}