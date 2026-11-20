import * as THREE from '/js/vendor/graphics/three.js';

export class SphericalTopology {
    constructor() {
        this.name = 'spheroid';
        this.outerRadius = 275;
    }

    createMesh(scale = 1.0) {
        const group = new THREE.Group();
        group.name = 'manifold_spheroid';

        // 1. 6 Concentric Spheroidal Shells (White, Yellow, Orange, Red, Purple, Blue)
        const shellConfig = [
            { radius: 40, color: 0xffffff, opacity: 0.03, stretchY: 1.0 },
            { radius: 80, color: 0xfacc15, opacity: 0.04, stretchY: 1.0 },
            { radius: 120, color: 0xf97316, opacity: 0.05, stretchY: 1.0 },
            { radius: 165, color: 0xef4444, opacity: 0.07, stretchY: 1.0 },
            { radius: 215, color: 0xa855f7, opacity: 0.09, stretchY: 1.0 },
            { radius: 275, color: 0x3b82f6, opacity: 0.08, stretchY: 1.0 }
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
        const stretchY = 1.0;
        const numMeridians = 16;

        for (let i = 0; i < numMeridians; i++) {
            const theta = (i * 2 * Math.PI) / numMeridians;
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

        const numParallels = 12;
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
            node.targetY = r * Math.sin(theta) * Math.sin(phi);
            node.targetZ = r * Math.cos(phi);
        });
    }

    applyBoundaryForces(nodes, dt = 0.016, scale = 1.0, time = 0) {
        if (!Array.isArray(nodes) || nodes.length === 0) return;

        const maxR = this.outerRadius * Math.max(0.25, scale);
        const softR = maxR * 0.85;

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (!node || node.isPinned || node === window.selectedNode) continue;

            const x = node.position ? node.position.x : (node.x ?? 0);
            const y = node.position ? node.position.y : (node.y ?? 0);
            const z = node.position ? node.position.z : (node.z ?? 0);

            let fx = node.fx || 0;
            let fy = node.fy || 0;
            let fz = node.fz || 0;

            const r = Math.hypot(x, y, z);
            if (r > softR && r > 1e-4) {
                const nx = x / r;
                const ny = y / r;
                const nz = z / r;
                const span = Math.max(1.0, maxR - softR);
                const t = (r - softR) / span;
                const inwardForce = Math.min(140.0, (12.0 * t + 65.0 * t * t));

                fx -= nx * inwardForce;
                fy -= ny * inwardForce;
                fz -= nz * inwardForce;
            }

            // Gentle tangential swirl around Y to prevent static radial stalling
            const phase = i * 2.094 + time * 0.35;
            fx += Math.cos(phase) * 2.5;
            fy += Math.sin(phase * 0.7) * 2.0;
            fz += Math.sin(phase) * 2.5;

            node.fx = fx;
            node.fy = fy;
            node.fz = fz;
        }
    }

    enforceConstraints(nodePositions, scale = 1.0) {
        if (!Array.isArray(nodePositions) || nodePositions.length === 0) return nodePositions;

        const maxR = this.outerRadius * Math.max(0.25, scale);

        for (let i = 0; i < nodePositions.length; i++) {
            const node = nodePositions[i];
            if (!node) continue;

            let x = node.position ? node.position.x : (node.x ?? 0);
            let y = node.position ? node.position.y : (node.y ?? 0);
            let z = node.position ? node.position.z : (node.z ?? 0);

            if (!Number.isFinite(x)) x = 0;
            if (!Number.isFinite(y)) y = 0;
            if (!Number.isFinite(z)) z = 0;

            const r = Math.hypot(x, y, z);
            if (r > maxR && r > 1e-4) {
                const nx = x / r;
                const ny = y / r;
                const nz = z / r;

                x = nx * maxR;
                y = ny * maxR;
                z = nz * maxR;

                // Remove outward radial velocity while keeping tangential motion along the sphere
                const vx = node.vx || 0;
                const vy = node.vy || 0;
                const vz = node.vz || 0;
                const vRadial = vx * nx + vy * ny + vz * nz;
                if (vRadial > 0) {
                    node.vx = (vx - nx * vRadial) * 0.9;
                    node.vy = (vy - ny * vRadial) * 0.9;
                    node.vz = (vz - nz * vRadial) * 0.9;
                }
            }

            node.x = x;
            node.y = y;
            node.z = z;
            if (node.position && typeof node.position.set === 'function') {
                node.position.set(x, y, z);
            }
        }

        return nodePositions;
    }
}