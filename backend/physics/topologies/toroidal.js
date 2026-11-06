// physics/topologies/toroidal.js
// import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.js';

export class ToroidalTopology {
    constructor() {
        this.name = 'toroidal';
    }

    // Calculate smooth target positions for arbitrary node count N
    calculateTargets(nodes) {
        const count = nodes.length;
        nodes.forEach((node, i) => {
            const R = 120, r = 40;
            const u = (i / Math.max(1, count)) * Math.PI * 2;
            const v = (i * 3) * Math.PI * 2 / Math.max(1, count);
            node.targetX = (R + r * Math.cos(v)) * Math.cos(u);
            node.targetY = (R + r * Math.cos(v)) * Math.sin(u);
            node.targetZ = r * Math.sin(v);
        });
    }

    // Render wireframe boundary onto canvas context
    renderBoundary(ctx, canvas, project3D, scaleMultiplier) {
        const R = 120 * scaleMultiplier;
        const r = 40 * scaleMultiplier;
        const majorSteps = 32;
        const minorSteps = 16;

        ctx.strokeStyle = 'rgba(0, 255, 204, 0.22)';
        ctx.lineWidth = 0.8;

        for (let i = 0; i < majorSteps; i++) {
            const u = (i / majorSteps) * Math.PI * 2;
            let points = [];

            for (let j = 0; j <= minorSteps; j++) {
                const v = (j / minorSteps) * Math.PI * 2;
                const x = (R + r * Math.cos(v)) * Math.cos(u);
                const y = (R + r * Math.cos(v)) * Math.sin(u);
                const z = r * Math.sin(v);
                points.push(project3D(x, y, z, canvas.width, canvas.height));
            }

            for (let j = 0; j < points.length - 1; j++) {
                if (points[j].scale > 0 && points[j + 1].scale > 0) {
                    ctx.beginPath();
                    ctx.moveTo(points[j].px, points[j].py);
                    ctx.lineTo(points[j + 1].px, points[j + 1].py);
                    ctx.stroke();
                }
            }
        }
    }
}