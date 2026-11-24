(() => {
  const nodes = Array.isArray(window.nodes) ? window.nodes : [];
  if (!nodes.length) return console.warn('No window.nodes available.');

  const getXYZ = n => ({
    x: n.position ? n.position.x : (n.x ?? 0),
    y: n.position ? n.position.y : (n.y ?? 0),
    z: n.position ? n.position.z : (n.z ?? 0)
  });

  const start = nodes.map(getXYZ);
  setTimeout(() => {
    const end = nodes.map(getXYZ);
    const report = nodes.map((n, idx) => {
      const a = start[idx];
      const b = end[idx];
      const disp = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      return {
        id: n.id ?? n.name ?? idx,
        pinned: !!(n.isPinned || n.pinned || n.fixed),
        disp_1s: Number(disp.toFixed(4)),
        x: Number(b.x.toFixed(4)),
        y: Number(b.y.toFixed(4)),
        z: Number(b.z.toFixed(4))
      };
    });
    console.table(report);
  }, 1000);
})();