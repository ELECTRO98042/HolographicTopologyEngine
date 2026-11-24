(async function collectDopplerFrameComparison(frames = ['open', 'spheroid', 'cubed', 'toroidal', 'hyperbolic'], settleMs = 450) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const selectEl = document.getElementById('ref-frame-select');
  const originalFrame = window.referenceFrameManager?.activeFrameType || selectEl?.value || 'open';

  // Ensure Doppler palette/overlay is active so telemetry updates
  const paletteEl = document.getElementById('palette-select');
  if (paletteEl && paletteEl.value !== 'doppler') {
    paletteEl.value = 'doppler';
    paletteEl.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);
  }

  const results = [];

  for (const frame of frames) {
    if (typeof window.setTopologyMode === 'function') {
      window.setTopologyMode(frame);
    } else if (selectEl) {
      selectEl.value = frame;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    await sleep(settleMs);

    const nodes = Array.isArray(window.nodes) ? window.nodes : [];
    const speeds = nodes.map((n) => Math.hypot(n.vx || 0, n.vy || 0, n.vz || 0));
    const avgSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const maxSpeed = speeds.length ? Math.max(...speeds) : 0;

    const mgr = window.dopplerShiftOverlay?.manager;
    const tel = window.dopplerTelemetry || window.dopplerShiftOverlay?.getTelemetry?.() || {};
    const du = window.referenceFrameManager?.dopplerUniforms;

    results.push({
      frame,
      activeFrame: window.referenceFrameManager?.activeFrameType || frame,
      worldScale: window.hudConfig?.worldScale ?? 1.0,
      nodeCount: nodes.length,
      avgSpeed: Number(avgSpeed.toFixed(4)),
      maxSpeed: Number(maxSpeed.toFixed(4)),
      activePairs: tel.activePairs ?? mgr?.tubuleMesh?.count ?? 0,
      activeBeams: mgr?.searchlightMesh?.count ?? 0,
      refUniformBeams: du?.uBeamCount?.value ?? null,
      avgObsShift: tel.avgObserverShift ?? null,
      maxBlueshift: tel.maxBlueshift ?? null,
      minRedshift: tel.minRedshift ?? null,
      avgOriginRadial: tel.avgOriginRadial ?? null,
      avgPairwiseClosing: tel.avgPairwiseClosing ?? null
    });
  }

  // Restore original frame
  if (typeof window.setTopologyMode === 'function') {
    window.setTopologyMode(originalFrame);
  } else if (selectEl) {
    selectEl.value = originalFrame;
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  console.table(results);
  console.log('[Doppler Frame Comparison JSON]', JSON.stringify(results, null, 2));
  window.__dopplerFrameComparison = results;
  return results;
})();