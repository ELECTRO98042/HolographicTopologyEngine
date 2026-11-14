import * as THREE from '/js/vendor/graphics/three.js';

export class SphericalTopology {
    constructor() {
        this.name = 'spheroid';
    }

    createMesh(scale = 1.0) {
        const group = new THREE.Group();
        group.name = 'manifold_spheroid';

        // 1. 6 Concentric Spheroidal Shells (White, Yellow, Orange, Red, Purple, Blue)
        const shellConfig = [
            { radius: 40, color: 0xffffff, opacity: 0.03, stretchY: 1.4 },
            { radius: 80, color: 0xfacc15, opacity: 0.04, stretchY: 1.35 },
            { radius: 120, color: 0xf97316, opacity: 0.05, stretchY: 1.3 },
            { radius: 165, color: 0xef4444, opacity: 0.07, stretchY: 1.25 },
            { radius: 215, color: 0xa855f7, opacity: 0.09, stretchY: 1.2 },
            { radius: 275, color: 0x3b82f6, opacity: 0.08, stretchY: 1.15 }
        ];

        shellConfig.forEach((cfg, index) => {
            const geometry = new THREE.SphereGeometry(cfg.radius * scale, 24, 16);
            const material = new THREE.MeshBasicMaterial({
                color: cfg.color,
                wireframe: true,
                transparent: true,
                opacity: cfg.opacity,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            const shellMesh = new THREE.Mesh(geometry, material);
            shellMesh.scale.set(1.0, cfg.stretchY, 1.0);
            shellMesh.name = `spheroid_shell_${index}`;
            group.add(shellMesh);
        });

        // 2. Explicit Longitudinal Meridian Hoops (Wrapping Pole-to-Pole)
        const meridianMat = new THREE.LineBasicMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.25,
            blending: THREE.AdditiveBlending
        });

        const maxR = 275 * scale;
        const stretchY = 1.15;
        const numMeridians = 8;

        for (let i = 0; i < numMeridians; i++) {
            const theta = (i * Math.PI) / numMeridians;
            const points = [];
            const segments = 40;
            for (let j = 0; j <= segments; j++) {
                const phi = (j / segments) * Math.PI - Math.PI / 2; // -90° to +90°
                const y = maxR * stretchY * Math.sin(phi);
                const rXZ = maxR * Math.cos(phi);
                const x = rXZ * Math.cos(theta);
                const z = rXZ * Math.sin(theta);
                points.push(new THREE.Vector3(x, y, z));
            }
            const geom = new THREE.BufferGeometry().setFromPoints(points);
            group.add(new THREE.Line(geom, meridianMat));
        }

        // 3. Explicit Latitudinal Parallel Rings (Horizontal Slices)
        const parallelMat = new THREE.LineBasicMaterial({
            color: 0xfacc15,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending
        });

        const numParallels = 6;
        for (let p = 1; p < numParallels; p++) {
            const phi = (p / numParallels) * Math.PI - Math.PI / 2;
            const y = maxR * stretchY * Math.sin(phi);
            const ringR = maxR * Math.cos(phi);
            const points = [];
            const segments = 50;
            for (let j = 0; j <= segments; j++) {
                const theta = (j / segments) * 2 * Math.PI;
                const x = ringR * Math.cos(theta);
                const z = ringR * Math.sin(theta);
                points.push(new THREE.Vector3(x, y, z));
            }
            const geom = new THREE.BufferGeometry().setFromPoints(points);
            group.add(new THREE.Line(geom, parallelMat));
        }

        return group;
    }

    calculateTargets(nodes) {
        const count = nodes.length;
        nodes.forEach((node, i) => {
            const phi = Math.acos(-1 + (2 * i) / Math.max(1, count));
            const theta = Math.sqrt(count * Math.PI) * phi;
            const r = 130;
            node.targetX = r * Math.cos(theta) * Math.sin(phi);
            node.targetY = r * Math.sin(theta) * Math.sin(phi) * 1.25;
            node.targetZ = r * Math.cos(phi);
        });
    }

    enforceConstraints(nodePositions) {
        return nodePositions;
    }
}