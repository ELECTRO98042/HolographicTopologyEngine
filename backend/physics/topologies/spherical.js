import * as THREE from '/js/vendor/graphics/three.js';

export class SphericalTopology {
    constructor() {
        this.name = 'spheroid';
        this.outerRadius = 275;
        this.shellRadius = 150;
        this.minSeparation = 52;
    }

    createMesh(scale = 1.0) {
        const group = new THREE.Group();
        group.name = 'manifold_spheroid';

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
                const phi = (j / segments) * Math.PI - Math.PI / 2;
                const y = maxR * stretchY * Math.sin(phi);
                const rXZ = maxR * Math.cos(phi);
                const x = rXZ * Math.cos(theta);
                const z = rXZ * Math.sin(theta);
                points.push(new THREE.Vector3(x, y, z));
            }
            const geom = new THREE.BufferGeometry().setFromPoints(points);
            group.add(new THREE.Line(geom, meridianMat));
        }

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
        const count = Math.max(1, nodes.length);
        const r = this.shellRadius;
        nodes.forEach((node, i) => {
            const theta = (i / count) * 2 * Math.PI;
            node.targetX = r * Math.cos(theta);
            node.targetY = 0;
            node.targetZ = r * Math.sin(theta);
        });
    }

    applyBoundaryForces(nodes, dt = 0.016, scale = 1.0, time = 0) {
        if (!Array.isArray(nodes) || nodes.length === 0) return;

        const s = Math.max(0.25, scale);
        const maxR = this.outerRadius * s;
        const softR = maxR * 0.85;
        const eqR = (this.shellRadius || 150) * s;
        const minSep = (this.minSeparation || 52) * Math.max(0.5, Math.min(2.0, s));

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
            if (r > 1e-4) {
                const nx = x / r;
                const ny = y / r;
                const nz = z / r;

                // Conformal radial shell restoring force toward eqR
                fx += nx * (eqR - r) * 0.65;
                fy += ny * (eqR - r) * 0.65;
                fz += nz * (eqR - r) * 0.65;

                // Outer boundary containment
                if (r > softR) {
                    const span = Math.max(1.0, maxR - softR);
                    const t = (r - softR) / span;
                    const inwardForce = Math.min(180.0, 18.0 * t + 85.0 * t * t);
                    fx -= nx * inwardForce;
                    fy -= ny * inwardForce;
                    fz -= nz * inwardForce;
                }
            }

            // Pairwise repulsion so nodes distribute symmetrically across the spherical shell
            for (let j = 0; j < nodes.length; j++) {
                if (i === j) continue;
                const other = nodes[j];
                if (!other) continue;

                const ox = other.position ? other.position.x : (other.x ?? 0);
                const oy = other.position ? other.position.y : (other.y ?? 0);
                const oz = other.position ? other.position.z : (other.z ?? 0);

                let dx = x - ox;
                let dy = y - oy;
                let dz = z - oz;
                let dist = Math.hypot(dx, dy, dz);

                if (dist < 1e-4) {
                    const angle = ((i - j) * 2.3999632) + time * 0.05;
                    dx = Math.cos(angle);
                    dy = Math.sin(angle * 0.5);
                    dz = Math.sin(angle);
                    dist = 1.0;
                }

                if (dist < minSep) {
                    const overlap = (minSep - dist) / minSep;
                    const rep = overlap * overlap * 105.0;
                    fx += (dx / dist) * rep;
                    fy += (dy / dist) * rep;
                    fz += (dz / dist) * rep;
                }
            }

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