(() => {
  const nodes = window.nodes || [];
  const rows = nodes.map((n, i) => {
    const speed = Math.hypot(n.vx || 0, n.vy || 0, n.vz || 0);
    const tier = speed > 1.8 ? 'HOT' : (speed > 0.7 ? 'MED' : 'LOW');
    return {
      i,
      id: n.id,
      core: !!(n.isCore || n.tier === 'BULK_CORE'),
      pinned: !!n.isPinned,
      mass: n.mass ?? 1,
      speed: Number(speed.toFixed(4)),
      tier,
      heatProp: n.heat ?? n.temperature ?? n.thermal ?? null
    };
  });
  console.table(rows);

  const uniqueSpeeds = new Set(rows.map(r => r.speed.toFixed(3))).size;
  const uniqueTiers = new Set(rows.map(r => r.tier)).size;
  console.log({ total: rows.length, uniqueSpeeds, uniqueTiers });
})();