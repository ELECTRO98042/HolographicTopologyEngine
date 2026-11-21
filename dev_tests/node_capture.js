(() => {
    const readNodes = () => {
        const list = Array.isArray(window.nodes) ? window.nodes : [];
        return list.map((n, i) => {
            const x = n.position ? n.position.x : (n.x ?? 0);
            const y = n.position ? n.position.y : (n.y ?? 0);
            const z = n.position ? n.position.z : (n.z ?? 0);
            return {
                idx: i,
                id: n.id || n.name || `node-${i}`,
                label: (n.data && n.data.name) || n.name || n.id || `node-${i}`,
                x: Number(Number(x).toFixed(3)),
                y: Number(Number(y).toFixed(3)),
                z: Number(Number(z).toFixed(3)),
                vx: Number(Number(n.vx ?? 0).toFixed(3)),
                vy: Number(Number(n.vy ?? 0).toFixed(3)),
                vz: Number(Number(n.vz ?? 0).toFixed(3)),
                isCore: Boolean(n.isCore || n.tier === 'BULK_CORE'),
                isPinned: Boolean(n.isPinned)
            };
        });
    };

    const findOverlaps = (pts) => {
        const hits = [];
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z);
                if (d < 2.0) {
                    hits.push(`${pts[i].label} <-> ${pts[j].label} (dist=${d.toFixed(4)})`);
                }
            }
        }
        return hits;
    };

    const dumpSnapshot = (stage, meta = '') => {
        const pts = readNodes();
        const overlaps = findOverlaps(pts);
        console.group(`[FrameTrace] ${stage} ${meta}`);
        console.log('activeFrameType:', window.referenceFrameManager?.activeFrameType, '| hudMode:', window.hudMode);
        console.table(pts);
        if (overlaps.length) {
            console.warn('Overlapping nodes (< 2.0 units):', overlaps);
        }
        console.groupEnd();
    };

    const attachHooks = () => {
        const rfm = window.referenceFrameManager;
        if (rfm && !rfm.__frameTraceWrapped) {
            rfm.__frameTraceWrapped = true;

            const origSwitchFrame = rfm.switchFrame.bind(rfm);
            rfm.switchFrame = async function (frameType, scale) {
                dumpSnapshot('BEFORE switchFrame', `target="${frameType}" scale=${scale}`);
                const res = await origSwitchFrame(frameType, scale);
                dumpSnapshot('AFTER switchFrame', `target="${frameType}" scale=${scale}`);

                // Also sample the next 5 frames to see if physics/overlay shifts nodes right after switch
                let f = 0;
                const stepSample = () => {
                    f++;
                    dumpSnapshot(`POST+${f}f`, `frame="${rfm.activeFrameType}"`);
                    if (f < 5) requestAnimationFrame(stepSample);
                };
                requestAnimationFrame(stepSample);
                return res;
            };

            const origSetMode = rfm.setMode.bind(rfm);
            rfm.setMode = function (mode, nodes) {
                dumpSnapshot('BEFORE rfm.setMode', `mode="${mode}"`);
                const res = origSetMode(mode, nodes);
                dumpSnapshot('AFTER rfm.setMode', `mode="${mode}"`);
                return res;
            };
        }

        const hudApi = window.HUDRenderer || window.hudViewport;
        if (hudApi && typeof hudApi.setMode === 'function' && !hudApi.__frameTraceWrapped) {
            hudApi.__frameTraceWrapped = true;
            const origHudSetMode = hudApi.setMode.bind(hudApi);
            hudApi.setMode = function (mode) {
                dumpSnapshot('BEFORE HUD.setMode', `mode="${mode}"`);
                const res = origHudSetMode(mode);
                dumpSnapshot('AFTER HUD.setMode', `mode="${mode}"`);
                return res;
            };
        }
    };

    attachHooks();
    window.__dumpFrameNodes = (label = 'MANUAL') => dumpSnapshot(label);
    console.log('FrameTrace hooks armed. Switch reference frames now (or call __dumpFrameNodes() anytime).');
})();