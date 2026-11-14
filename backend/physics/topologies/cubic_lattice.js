import * as THREE from '/js/vendor/graphics/three.js';

export class CubicLatticeTopology {
    constructor() {
        this.name = 'cubed';
    }

    createMesh(scale = 1.0) {
        const group = new THREE.Group();
        group.name = 'manifold_cubed';

        // 6 Concentric Nested Cubes mapped from inner core to outer boundary:
        // 1. White, 2. Yellow, 3. Orange, 4. Red, 5. Purple, 6. Blue
        const cubeConfig = [
            { size: 50, color: 0xffffff, opacity: 0.07 }, // White (Innermost)
            { size: 95, color: 0xfacc15, opacity: 0.09 }, // Yellow
            { size: 145, color: 0xf97316, opacity: 0.12 }, // Orange
            { size: 200, color: 0xef4444, opacity: 0.14 }, // Red
            { size: 260, color: 0xa855f7, opacity: 0.11 }, // Purple
            { size: 325, color: 0x3b82f6, opacity: 0.09 }  // Blue (Outermost)
        ];

        cubeConfig.forEach((cfg, index) => {
            const s = cfg.size * scale;
            const geometry = new THREE.BoxGeometry(s, s, s, 3, 3, 3);
            const material = new THREE.MeshBasicMaterial({
                color: cfg.color,
                wireframe: true,
                transparent: true,
                opacity: cfg.opacity,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            const cubeMesh = new THREE.Mesh(geometry, material);
            cubeMesh.name = `cube_shell_${index}`;
            group.add(cubeMesh);
        });

        // 2. Orthogonal Axial Guidance Tracers connecting corners & centers
        const tracerMat = new THREE.LineBasicMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.15,
            blending: THREE.AdditiveBlending
        });

        const maxS = 325 * scale / 2;
        const axes = [
            [new THREE.Vector3(-maxS, 0, 0), new THREE.Vector3(maxS, 0, 0)],
            [new THREE.Vector3(0, -maxS, 0), new THREE.Vector3(0, maxS, 0)],
            [new THREE.Vector3(0, 0, -maxS), new THREE.Vector3(0, 0, maxS)]
        ];

        axes.forEach(pts => {
            const geom = new THREE.BufferGeometry().setFromPoints(pts);
            group.add(new THREE.Line(geom, tracerMat));
        });

        return group;
    }

    calculateTargets(nodes) {
        const count = nodes.length;
        const spacing = 45;
        const side = Math.ceil(Math.cbrt(count));
        const offset = ((side - 1) * spacing) / 2;

        nodes.forEach((node, i) => {
            const x = (i % side) * spacing - offset;
            const y = (Math.floor(i / side) % side) * spacing - offset;
            const z = (Math.floor(i / (side * side))) * spacing - offset;
            node.targetX = x;
            node.targetY = y;
            node.targetZ = z;
        });
    }

    enforceConstraints(nodePositions) {
        return nodePositions;
    }
}