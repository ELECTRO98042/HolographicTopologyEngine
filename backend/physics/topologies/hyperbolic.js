export class HyperbolicTopology {
    constructor(maxRadius = 200) {
        this.maxRadius = maxRadius;
    }

    enforceConstraints(positions) {
        // Apply Poincaré disk compression near the conformal boundary
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i], y = positions[i + 1], z = positions[i + 2];
            const r = Math.sqrt(x * x + y * y + z * z);
            if (r > this.maxRadius) {
                const scale = this.maxRadius / r;
                positions[i] *= scale;
                positions[i + 1] *= scale;
                positions[i + 2] *= scale;
            }
        }

        // Correctly placed at the bottom of the function after the loop completes
        return positions;
    }

    calculateTargets(nodes) {
        if (!nodes) {
            console.warn("[HyperbolicTopology] calculateTargets received null/empty nodes.");
            return;
        }
        try {
            nodes.forEach((node, i) => {
                const sinhR = Math.sinh((i + 1) * 0.4) * 30;
                const angle = i * 2.4;
                node.targetX = sinhR * Math.cos(angle);
                node.targetY = (i % 2 === 0 ? 1 : -1) * (i * 15);
                node.targetZ = sinhR * Math.sin(angle);

                if (isNaN(node.targetX) || isNaN(node.targetY) || isNaN(node.targetZ)) {
                    console.error(`[HyperbolicTopology] NaN detected at index ${i}`);
                }
            });
            console.log(`[HyperbolicTopology] Successfully computed targets for ${nodes.length} nodes.`);
        } catch (err) {
            console.error("[HyperbolicTopology] Error in calculateTargets:", err);
        }
    }
}