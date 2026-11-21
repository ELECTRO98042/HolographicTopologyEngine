(() => {
  const nodes = window.nodes || [];
  const summary = nodes.map((n, i) => {
    const x = n.position ? n.position.x : (n.x ?? 0);
    const y = n.position ? n.position.y : (n.y ?? 0);
    const z = n.position ? n.position.z : (n.z ?? 0);
    const r = Math.hypot(x, y, z);
    const speed = Math.hypot(n.vx || 0, n.vy || 0, n.vz || 0);
    return { i, id: n.id, x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1), r: +r.toFixed(1), speed: +speed.toFixed(3), pinned: !!n.isPinned };
  });
  console.table(summary);
})();