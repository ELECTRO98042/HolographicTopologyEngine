export class SphericalTopology {
    constructor() {
        this.name = 'spheroid';
    }

    calculateTargets(nodes) {
        const count = nodes.length;
        nodes.forEach((node, i) => {
            const phi = Math.acos(-1 + (2 * i) / Math.max(1, count));
            const theta = Math.sqrt(count * Math.PI) * phi;
            const r = 120;
            node.targetX = r * Math.cos(theta) * Math.sin(phi);
            node.targetY = r * Math.sin(theta) * Math.sin(phi);
            node.targetZ = r * Math.cos(phi);
        });
    }

    renderBoundary(ctx, canvas, project3D, scaleMultiplier) {
        // Renders spherical shell wireframe meridians
        const radius = 180 * scaleMultiplier;
        const latSteps = 24;
        const lonSteps = 48;

        ctx.strokeStyle = 'rgba(0, 255, 204, 0.25)';
        ctx.lineWidth = 0.8;

        for (let i = 1; i < latSteps; i++) {
            const lat = (Math.PI / latSteps) * i - Math.PI / 2;
            let points = [];
            for (let j = 0; j <= lonSteps; j++) {
                const lon = (Math.PI * 2 / lonSteps) * j;
                const x = radius * Math.cos(lat) * Math.cos(lon);
                const y = radius * Math.sin(lat);
                const z = radius * Math.cos(lat) * Math.sin(lon);
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