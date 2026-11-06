export class CubicLatticeTopology {
    constructor() {
        this.name = 'cubed';
    }

    calculateTargets(nodes) {
        const count = nodes.length;
        const gridSize = Math.ceil(Math.cbrt(count));
        const spacing = 80;
        const offset = ((gridSize - 1) * spacing) / 2;

        nodes.forEach((node, i) => {
            const xi = i % gridSize;
            const yi = Math.floor(i / gridSize) % gridSize;
            const zi = Math.floor(i / (gridSize * gridSize));

            node.targetX = (xi * spacing) - offset;
            node.targetY = (yi * spacing) - offset;
            node.targetZ = (zi * spacing) - offset;
        });
    }

    renderBoundary(ctx, canvas, project3D, scaleMultiplier) {
        const size = 150 * scaleMultiplier;
        const corners = [
            [-size, -size, -size], [size, -size, -size],
            [size, size, -size], [-size, size, -size],
            [-size, -size, size], [size, -size, size],
            [size, size, size], [-size, size, size]
        ];

        const edges = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
        ];

        ctx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
        ctx.lineWidth = 1.0;

        edges.forEach(([s, e]) => {
            const p1 = project3D(corners[s][0], corners[s][1], corners[s][2], canvas.width, canvas.height);
            const p2 = project3D(corners[e][0], corners[e][1], corners[e][2], canvas.width, canvas.height);
            if (p1.scale > 0 && p2.scale > 0) {
                ctx.beginPath();
                ctx.moveTo(p1.px, p1.py);
                ctx.lineTo(p2.px, p2.py);
                ctx.stroke();
            }
        });
    }
}