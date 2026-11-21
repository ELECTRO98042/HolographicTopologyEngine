(() => {
  const mgr = window.tensegrityTensionManager;
  if (!mgr) {
    console.warn('[Sigma Inspector] window.tensegrityTensionManager not found.');
    return;
  }

  const engine = mgr.engine;
  console.group('[Sigma Inspector] TensegrityTensionManager & Engine');
  console.log('Config:', mgr.cfg);
  console.log('Engine Config:', engine?.cfg);
  console.log('Group visible:', mgr.group?.visible, 'Position:', mgr.group?.position?.toArray?.());
  console.log('Connector drawRange:', mgr.connectorLines?.geometry?.drawRange);
  console.log('Vector drawRange:', mgr.vectorLines?.geometry?.drawRange);

  const summarizeTelemetry = (t) => {
    if (!t) {
      console.warn('No telemetry object captured.');
      return;
    }
    const pairs = t.pairs || [];
    const dists = pairs.map(p => p.dist).filter(Number.isFinite);
    const strains = pairs.map(p => p.strain).filter(Number.isFinite);
    const norms = pairs.map(p => p.normalizedStress).filter(Number.isFinite);
    const forces = pairs.map(p => p.hookeanForceMag).filter(Number.isFinite);

    const minMax = (arr) => arr.length
      ? { min: Number(Math.min(...arr).toFixed(4)), max: Number(Math.max(...arr).toFixed(4)) }
      : { min: null, max: null };

    console.log('Summary:', {
      activeFrame: t.activeFrame,
      centroid: t.centroid?.toArray?.().map(n => Number(n.toFixed(2))),
      activePairCount: t.activePairCount,
      meanNormalizedStress: Number((t.meanNormalizedStress ?? 0).toFixed(4)),
      maxPairStress: Number((t.maxPairStress ?? 0).toFixed(4)),
      overEquilibrium: Number((t.overEquilibrium ?? 0).toFixed(4)),
      meanImbalance: Number((t.meanImbalance ?? 0).toFixed(4)),
      anisotropicMag: Number((t.tensor?.anisotropicMag ?? 0).toFixed(4)),
      tensorTrace: Number((t.tensor?.trace ?? 0).toFixed(4))
    });

    console.log('Ranges across evaluated pairs:', {
      dist: minMax(dists),
      restLengthSample: pairs[0]?.restLength ?? null,
      strain: minMax(strains),
      hookeanForceMag: minMax(forces),
      normalizedStress: minMax(norms)
    });

    const topPairs = [...pairs]
      .sort((a, b) => (b.normalizedStress ?? 0) - (a.normalizedStress ?? 0))
      .slice(0, 6)
      .map(p => ({
        dist: Number(p.dist.toFixed(2)),
        restLen: Number(p.restLength.toFixed(2)),
        ext: Number(p.extension.toFixed(2)),
        strain: Number(p.strain.toFixed(4)),
        fHooke: Number(p.hookeanForceMag.toFixed(4)),
        normStress: Number(p.normalizedStress.toFixed(4))
      }));
    console.table(topPairs);

    const nodeForces = (t.nodeNetForce || [])
      .map((v, idx) => ({
        nodeIdx: idx,
        netForceMag: Number((v?.length?.() ?? 0).toFixed(4)),
        strainAccum: Number(((t.nodeStrainAccum?.[idx] ?? 0)).toFixed(4)),
        pairs: t.nodePairCount?.[idx] ?? 0
      }))
      .sort((a, b) => b.netForceMag - a.netForceMag)
      .slice(0, 6);
    console.table(nodeForces);
  };

  // If engine already cached telemetry, read it; otherwise wrap evaluate() for one frame
  if (engine && typeof engine.evaluate === 'function' && !engine._inspectedOnce) {
    engine._inspectedOnce = true;
    const origEval = engine.evaluate.bind(engine);
    engine.evaluate = (args) => {
      const res = origEval(args);
      engine.evaluate = origEval;
      delete engine._inspectedOnce;
      console.group('[Sigma Inspector] Live Next-Frame Telemetry');
      summarizeTelemetry(res);
      console.groupEnd();
      return res;
    };
    console.log('Armed one-shot capture for the next update() frame.');
  }

  console.groupEnd();
})();