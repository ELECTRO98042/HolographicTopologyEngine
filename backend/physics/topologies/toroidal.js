import * as THREE from '/js/vendor/graphics/three.js';

export class ToroidalTopology {
    constructor() {
        this.name = 'toroidal';
        this.outerMajorR = 275;
        this.outerTubeR = 65;
        this.coreMajorR = 220;
        this.minSeparation = 48;
    }

    createMesh(scale = 1.0) {
        const group = new THREE.Group();
        group.name = 'manifold_toroidal';

        const torusConfig = [
            { majorR: 50, tube: 15, color: 0xffffff, opacity: 0.02 },
            { majorR: 85, tube: 25, color: 0xfacc15, opacity: 0.03 },
            { majorR: 125, tube: 35, color: 0xf97316, opacity: 0.04 },
            { majorR: 170, tube: 45, color: 0xef4444, opacity: 0.07 },
            { majorR: 220, tube: 55, color: 0xa855f7, opacity: 0.09 },
            { majorR: 275, tube: 65, color: 0x3b82f6, opacity: 0.08 }
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
        const count = Math.max(1, nodes.length);
        const R = this.coreMajorR;

        nodes.forEach((node, i) => {
            const u = (i / count) * 2 * Math.PI;
            node.targetX = R * Math.cos(u);
            node.targetY = 0;
            node.targetZ = R * Math.sin(u);
        });
    }

    _tubeOffset(x, y, z, majorR, fallbackAngle = 0) {
        const rho = Math.hypot(x, z);
        let cx = majorR * Math.cos(fallbackAngle);
        let cz = majorR * Math.sin(fallbackAngle);
        if (rho > 1e-4) {
            cx = (x / rho) * majorR;
            cz = (z / rho) * majorR;
        }
        const dx = x - cx;
        const dy = y;
        const dz = z - cz;
        const dist = Math.hypot(dx, dy, dz);
        return { cx, cz, dx, dy, dz, dist, rho };
    }

    applyBoundaryForces(nodes, dt = 0.016, scale = 1.0, time = 0) {
        if (!Array.isArray(nodes) || nodes.length === 0) return;

        const s = Math.max(0.25, scale);
        const outerMajorR = (this.outerMajorR || 275) * s;
        const maxTubeR = (this.outerTubeR || 65) * s;
        const softTubeR = maxTubeR * 0.82;
        const span = Math.max(1.0, maxTubeR - softTubeR);
        const channelMajorR = (this.coreMajorR || 220) * s;
        const minSep = (this.minSeparation || 48) * Math.max(0.5, Math.min(2.0, s));

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (!node || node.isPinned || node === window.selectedNode) continue;

            const x = node.position ? node.position.x : (node.x ?? 0);
            const y = node.position ? node.position.y : (node.y ?? 0);
            const z = node.position ? node.position.z : (node.z ?? 0);

            let fx = node.fx || 0;
            let fy = node.fy || 0;
            let fz = node.fz || 0;

            const fallbackAngle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
            const { dx, dy, dz, dist, rho } = this._tubeOffset(x, y, z, outerMajorR, fallbackAngle);

            // 1. Soft outer torus tube-wall containment
            if (dist > softTubeR && dist > 1e-4) {
                const nx = dx / dist;
                const ny = dy / dist;
                const nz = dz / dist;
                const t = (dist - softTubeR) / span;
                const inward = Math.min(180.0, 18.0 * t + 85.0 * t * t);
                fx -= nx * inward;
                fy -= ny * inward;
                fz -= nz * inward;
            }

            // 2. Magnetic flux-axis centering (major radius + y = 0 horizontal plane)
            const theta = rho > 1e-4 ? Math.atan2(z, x) : fallbackAngle;
            const targetCx = Math.cos(theta) * channelMajorR;
            const targetCz = Math.sin(theta) * channelMajorR;
            fx += (targetCx - x) * 0.65;
            fz += (targetCz - z) * 0.65;
            fy += (-y) * 0.65;

            // 3. Symmetric 3D pairwise repulsion so nodes spread evenly around the flux ring
            for (let j = 0; j < nodes.length; j++) {
                if (i === j) continue;
                const other = nodes[j];
                if (!other) continue;

                const ox = other.position ? other.position.x : (other.x ?? 0);
                const oy = other.position ? other.position.y : (other.y ?? 0);
                const oz = other.position ? other.position.z : (other.z ?? 0);

                let pdx = x - ox;
                let pdy = y - oy;
                let pdz = z - oz;
                let pdist = Math.hypot(pdx, pdy, pdz);

                if (pdist < 1e-4) {
                    const angle = ((i - j) * 2.3999632) + time * 0.05;
                    pdx = Math.cos(angle);
                    pdy = 0;
                    pdz = Math.sin(angle);
                    pdist = 1.0;
                }

                if (pdist < minSep) {
                    const overlap = (minSep - pdist) / minSep;
                    const rep = overlap * overlap * 105.0;
                    fx += (pdx / pdist) * rep;
                    fy += (pdy / pdist) * rep * 0.35;
                    fz += (pdz / pdist) * rep;
                }
            }

            node.fx = fx;
            node.fy = fy;
            node.fz = fz;
        }
    }

    enforceConstraints(nodePositions, scale = 1.0) {
        if (!Array.isArray(nodePositions) || nodePositions.length === 0) return nodePositions;

        const s = Math.max(0.25, scale);
        const majorR = (this.outerMajorR || 275) * s;
        const maxTubeR = (this.outerTubeR || 65) * s;

        for (let i = 0; i < nodePositions.length; i++) {
            const node = nodePositions[i];
            if (!node) continue;

            let x = node.position ? node.position.x : (node.x ?? 0);
            let y = node.position ? node.position.y : (node.y ?? 0);
            let z = node.position ? node.position.z : (node.z ?? 0);

            if (!Number.isFinite(x)) x = 0;
            if (!Number.isFinite(y)) y = 0;
            if (!Number.isFinite(z)) z = 0;

            const fallbackAngle = (i / Math.max(1, nodePositions.length)) * Math.PI * 2;
            const { cx, cz, dx, dy, dz, dist } = this._tubeOffset(x, y, z, majorR, fallbackAngle);
            if (dist > maxTubeR && dist > 1e-4) {
                const nx = dx / dist;
                const ny = dy / dist;
                const nz = dz / dist;

                x = cx + nx * maxTubeR;
                y = ny * maxTubeR;
                z = cz + nz * maxTubeR;

                const vx = node.vx || 0;
                const vy = node.vy || 0;
                const vz = node.vz || 0;
                const vRad = vx * nx + vy * ny + vz * nz;
                if (vRad > 0) {
                    node.vx = (vx - nx * vRad) * 0.9;
                    node.vy = (vy - ny * vRad) * 0.9;
                    node.vz = (vz - nz * vRad) * 0.9;
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