import * as THREE from '/js/vendor/graphics/three.js';

export class OpenSpaceTopology {
    constructor() {
        this.name = 'open';
        this.outerRadius = 260;
        this.equilibriumDist = 90;
    }

    createMesh(scale = 1.0) {
        const group = new THREE.Group();
        group.name = 'manifold_open';

        // 6 Concentric Spin Network Shells mapped from inner core to outer boundary:
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

        return group;
    }

    calculateTargets(nodes) {
        // Open space leaves node positioning entirely to organic physics / telemetry stream
    }

    applyBoundaryForces(nodes, dt = 0.016, scale = 1.0, time = 0) {
        if (!Array.isArray(nodes) || nodes.length === 0) return;

        const maxR = this.outerRadius * Math.max(0.25, scale);
        const softR = maxR * 0.85;
        const targetDist = this.equilibriumDist * Math.max(0.5, Math.min(2.0, scale));

        for (let i = 0; i < nodes.length; i++) {
            const a = nodes[i];
            if (!a || a.isPinned || a === window.selectedNode) continue;

            const ax = a.position ? a.position.x : (a.x ?? 0);
            const ay = a.position ? a.position.y : (a.y ?? 0);
            const az = a.position ? a.position.z : (a.z ?? 0);

            let fx = a.fx || 0;
            let fy = a.fy || 0;
            let fz = a.fz || 0;

            // Gentle pairwise separation & spring equilibrium so nodes don't stack or stay collinear
            for (let j = 0; j < nodes.length; j++) {
                if (i === j) continue;
                const b = nodes[j];
                if (!b) continue;

                const bx = b.position ? b.position.x : (b.x ?? 0);
                const by = b.position ? b.position.y : (b.y ?? 0);
                const bz = b.position ? b.position.z : (b.z ?? 0);

                let dx = ax - bx;
                let dy = ay - by;
                let dz = az - bz;
                let dist = Math.hypot(dx, dy, dz);

                if (dist < 1e-4) {
                    const angle = (i * 2.39996 + j * 1.1) + time * 0.1;
                    dx = Math.cos(angle);
                    dy = Math.sin(angle * 0.7);
                    dz = Math.sin(angle);
                    dist = 1.0;
                }

                const nx = dx / dist;
                const ny = dy / dist;
                const nz = dz / dist;

                if (dist < targetDist) {
                    const push = ((targetDist - dist) / targetDist) * 35.0;
                    fx += nx * push;
                    fy += ny * push;
                    fz += nz * push;
                } else if (dist > targetDist * 1.6) {
                    const pull = Math.min(18.0, ((dist - targetDist * 1.6) / targetDist) * 12.0);
                    fx -= nx * pull;
                    fy -= ny * pull;
                    fz -= nz * pull;
                }
            }

            // Soft outer boundary containment around the outermost open-space shell
            const r = Math.hypot(ax, ay, az);
            if (r > softR && r > 1e-4) {
                const excess = (r - softR) / Math.max(1.0, maxR - softR);
                const pullIn = Math.min(80.0, excess * excess * 45.0);
                fx -= (ax / r) * pullIn;
                fy -= (ay / r) * pullIn;
                fz -= (az / r) * pullIn;
            }

            // Gentle 3D off-axis drift so collinear nodes can break out into 3D space
            const phase = i * 2.1 + time * 0.4;
            fx += Math.cos(phase) * 4.0;
            fy += Math.sin(phase * 0.8) * 3.0;
            fz += Math.sin(phase) * 5.0;

            a.fx = fx;
            a.fy = fy;
            a.fz = fz;
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
                const ratio = maxR / r;
                x *= ratio;
                y *= ratio;
                z *= ratio;

                if (typeof node.vx === 'number') node.vx *= 0.85;
                if (typeof node.vy === 'number') node.vy *= 0.85;
                if (typeof node.vz === 'number') node.vz *= 0.85;
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