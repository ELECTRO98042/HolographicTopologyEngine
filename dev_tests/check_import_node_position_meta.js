(() => {
  const nodes = Array.isArray(window.nodes) ? window.nodes : [];
  const edges = Array.isArray(window.edges) ? window.edges : [];

  console.group('HUD Imported Model & Metric Audit');
  console.log('Counts:', { nodes: nodes.length, edges: edges.length });

  const rows = nodes.map((n, i) => {
    const x = n.position ? n.position.x : n.x;
    const y = n.position ? n.position.y : n.y;
    const z = n.position ? n.position.z : n.z;

    const flatX = n.x;
    const flatY = n.y;
    const flatZ = n.z;
    const posX = n.position?.x;
    const posY = n.position?.y;
    const posZ = n.position?.z;

    const vx = n.velocity ? n.velocity.x : n.vx;
    const vy = n.velocity ? n.velocity.y : n.vy;
    const vz = n.velocity ? n.velocity.z : n.vz;

    const hasBoth = !!(n.position && (flatX !== undefined || flatY !== undefined || flatZ !== undefined));
    const coordsMatch = !hasBoth || (
      Math.abs((flatX ?? 0) - (posX ?? 0)) < 1e-4 &&
      Math.abs((flatY ?? 0) - (posY ?? 0)) < 1e-4 &&
      Math.abs((flatZ ?? 0) - (posZ ?? 0)) < 1e-4
    );

    const finiteAll = [x, y, z, vx ?? 0, vy ?? 0, vz ?? 0].every(v => typeof v === 'number' && Number.isFinite(v));
    const radialXZ = Math.hypot(x ?? 0, z ?? 0);

    return {
      i,
      id: n.id ?? n.name ?? `node_${i}`,
      pinned: !!(n.isPinned || n.pinned || n.fixed),
      x: Number((x ?? 0).toFixed(4)),
      y: Number((y ?? 0).toFixed(4)),
      z: Number((z ?? 0).toFixed(4)),
      radialXZ: Number(radialXZ.toFixed(4)),
      vx: Number((vx ?? 0).toFixed(4)),
      vy: Number((vy ?? 0).toFixed(4)),
      vz: Number((vz ?? 0).toFixed(4)),
      coordsMatch,
      finiteAll
    };
  });

  console.table(rows);

  const anomalies = rows.filter(r => !r.finiteAll || !r.coordsMatch);
  console.log('Coordinate/Finite Anomalies:', anomalies.length, anomalies);
  console.log('Sample Edges:', edges.slice(0, 15));
  console.groupEnd();
})();