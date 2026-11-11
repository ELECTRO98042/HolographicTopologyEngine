// backend/js/importSanityNormalizer.js
export class ImportSanityNormalizer {
    /**
     * INBOUND: Sanitizes incoming models, enforces 3D spatial standards, 
     * and maps raw data into clean FHPP packets.
     */
    static sanitize(rawData) {
        const warnings = [];
        let parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

        // --- DEBUGGER CAPTURE 3 ---
        console.log("[DEBUG 3 - NORMALIZER ENTRY]", {
            incomingRawData: rawData,
            parsedEdges: parsed.edges,
            parsedKeys: Object.keys(parsed)
        });
        debugger;

        const rawNodes = parsed.nodes || parsed.vertices || [];
        const rawEdges = parsed.edges || parsed.links || parsed.connections || parsed.bonds || parsed.relations || parsed.tethers || [];

        const seenIds = new Set();
        const totalNodes = rawNodes.length;

        const sanitizedNodes = rawNodes.map((n, idx) => {
            const rawType = (n.type || n.category || 'TOPOLOGY').toUpperCase();
            let normalizedType = 'TOPOLOGY';

            if (rawType.includes('BOUNDARY') || rawType.includes('QUBIT')) {
                normalizedType = 'TOPOLOGY';
            } else if (rawType.includes('BULK') || rawType.includes('CORE')) {
                normalizedType = 'METRIC';
            } else if (['METRIC', 'TOPOLOGY', 'FIELD', 'POTENTIAL'].includes(rawType)) {
                normalizedType = rawType;
            }

            let id = n.id !== undefined ? String(n.id) : `Q-${String(idx + 1).padStart(3, '0')}`;

            if (seenIds.has(id)) {
                const newId = `${id}_dup${idx}`;
                warnings.push(`Duplicate node ID '${id}' detected. Renamed to '${newId}'.`);
                id = newId;
            }
            seenIds.add(id);

            let rawX = n.position?.x !== undefined ? n.position.x : (n.x !== undefined ? n.x : 0);
            let rawY = n.position?.y !== undefined ? n.position.y : (n.y !== undefined ? n.y : 0);
            let rawZ = n.position?.z !== undefined ? n.position.z : (n.z !== undefined ? n.z : 0);

            // Fallback editing spread if collapsed at origin
            /*if (rawX === 0 && rawY === 0 && rawZ === 0 && totalNodes > 1) {
                const angle = (idx / totalNodes) * Math.PI * 2;
                const radius = 90.0;
                rawX = Math.cos(angle) * radius;
                rawZ = Math.sin(angle) * radius;
                rawY = 0.0;
            }*/

            return {
                ...n,
                id: id,
                name: n.name || n.label || id || `Node-${idx + 1}`,
                type: normalizedType,
                category: n.category || 'BULK_CORE',
                tier: n.tier || 'BOUNDARY',
                formula: n.formula || 'g_μν = η_μν',
                x: Number(rawX.toFixed(4)),
                y: Number(rawY.toFixed(4)),
                z: Number(rawZ.toFixed(4)),
                color: n.color || '#00ffcc',
                attrs: n.attrs || {
                    mass: n.mass || 1.0,
                    temperature: n.temperature || 50.0,
                    dampingFactor: n.dampingFactor || 0.90
                }
            };
        });

        // Robust multi-tier edge resolution across root, wrapper objects, and node definitions
        const edges = rawEdges.map((e, idx) => {
            const srcRaw = e.source !== undefined ? e.source : (e.from !== undefined ? e.from : e.sourceId);
            const tgtRaw = e.target !== undefined ? e.target : (e.to !== undefined ? e.to : e.targetId);

            return {
                ...e,
                index: idx,
                source: String(typeof srcRaw === 'object' && srcRaw !== null ? (srcRaw.id || srcRaw.name) : srcRaw),
                target: String(typeof tgtRaw === 'object' && tgtRaw !== null ? (tgtRaw.id || tgtRaw.name) : tgtRaw),
                label: e.label || 'Tether'
            };
        });

        console.debug("[FHPP PIPELINE TEST] Sanitized Inbound Payload:", {
            nodeCount: sanitizedNodes.length,
            edgeCount: edges.length,
            sampleAttrs: sanitizedNodes[0]?.attrs
        });

        return {
            ...parsed,
            version: parsed.version || '2.9.0',
            coordinate_system: '3D',
            timestamp: new Date().toISOString(),
            nodes: sanitizedNodes,
            edges: edges, // Ensure sanitized edges array is explicitly included here
            warnings
        };
    }

    /**
     * OUTBOUND: Formats the staged model into a pristine 1:1 FHPP payload 
     * for the Main HUD telemetry stream without scaling distortion.
     */
    static formatForMainHUD(stagedModel) {
        if (!stagedModel || !stagedModel.nodes) {
            console.error("[Normalizer] Invalid staged model provided for Main HUD export.");
            return { nodes: [], edges: [] };
        }

        const formattedNodes = stagedModel.nodes.map(n => ({
            ...n,
            id: n.id,
            name: n.name || n.label || n.id,
            type: n.type || 'TOPOLOGY_NODE',
            category: n.category || 'BULK_CORE',
            tier: n.tier || 'BOUNDARY',
            color: n.color || '#00ffcc',
            x: Number((n.x || 0).toFixed(4)),
            y: Number((n.y || 0).toFixed(4)),
            z: Number((n.z || 0).toFixed(4)),
            attrs: n.attrs || {}
        }));

        const formattedEdges = (stagedModel.edges || stagedModel.connections || []).map(e => ({
            ...e,
            source: typeof e.source === 'object' ? (e.source.id || e.source.name) : e.source,
            target: typeof e.target === 'object' ? (e.target.id || e.target.name) : e.target,
            label: e.label || 'Commit Tether'
        }));

        return {
            type: 'SYNC_FROM_BUILDER',
            version: '2.9.0',
            coordinate_system: '3D',
            timestamp: Date.now(),
            nodes: formattedNodes,
            edges: formattedEdges,
            connections: formattedEdges
        };
        
    }
}