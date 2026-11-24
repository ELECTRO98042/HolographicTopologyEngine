async function runQECheck(options = {}) {
    const frames = options.frames || ['open', 'spheroid', 'cubed', 'toroidal', 'hyperbolic'];
    const waitMs = options.waitMs ?? 120;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const refMgr = window.referenceFrameManager || null;
    const qeMgr = window.qeTetherManager || null;

    const snapshotNodes = () => {
        const list = Array.isArray(window.nodes) ? window.nodes : [];
        return list.map((n, i) => {
            const p = n?.position || n?.pos || n;
            return {
                key: n?.id ?? n?.name ?? `node-${i}`,
                x: Number((p?.x ?? n?.x ?? 0).toFixed(3)),
                y: Number((p?.y ?? n?.y ?? 0).toFixed(3)),
                z: Number((p?.z ?? n?.z ?? 0).toFixed(3))
            };
        });
    };

    const setFrame = async (frameName) => {
        if (refMgr && typeof refMgr.setMode === 'function') {
            refMgr.setMode(frameName, window.nodes || []);
        } else if (typeof window.setReferenceFrame === 'function') {
            window.setReferenceFrame(frameName);
        }
        await sleep(waitMs);
    };

    const beforeNodes = snapshotNodes();
    const results = [];

    for (const frame of frames) {
        await setFrame(frame);

        const metrics = typeof refMgr?.getBoundaryMetrics === 'function'
            ? refMgr.getBoundaryMetrics()
            : null;

        const pool = Array.isArray(qeMgr?.meshPool) ? qeMgr.meshPool : [];
        const visibleTethers = pool.filter((m) => m && m.visible);
        const pairCount = Array.isArray(window.pairs) ? window.pairs.length : null;

        let nonFiniteCount = 0;
        let maxMidpointDrift = 0;

        if (Array.isArray(window.pairs) && visibleTethers.length > 0) {
            const checkCount = Math.min(window.pairs.length, visibleTethers.length);
            for (let i = 0; i < checkCount; i++) {
                const pair = window.pairs[i];
                const mesh = visibleTethers[i];
                const pos = mesh.position;

                if (
                    !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z) ||
                    !Number.isFinite(pair.ax) || !Number.isFinite(pair.ay) || !Number.isFinite(pair.az) ||
                    !Number.isFinite(pair.bx) || !Number.isFinite(pair.by) || !Number.isFinite(pair.bz)
                ) {
                    nonFiniteCount++;
                    continue;
                }

                const midX = (pair.ax + pair.bx) * 0.5;
                const midY = (pair.ay + pair.by) * 0.5;
                const midZ = (pair.az + pair.bz) * 0.5;
                const drift = Math.hypot(pos.x - midX, pos.y - midY, pos.z - midZ);
                if (drift > maxMidpointDrift) maxMidpointDrift = drift;
            }
        }

        const row = {
            frame,
            activeFrameType: refMgr?.activeFrameType ?? metrics?.frameType ?? 'unknown',
            worldScale: refMgr?.currentScale ?? metrics?.scale ?? 1.0,
            boundingRadius: metrics ? Number(metrics.boundingRadius.toFixed(2)) : null,
            halfExtents: metrics
                ? [
                    Number(metrics.halfExtents.x.toFixed(1)),
                    Number(metrics.halfExtents.y.toFixed(1)),
                    Number(metrics.halfExtents.z.toFixed(1))
                ]
                : null,
            poolSize: pool.length,
            visibleTethers: visibleTethers.length,
            expectedPairs: pairCount,
            nonFiniteCount,
            maxMidpointDrift: Number(maxMidpointDrift.toFixed(4))
        };

        results.push(row);
        console.log('[QE Check]', row);
    }

    const afterNodes = snapshotNodes();
    const movedNodes = [];
    for (let i = 0; i < Math.min(beforeNodes.length, afterNodes.length); i++) {
        const a = beforeNodes[i];
        const b = afterNodes[i];
        const delta = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        if (delta > 0.05) {
            movedNodes.push({ key: a.key, delta: Number(delta.toFixed(3)) });
        }
    }

    console.table(results);
    console.log('[QE Node Invariant Check]', {
        nodeCount: afterNodes.length,
        movedNodesCount: movedNodes.length,
        movedNodes
    });

    return { results, movedNodes };
}

window.runQECheck = runQECheck;
await runQECheck();