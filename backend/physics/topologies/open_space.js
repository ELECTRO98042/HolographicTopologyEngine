import * as THREE from '/js/vendor/graphics/three.js';

export class OpenSpaceTopology {
    constructor() {
        this.name = 'open';
    }

    createMesh(scale = 1.0) {
        const group = new THREE.Group();
        group.name = 'manifold_open';

        // 6 Concentric Spin Network Shells mapped from inner core to outer boundary:
        // 1. White (Innermost core)
        // 2. Yellow
        // 3. Orange
        // 4. Red
        // 5. Purple
        // 6. Blue (Outermost boundary)
        const shellConfig = [
            { radius: 35, color: 0xffffff, opacity: 0.02 }, // White (Innermost)
            { radius: 70, color: 0xfacc15, opacity: 0.03 }, // Yellow
            { radius: 110, color: 0xf97316, opacity: 0.04 }, // Orange
            { radius: 155, color: 0xef4444, opacity: 0.06 }, // Red
            { radius: 205, color: 0xa855f7, opacity: 0.09 }, // Purple
            { radius: 260, color: 0x3b82f6, opacity: 0.08 }  // Blue (Outermost)
        ];

        shellConfig.forEach((cfg, index) => {
            const geometry = new THREE.SphereGeometry(cfg.radius * scale, 32, 32);
            const material = new THREE.MeshBasicMaterial({
                color: cfg.color,
                wireframe: true,
                transparent: true,
                opacity: cfg.opacity,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            const shellMesh = new THREE.Mesh(geometry, material);
            shellMesh.name = `shell_${index}`;
            group.add(shellMesh);
        });

        // 2. Orthogonal World-Space Floor Grid
        const floorGroup = new THREE.Group();
        floorGroup.name = 'floor_grid';
        const span = 280 * scale;
        const floorY = -90 * scale;

        const gridMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.12,
            blending: THREE.AdditiveBlending
        });

        const gridSteps = 12;
        for (let i = -gridSteps; i <= gridSteps; i++) {
            const coord = (i / gridSteps) * span;

            const pts1 = [new THREE.Vector3(coord, floorY, -span), new THREE.Vector3(coord, floorY, span)];
            floorGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts1), gridMaterial));

            const pts2 = [new THREE.Vector3(-span, floorY, coord), new THREE.Vector3(span, floorY, coord)];
            floorGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), gridMaterial));
        }

        group.add(floorGroup);
        return group;
    }

    calculateTargets(nodes) {
        // Open space leaves node positioning entirely to organic physics / telemetry stream
    }

    enforceConstraints(nodePositions) {
        return nodePositions;
    }
}