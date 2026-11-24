import * as THREE from '/js/vendor/graphics/three.js';

export class CubicLatticeTopology {
    constructor() {
        this.name = 'cubed';
        this.halfExtent = 162.5;
        this.minSeparation = 46;
    }

    createMesh(scale = 1.0) {
        const group = new THREE.Group();
        group.name = 'manifold_cubed';

        const cubeConfig = [
            { size: 50, color: 0xffffff, opacity: 0.07 },
            { size: 95, color: 0xfacc15, opacity: 0.09 },
            { size: 145, color: 0xf97316, opacity: 0.12 },
            { size: 200, color: 0xef4444, opacity: 0.14 },
            { size: 260, color: 0xa855f7, opacity: 0.11 },
            { size: 325, color: 0x3b82f6, opacity: 0.09 }
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

        const s = Math.max(0.25, scale);
        const halfExtent = this.halfExtent || 162.5;
        const maxE = halfExtent * s;
        const softE = maxE * 0.85;
        const span = Math.max(1.0, maxE - softE);
        const minSep = (this.minSeparation || 46) * Math.max(0.5, Math.min(2.0, s));

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
                fx -= Math.sign(x) * Math.min(180.0, 18.0 * t + 85.0 * t * t);
            }
            if (Math.abs(y) > softE) {
                const t = (Math.abs(y) - softE) / span;
                fy -= Math.sign(y) * Math.min(180.0, 18.0 * t + 85.0 * t * t);
            }
            if (Math.abs(z) > softE) {
                const t = (Math.abs(z) - softE) / span;
                fz -= Math.sign(z) * Math.min(180.0, 18.0 * t + 85.0 * t * t);
            }

            // Pairwise repulsion inside cubic volume
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
                    const rep = overlap * overlap * 100.0;
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

        const maxE = (this.halfExtent || 162.5) * Math.max(0.25, scale);

        for (let i = 0; i < nodePositions.length; i++) {
            const node = nodePositions[i];
            if (!node) continue;

            let x = node.position ? node.position.x : (node.x ?? 0);
            let y = node.position ? node.position.y : (node.y ?? 0);
            let z = node.position ? node.position.z : (node.z ?? 0);

            if (!Number.isFinite(x)) x = 0;
            if (!Number.isFinite(y)) y = 0;
            if (!Number.isFinite(z)) z = 0;

            if (Math.abs(x) > maxE) {
                const sgn = Math.sign(x);
                x = sgn * maxE;
                if (typeof node.vx === 'number' && Math.sign(node.vx) === sgn) node.vx *= -0.35;
            }
            if (Math.abs(y) > maxE) {
                const sgn = Math.sign(y);
                y = sgn * maxE;
                if (typeof node.vy === 'number' && Math.sign(node.vy) === sgn) node.vy *= -0.35;
            }
            if (Math.abs(z) > maxE) {
                const sgn = Math.sign(z);
                z = sgn * maxE;
                if (typeof node.vz === 'number' && Math.sign(node.vz) === sgn) node.vz *= -0.35;
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