/**
 * backend/js/channelAlignment.js
 * Stage 4 Channel Projection & Provenance Alignment Layer for HUD and CH-01..CH-05.
 * Ensures all viewers consume self-describing canonical projections without
 * freeze guards, hardcoded scale hacks, or synthetic fallback values.
 */

export const VALID_PROVENANCE = new Set([
  "exact",
  "reduced_order",
  "unpopulated",
  "degenerate",
]);

export function formatObservableValue(val, provenance, { decimals = 4, unit = "" } = {}) {
  const status = provenance?.status || "unpopulated";
  if (status === "unpopulated") {
    return {
      display: "UNPOPULATED",
      status,
      isNumeric: false,
      missingInputs: provenance?.missing_inputs || [],
    };
  }
  if (status === "degenerate") {
    return {
      display: "DEGENERATE",
      status,
      isNumeric: false,
      notes: provenance?.notes || "",
    };
  }
  if (typeof val !== "number" || !Number.isFinite(val)) {
    return {
      display: "UNPOPULATED",
      status: "unpopulated",
      isNumeric: false,
    };
  }
  const formatted = `${val.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
  return {
    display: formatted,
    status,
    isNumeric: true,
    numericValue: val,
  };
}

export function extractNodeCoords(node) {
  if (!node || typeof node !== "object") return [0, 0, 0];
  if (Array.isArray(node.position) && node.position.length >= 3) {
    return [
      Number.isFinite(node.position[0]) ? node.position[0] : 0,
      Number.isFinite(node.position[1]) ? node.position[1] : 0,
      Number.isFinite(node.position[2]) ? node.position[2] : 0,
    ];
  }
  return [
    Number.isFinite(node.x) ? node.x : 0,
    Number.isFinite(node.y) ? node.y : 0,
    Number.isFinite(node.z) ? node.z : 0,
  ];
}

export class ChannelAlignmentRegistry {
  constructor(streamClient) {
    this.streamClient = streamClient;
    this.handlers = new Map();
    this._unsub = null;

    if (this.streamClient && typeof this.streamClient.on === "function") {
      this._unsub = this.streamClient.on("*", (frame) => {
        this.dispatchFrame(frame);
      });
    }
  }

  registerViewer(channelId, updateFn) {
    if (!channelId || typeof updateFn !== "function") return () => {};
    if (!this.handlers.has(channelId)) {
      this.handlers.set(channelId, new Set());
    }
    this.handlers.get(channelId).add(updateFn);

    const current = this.streamClient?.latestFrame;
    if (current) {
      updateFn(this.buildChannelViewModel(current, channelId), current);
    }

    return () => {
      const set = this.handlers.get(channelId);
      if (set) set.delete(updateFn);
    };
  }

  buildChannelViewModel(frame, channelId) {
    const projections = frame?.projections || {};
    const projection = projections[channelId] || null;
    const observables = frame?.observables || projections?.HUD?.observables || {};

    return {
      schemaVersion: frame?.schema_version,
      frameContractVersion: frame?.frame_contract_version,
      channel: channelId,
      seq: frame?.seq ?? 0,
      step: frame?.step ?? 0,
      timestamp: frame?.timestamp ?? 0,
      mode: frame?.mode || "live",
      modelId: frame?.model_id || "unknown",
      title: frame?.title || "",
      referenceFrame: frame?.reference_frame || "lab_inertial",
      units: frame?.units || {},
      domainBounds: frame?.domain_bounds || { x: [-10, 10], y: [-10, 10], z: [-10, 10] },
      observables,
      projection,
    };
  }

  dispatchFrame(frame) {
    if (!frame || typeof frame !== "object") return;
    for (const [channelId, callbacks] of this.handlers.entries()) {
      const vm = this.buildChannelViewModel(frame, channelId);
      for (const cb of callbacks) {
        cb(vm, frame);
      }
    }
  }

  destroy() {
    if (typeof this._unsub === "function") {
      this._unsub();
      this._unsub = null;
    }
    this.handlers.clear();
  }
}