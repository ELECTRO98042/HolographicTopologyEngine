(() => {
  const nodes = window.nodes || [];
  const cfg = window.hudConfig || {};
  const empOv = window.empOverlay;
  const empUni = window.referenceFrameManager?.empUniforms;

  console.log('EM Config:', {
    palette: cfg.colorPalette,
    overlays: cfg.overlays,
    empOverlayActive: empOv?.active ?? null,
    pulseRingCount: Array.isArray(empOv?.pulseRings) ? empOv.pulseRings.length : null,
    uEmpActive: empUni?.uEmpActive?.value ?? null
  });

  const rows = nodes.map((n, i) => {
    const vx = n.vx || 0;
    const vy = n.vy || 0;
    const vz = n.vz || 0;
    const speed = Math.hypot(vx, vy, vz);
    const isCore = !!(n.isCore || n.tier === 'BULK_CORE');
    const px = n.position ? n.position.x : (n.x || 0);
    const py = n.position ? n.position.y : (n.y || 0);
    const pz = n.position ? n.position.z : (n.z || 0);

    return {
      i,
      id: n.id,
      core: isCore,
      pinned: !!n.isPinned,
      qftType: n.qftType ?? null,
      charge: n.charge ?? n.q ?? null,
      speed: Number(speed.toFixed(4)),
      vx: Number(vx.toFixed(3)),
      vy: Number(vy.toFixed(3)),
      vz: Number(vz.toFixed(3)),
      rFromOrigin: Number(Math.hypot(px, py, pz).toFixed(2))
    };
  });

  console.table(rows);

  if (empUni?.uEmpRadii?.value) {
    const activeRings = [];
    const radii = empUni.uEmpRadii.value;
    const ops = empUni.uEmpOpacities?.value || [];
    for (let j = 0; j < radii.length; j++) {
      if (radii[j] > 0 || ops[j] > 0) {
        activeRings.push({
          slot: j,
          radius: Number(radii[j].toFixed(2)),
          opacity: Number((ops[j] ?? 0).toFixed(3))
        });
      }
    }
    console.log('Active EM Uniform Rings:', activeRings);
  }
})();