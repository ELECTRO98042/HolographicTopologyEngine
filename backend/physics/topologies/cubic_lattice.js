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
    
    applyBoundaryForces(nodes, dt = 0.016, scale = 1.0, time = 0) {
        if (!Array.isArray(nodes) || nodes.length === 0) return;

        const halfExtent = this.halfExtent || 180;
        const maxE = halfExtent * Math.max(0.25, scale);
        const softE = maxE * 0.85;
        const span = Math.max(1.0, maxE - softE);

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (!node || node.isPinned || node === window.selectedNode) continue;

            const x = node.position ? node.position.x : (node.x ?? 0);
            const y = node.position ? node.position.y : (node.y ?? 0);
            const z = node.position ? node.position.z : (node.z ?? 0);

            let fx = node.fx || 0;
            let fy = node.fy || 0;
            let fz = node.fz || 0;

            if (Math.abs(x) > softE) {
                const t = (Math.abs(x) - softE) / span;
                fx -= Math.sign(x) * Math.min(140.0, 12.0 * t + 65.0 * t * t);
            }
            if (Math.abs(y) > softE) {
                const t = (Math.abs(y) - softE) / span;
                fy -= Math.sign(y) * Math.min(140.0, 12.0 * t + 65.0 * t * t);
            }
            if (Math.abs(z) > softE) {
                const t = (Math.abs(z) - softE) / span;
                fz -= Math.sign(z) * Math.min(140.0, 12.0 * t + 65.0 * t * t);
            }

            // Gentle 3D off-axis drift so unpinned nodes stay active inside the cubic frame
            const phase = i * 2.094 + time * 0.35;
            fx += Math.cos(phase) * 2.5;
            fy += Math.sin(phase * 0.8) * 2.5;
            fz += Math.sin(phase * 1.2) * 2.5;

            node.fx = fx;
            node.fy = fy;
            node.fz = fz;
        }
    }

    enforceConstraints(nodePositions) {
        return nodePositions;
    }
}