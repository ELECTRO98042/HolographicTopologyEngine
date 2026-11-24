(() => {
  const nodes = Array.isArray(window.nodes) ? window.nodes : [];
  const edges = Array.isArray(window.edges) ? window.edges : [];

  const frameSelect = document.getElementById('ref-frame-select');
  const rfm = window.ReferenceFrameManager || window.referenceFrameManager || null;
  const activeFrame =
    frameSelect?.value ||
    frameSelect?.selectedOptions?.[0]?.textContent?.trim() ||
    rfm?.currentFrame ||
    rfm?.activeFrame ||
    'unknown';

  console.group(`=== REFERENCE FRAME AUDIT: ${activeFrame} ===`);
  console.log('Counts:', {
    frame: activeFrame,
    nodes: nodes.length,
    edges: edges.length
  });

  const rows = nodes.map((n, idx) => {
    const x = n.position ? n.position.x : (n.x ?? 0);
    const y = n.position ? n.position.y : (n.y ?? 0);
    const z = n.position ? n.position.z : (n.z ?? 0);

    const vx = n.velocity ? n.velocity.x : (n.vx ?? 0);
    const vy = n.velocity ? n.velocity.y : (n.vy ?? 0);
    const vz = n.velocity ? n.velocity.z : (n.vz ?? 0);

    const hasBoth = !!(n.position && (n.x !== undefined || n.y !== undefined || n.z !== undefined));
    const coordsMatch = !hasBoth || (
      Math.abs((n.x ?? 0) - (n.position?.x ?? 0)) < 1e-4 &&
      Math.abs((n.y ?? 0) - (n.position?.y ?? 0)) < 1e-4 &&
      Math.abs((n.z ?? 0) - (n.position?.z ?? 0)) < 1e-4
    );

    const finiteAll = [x, y, z, vx, vy, vz].every(v => typeof v === 'number' && Number.isFinite(v));
    const r3D = Math.hypot(x, y, z);
    const rXZ = Math.hypot(x, z);

    return {
      idx,
      id: n.id ?? n.name ?? `node_${idx}`,
      pinned: !!(n.isPinned || n.pinned || n.fixed),
      x: Number(x.toFixed(4)),
      y: Number(y.toFixed(4)),
      z: Number(z.toFixed(4)),
      rXZ: Number(rXZ.toFixed(4)),
      r3D: Number(r3D.toFixed(4)),
      vx: Number(vx.toFixed(4)),
      vy: Number(vy.toFixed(4)),
      vz: Number(vz.toFixed(4)),
      coordsMatch,
      finiteAll
    };
  });

  console.table(rows);

  const r3DValues = rows.map(r => r.r3D);
  const yValues = rows.map(r => r.y);
  const summary = {
    frame: activeFrame,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    allFinite: rows.every(r => r.finiteAll),
    allCoordsMatch: rows.every(r => r.coordsMatch),
    anomalies: rows.filter(r => !r.finiteAll || !r.coordsMatch).length,
    r3D_min: r3DValues.length ? Number(Math.min(...r3DValues).toFixed(4)) : null,
    r3D_max: r3DValues.length ? Number(Math.max(...r3DValues).toFixed(4)) : null,
    y_min: yValues.length ? Number(Math.min(...yValues).toFixed(4)) : null,
    y_max: yValues.length ? Number(Math.max(...yValues).toFixed(4)) : null
  };

  console.log('Frame Summary:', summary);

  // Check edge endpoints & detect any non-ring / chord pairs if 12-node ring
  const nodeIds = new Set(nodes.map((n, i) => String(n.id ?? n.name ?? i)));
  const brokenEdges = edges.filter(e => {
    const s = String(typeof e.source === 'object' ? e.source?.id : e.source);
    const t = String(typeof e.target === 'object' ? e.target?.id : e.target);
    return !s || !t || s === t || !nodeIds.has(s) || !nodeIds.has(t);
  });
  console.log('Edge Integrity:', { totalEdges: edges.length, brokenEdges });

  console.groupEnd();
  return summary;
})();