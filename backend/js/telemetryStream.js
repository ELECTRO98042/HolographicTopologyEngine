/**
 * backend/js/telemetryStream.js
 * Stage 3 Unified Telemetry Stream Client
 * Consumes self-describing frames from main.py, enforces monotonic seq ordering,
 * preserves mode & provenance metadata, and fans out channel projections.
 */

const BROADCAST_CHANNEL_NAME = "hte_unified_telemetry_v3";

export class TelemetryStreamClient {
  constructor({
    wsUrl = null,
    httpBase = "",
    reconnectDelayMs = 1000,
    enableBroadcast = true,
  } = {}) {
    this.httpBase = httpBase;
    this.reconnectDelayMs = reconnectDelayMs;
    this.wsUrl = wsUrl || this._resolveDefaultWsUrl();

    this.socket = null;
    this.connected = false;
    this.closedIntentionally = false;
    this.lastSeq = -1;
    this.latestFrame = null;

    this.listeners = new Map(); // channelKey -> Set<fn>
    this.broadcast =
      enableBroadcast && typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(BROADCAST_CHANNEL_NAME)
        : null;

    if (this.broadcast) {
      this.broadcast.onmessage = (event) => {
        if (event?.data && typeof event.data === "object") {
          this.ingestFrame(event.data, { fromBroadcast: true });
        }
      };
    }
  }

  _resolveDefaultWsUrl() {
    if (typeof window === "undefined" || !window.location) {
      return "ws://localhost:8000/ws/telemetry";
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/telemetry`;
  }

  on(channel, callback) {
    if (typeof callback !== "function") return () => {};
    const key = channel || "*";
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    if (this.latestFrame) {
      callback(this._extractChannelPayload(this.latestFrame, key), this.latestFrame);
    }
    return () => this.off(key, callback);
  }

  off(channel, callback) {
    const key = channel || "*";
    const set = this.listeners.get(key);
    if (set) {
      set.delete(callback);
    }
  }

  _extractChannelPayload(frame, key) {
    if (key === "*") return frame;
    if (frame?.projections && Object.prototype.hasOwnProperty.call(frame.projections, key)) {
      return {
        schema_version: frame.schema_version,
        frame_contract_version: frame.frame_contract_version,
        seq: frame.seq,
        step: frame.step,
        timestamp: frame.timestamp,
        mode: frame.mode,
        model_id: frame.model_id,
        units: frame.units,
        domain_bounds: frame.domain_bounds,
        projection: frame.projections[key],
      };
    }
    return frame;
  }

  ingestFrame(rawFrame, { fromBroadcast = false } = {}) {
    if (!rawFrame || typeof rawFrame !== "object") return false;

    const seq = Number.isInteger(rawFrame.seq) ? rawFrame.seq : -1;
    if (seq < 0) return false;

    // Ignore stale/out-of-order frames so canonical sequence only moves forward.
    if (this.lastSeq >= 0 && seq < this.lastSeq) {
      return false;
    }

    this.lastSeq = seq;
    this.latestFrame = rawFrame;

    if (!fromBroadcast && this.broadcast) {
      try {
        this.broadcast.postMessage(rawFrame);
      } catch (_) {
        // Ignore postMessage serialization issues on detached contexts.
      }
    }

    const starSet = this.listeners.get("*");
    if (starSet) {
      for (const fn of starSet) {
        fn(rawFrame, rawFrame);
      }
    }

    const projections = rawFrame.projections || {};
    for (const [channelKey, callbacks] of this.listeners.entries()) {
      if (channelKey === "*") continue;
      if (Object.prototype.hasOwnProperty.call(projections, channelKey)) {
        const payload = this._extractChannelPayload(rawFrame, channelKey);
        for (const fn of callbacks) {
          fn(payload, rawFrame);
        }
      }
    }

    return true;
  }

  async fetchSnapshot() {
    const resp = await fetch(`${this.httpBase}/api/frame`, { cache: "no-store" });
    if (!resp.ok) {
      throw new Error(`Failed to fetch /api/frame: ${resp.status}`);
    }
    const frame = await resp.json();
    this.ingestFrame(frame);
    return frame;
  }

  sendControl(message) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  connect() {
    this.closedIntentionally = false;
    if (typeof WebSocket === "undefined") return;

    if (this.socket) {
      try {
        this.socket.close();
      } catch (_) {}
    }

    const ws = new WebSocket(this.wsUrl);
    this.socket = ws;

    ws.onopen = () => {
      this.connected = true;
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        this.ingestFrame(parsed);
      } catch (_) {
        // Ignore malformed non-JSON messages.
      }
    };

    ws.onclose = () => {
      this.connected = false;
      if (!this.closedIntentionally) {
        setTimeout(() => this.connect(), this.reconnectDelayMs);
      }
    };

    ws.onerror = () => {
      this.connected = false;
    };
  }

  disconnect() {
    this.closedIntentionally = true;
    if (this.socket) {
      try {
        this.socket.close();
      } catch (_) {}
      this.socket = null;
    }
    if (this.broadcast) {
      this.broadcast.close();
      this.broadcast = null;
    }
  }
}