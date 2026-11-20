import * as THREE from '/js/vendor/graphics/three.js';

export class ToroidalTopology {
    constructor() {
        this.name = 'toroidal';
        this.outerMajorR = 275;
        this.outerTubeR = 65;
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

    _tubeOffset(x, y, z, majorR) {
        const rho = Math.hypot(x, z);
        let cx = majorR;
        let cz = 0;
        if (rho > 1e-4) {
            cx = (x / rho) * majorR;
            cz = (z / rho) * majorR;
        }
        const dx = x - cx;
        const dy = y;
        const dz = z - cz;
        const dist = Math.hypot(dx, dy, dz);
        return { cx, cz, dx, dy, dz, dist };
    }

    applyBoundaryForces(nodes, dt = 0.016, scale = 1.0, time = 0) {
        if (!Array.isArray(nodes) || nodes.length === 0) return;

        const s = Math.max(0.25, scale);
        const majorR = (this.outerMajorR || 275) * s;
        const maxTubeR = (this.outerTubeR || 65) * s;
        const softTubeR = maxTubeR * 0.85;
        const span = Math.max(1.0, maxTubeR - softTubeR);

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (!node || node.isPinned || node === window.selectedNode) continue;

            const x = node.position ? node.position.x : (node.x ?? 0);
            const y = node.position ? node.position.y : (node.y ?? 0);
            const z = node.position ? node.position.z : (node.z ?? 0);

            let fx = node.fx || 0;
            let fy = node.fy || 0;
            let fz = node.fz || 0;

            const { dx, dy, dz, dist } = this._tubeOffset(x, y, z, majorR);
            if (dist > softTubeR && dist > 1e-4) {
                const nx = dx / dist;
                const ny = dy / dist;
                const nz = dz / dist;
                const t = (dist - softTubeR) / span;
                const inward = Math.min(140.0, 12.0 * t + 65.0 * t * t);
                fx -= nx * inward;
                fy -= ny * inward;
                fz -= nz * inward;
            }

            // Gentle 3D off-axis drift so unpinned nodes stay active inside the toroidal volume
            const phase = i * 2.094 + time * 0.35;
            fx += Math.cos(phase) * 2.5;
            fy += Math.sin(phase * 0.8) * 2.0;
            fz += Math.sin(phase) * 2.5;

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

            const { cx, cz, dx, dy, dz, dist } = this._tubeOffset(x, y, z, majorR);
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