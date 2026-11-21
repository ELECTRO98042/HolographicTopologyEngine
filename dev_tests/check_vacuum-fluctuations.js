(() => {
  const mgr =
    window.vacuumFluctuationsManager ||
    window.lambdaManager ||
    window.vacuumManager;

  if (!mgr) {
    console.warn('[Lambda Inspector] Vacuum fluctuations manager not found on window (checked vacuumFluctuationsManager, lambdaManager, vacuumManager).');
    return;
  }

  const engine = mgr.engine;
  console.group('[Lambda Inspector] VacuumFluctuationsManager & Engine');
  console.log('Config:', mgr.cfg);
  console.log('Engine Config:', engine?.cfg);
  console.log('Group visible:', mgr.group?.visible, 'Position:', mgr.group?.position?.toArray?.());
  console.log('Aura instanced count:', mgr.ghostAuraInstanced?.count, 'Opacity:', mgr.ghostAuraInstanced?.material?.opacity);
  console.log('Current uniforms:', {
    uTime: mgr.uniforms?.uTime?.value,
    uNoiseFreq: mgr.uniforms?.uNoiseFreq?.value,
    uNoiseSpeed: mgr.uniforms?.uNoiseSpeed?.value,
    uDispAmp: mgr.uniforms?.uDispAmp?.value,
    uLambdaDensity: mgr.uniforms?.uLambdaDensity?.value,
    uShimmerOpacity: mgr.uniforms?.uShimmerOpacity?.value,
    uIntensity: mgr.uniforms?.uIntensity?.value
  });

  const summarizeTelemetry = (t) => {
    if (!t) {
      console.warn('No telemetry object captured.');
      return;
    }
    console.log('Telemetry:', {
      activeFrame: t.activeFrame,
      centroid: t.centroid?.toArray?.().map(n => Number(n.toFixed(2))),
      nodeCount: t.nodeCount,
      evaluatedPairCount: t.evaluatedPairCount,
      meanRadius: Number((t.meanRadius ?? 0).toFixed(4)),
      dispersionNorm: Number((t.dispersionNorm ?? 0).toFixed(4)),
      strainVariance: Number((t.strainVariance ?? 0).toFixed(6)),
      agitationNorm: Number((t.agitationNorm ?? 0).toFixed(4)),
      lambdaDensity: Number((t.lambdaDensity ?? 0).toFixed(4)),
      noiseSpeed: Number((t.noiseSpeed ?? 0).toFixed(4)),
      dispAmp: Number((t.dispAmp ?? 0).toFixed(4))
    });
  };

  if (engine && typeof engine.evaluate === 'function' && !engine._inspectedOnce) {
    engine._inspectedOnce = true;
    const origEval = engine.evaluate.bind(engine);
    engine.evaluate = (args) => {
      const res = origEval(args);
      engine.evaluate = origEval;
      delete engine._inspectedOnce;
      console.group('[Lambda Inspector] Live Next-Frame Telemetry');
      summarizeTelemetry(res);
      console.groupEnd();
      return res;
    };
    console.log('Armed one-shot capture for the next update() frame.');
  }

  console.groupEnd();
})();