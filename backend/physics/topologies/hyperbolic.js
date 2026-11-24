import * as THREE from 'three';

export class HyperbolicTopology {
    constructor() {
        this.name = 'hyperbolic';
        this.outerThroat = 230;
        this.outerHeight = 295;
        this.guideThroat = 115;
        this.minSeparation = 42;
    }

    createMesh(scale = 1.0) {
        const group = new THREE.Group();
        group.name = 'manifold_hyperbolic';
        group.position.set(0, 0, 0);
        group.scale.set(scale, scale, scale);

        const hyperConfig = [
            { throat: 30, height: 70, color: 0xffffff, opacity: 0.03 },
            { throat: 60, height: 105, color: 0xfacc15, opacity: 0.04 },
            { throat: 95, height: 145, color: 0xf97316, opacity: 0.05 },
            { throat: 135, height: 190, color: 0xef4444, opacity: 0.07 },
            { throat: 180, height: 240, color: 0xa855f7, opacity: 0.09 },
            { throat: 230, height: 295, color: 0x3b82f6, opacity: 0.08 }
        ];

        hyperConfig.forEach((cfg, index) => {
            const points = [];
            const segments = 24;

            for (let j = 0; j <= segments; j++) {
                const v = (j / segments) * 2.0 - 1.0;
                const yCoord = v * cfg.height;
                const radius = cfg.throat * Math.cosh(v * 1.1);
                points.push(new THREE.Vector2(radius, yCoord));
            }

            const geometry = new THREE.LatheGeometry(points, 24, 0, Math.PI * 2);
            geometry.computeBoundingSphere();
            geometry.computeBoundingBox();

            const material = new THREE.MeshBasicMaterial({
                color: cfg.color,
                wireframe: true,
                transparent: true,
                opacity: cfg.opacity,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = `hyperbolic_shell_${index}`;
            group.add(mesh);
        });

        const waistMat = new THREE.LineBasicMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.25,
            blending: THREE.AdditiveBlending
        });

        const waistR = 30;
        const waistPts = [];
        const segs = 48;
        for (let i = 0; i <= segs; i++) {
            const theta = (i / segs) * 2 * Math.PI;
            waistPts.push(new THREE.Vector3(waistR * Math.cos(theta), 0, waistR * Math.sin(theta)));
        }

        const waistLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(waistPts), waistMat);
        group.add(waistLine);

        group.updateMatrixWorld(true);
        return group;
    }

    calculateTargets(nodes) {
        const count = Math.max(1, nodes.length);
        nodes.forEach((node, i) => {
            const u = (i / count) * 2 * Math.PI;
            const r = this.guideThroat;
            node.targetX = r * Math.cos(u);
            node.targetY = 0;
            node.targetZ = r * Math.sin(u);
        });
    }

    applyBoundaryForces(nodes, dt = 0.016, scale = 1.0, time = 0) {
        if (!Array.isArray(nodes) || nodes.length === 0) return;

        const s = Math.max(0.25, scale);
        const outerH = this.outerHeight || 295;
        const maxH = outerH * s;
        const softH = maxH * 0.85;
        const hSpan = Math.max(1.0, maxH - softH);
        const throat = this.outerThroat || 230;
        const guideThroat = (this.guideThroat || 115) * s;
        const minSep = (this.minSeparation || 42) * Math.max(0.5, Math.min(2.0, s));

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (!node || node.isPinned || node === window.selectedNode) continue;

            const x = node.position ? node.position.x : (node.x ?? 0);
            const y = node.position ? node.position.y : (node.y ?? 0);
            const z = node.position ? node.position.z : (node.z ?? 0);

            let fx = node.fx || 0;
            let fy = node.fy || 0;
            let fz = node.fz || 0;

            // 1. Soft top/bottom height containment
            const absY = Math.abs(y);
            if (absY > softH) {
                const tY = (absY - softH) / hSpan;
                fy -= Math.sign(y) * Math.min(180.0, 18.0 * tY + 85.0 * tY * tY);
            }

            // 2. Soft outer hyperboloid wall containment
            const v = Math.max(-1.0, Math.min(1.0, (y / s) / outerH));
            const maxRho = throat * Math.cosh(v * 1.1) * s;
            const softRho = maxRho * 0.85;
            const rhoSpan = Math.max(1.0, maxRho - softRho);
            const rho = Math.hypot(x, z);

            if (rho > softRho && rho > 1e-4) {
                const tR = (rho - softRho) / rhoSpan;
                const pullR = Math.min(180.0, 18.0 * tR + 85.0 * tR * tR);
                fx -= (x / rho) * pullR;
                fz -= (z / rho) * pullR;
            }

            // 3. Conformal hyperboloid throat potential & level-plane (y = 0) alignment
            const preferredRho = guideThroat * Math.cosh(v * 1.1);
            const nx = rho > 1e-4 ? x / rho : 1.0;
            const nz = rho > 1e-4 ? z / rho : 0.0;
            const radialDelta = preferredRho - rho;
            fx += nx * radialDelta * 0.65;
            fz += nz * radialDelta * 0.65;

            // Level axial restoring force toward y = 0 (horizontal floor/waist alignment)
            fy += (-y) * 0.15;

            // 4. Symmetric pairwise repulsion so unpinned nodes space out evenly without clumping
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
                    dy = 0;
                    dz = Math.sin(angle);
                    dist = 1.0;
                }

                if (dist < minSep) {
                    const overlap = (minSep - dist) / minSep;
                    const rep = overlap * overlap * 95.0;
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

        const s = Math.max(0.25, scale);
        const outerH = this.outerHeight || 295;
        const maxH = outerH * s;
        const throat = this.outerThroat || 230;

        for (let i = 0; i < nodePositions.length; i++) {
            const node = nodePositions[i];
            if (!node) continue;

            let x = node.position ? node.position.x : (node.x ?? 0);
            let y = node.position ? node.position.y : (node.y ?? 0);
            let z = node.position ? node.position.z : (node.z ?? 0);

            if (!Number.isFinite(x)) x = 0;
            if (!Number.isFinite(y)) y = 0;
            if (!Number.isFinite(z)) z = 0;

            if (Math.abs(y) > maxH) {
                const signY = Math.sign(y);
                y = signY * maxH;
                if (typeof node.vy === 'number' && Math.sign(node.vy) === signY) {
                    node.vy *= -0.35;
                }
            }

            const v = Math.max(-1.0, Math.min(1.0, (y / s) / outerH));
            const maxRho = throat * Math.cosh(v * 1.1) * s;
            const rho = Math.hypot(x, z);

            if (rho > maxRho && rho > 1e-4) {
                const nx = x / rho;
                const nz = z / rho;
                x = nx * maxRho;
                z = nz * maxRho;

                const vx = node.vx || 0;
                const vz = node.vz || 0;
                const vRad = vx * nx + vz * nz;
                if (vRad > 0) {
                    node.vx = (vx - nx * vRad) * 0.9;
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