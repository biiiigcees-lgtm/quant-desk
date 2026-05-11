// ╔══════════════════════════════════════════════════════╗
// ║  QUANT//DESK — StreamManager                        ║
// ║  Singleton stream lifecycle manager.                ║
// ║  Prevents duplicate connections; manages cleanup.   ║
// ╚══════════════════════════════════════════════════════╝

class StreamManager {
  static #instance = null;
  #streams = new Map();             // name → { stream, options }
  #heartbeatTimers = new Map();     // name → intervalId
  #reconnectTimers = new Map();     // name → timeoutId
  #subscriptionCounts = new Map(); // name → count (for shared streams)

  /** @returns {StreamManager} */
  static getInstance() {
    if (!StreamManager.#instance) {
      StreamManager.#instance = new StreamManager();
    }
    return StreamManager.#instance;
  }

  /**
   * Register a stream with a unique name.
   * If a stream with the same name already exists, it is cleaned up first.
   *
   * @param {string} name - Unique identifier for this stream.
   * @param {object} stream - Stream object. May expose `ping()`, `close()`, or `destroy()`.
   * @param {{ heartbeatMs?: number, maxReconnectDelayMs?: number }} [options]
   */
  register(name, stream, { heartbeatMs = 30_000, maxReconnectDelayMs = 30_000 } = {}) {
    // Tear down any previous stream registered under this name.
    if (this.#streams.has(name)) {
      this.cleanup(name);
    }

    this.#streams.set(name, { stream, options: { heartbeatMs, maxReconnectDelayMs } });
    this.#subscriptionCounts.set(name, 0);

    // Start heartbeat if the stream exposes a ping() method.
    if (typeof stream.ping === 'function' && heartbeatMs > 0) {
      const timerId = setInterval(() => {
        try {
          stream.ping();
        } catch (err) {
          console.warn(`[StreamManager] heartbeat ping failed for "${name}":`, err);
        }
      }, heartbeatMs);
      this.#heartbeatTimers.set(name, timerId);
    }
  }

  /**
   * Increment the subscription count for a shared stream.
   * When the count reaches 0, the stream is cleaned up automatically.
   *
   * @param {string} name - Name of a previously registered stream.
   * @returns {() => void} Unsubscribe function; call it when the consumer unmounts.
   */
  use(name) {
    const current = this.#subscriptionCounts.get(name) ?? 0;
    this.#subscriptionCounts.set(name, current + 1);

    let released = false;
    return () => {
      if (released) return;
      released = true;

      const count = this.#subscriptionCounts.get(name) ?? 0;
      const next = Math.max(0, count - 1);
      this.#subscriptionCounts.set(name, next);

      if (next === 0) {
        this.cleanup(name);
      }
    };
  }

  /**
   * Force cleanup of a specific stream.
   * Clears heartbeat/reconnect timers and calls close/destroy on the stream.
   *
   * @param {string} name
   */
  cleanup(name) {
    // Clear heartbeat timer.
    const heartbeatId = this.#heartbeatTimers.get(name);
    if (heartbeatId !== undefined) {
      clearInterval(heartbeatId);
      this.#heartbeatTimers.delete(name);
    }

    // Clear any pending reconnect timer.
    const reconnectId = this.#reconnectTimers.get(name);
    if (reconnectId !== undefined) {
      clearTimeout(reconnectId);
      this.#reconnectTimers.delete(name);
    }

    // Close/destroy the underlying stream.
    const entry = this.#streams.get(name);
    if (entry) {
      const { stream } = entry;
      try {
        if (typeof stream.close === 'function') {
          stream.close();
        } else if (typeof stream.destroy === 'function') {
          stream.destroy();
        }
      } catch (err) {
        console.warn(`[StreamManager] error while closing stream "${name}":`, err);
      }
      this.#streams.delete(name);
    }

    this.#subscriptionCounts.delete(name);
  }

  /**
   * Cleanup all registered streams.
   * Call this on page unload (e.g., window 'beforeunload').
   */
  cleanupAll() {
    for (const name of [...this.#streams.keys()]) {
      this.cleanup(name);
    }
  }

  /**
   * Schedule a reconnect attempt for a named stream.
   * Useful for callers that want the manager to coordinate backoff timers.
   *
   * @param {string} name
   * @param {() => void} reconnectFn - Called after the delay.
   * @param {number} [delayMs=1000]
   */
  scheduleReconnect(name, reconnectFn, delayMs = 1_000) {
    // Cancel any existing reconnect for this name first.
    const existing = this.#reconnectTimers.get(name);
    if (existing !== undefined) {
      clearTimeout(existing);
    }

    const entry = this.#streams.get(name);
    const maxDelay = entry?.options?.maxReconnectDelayMs ?? 30_000;
    const bounded = Math.min(delayMs, maxDelay);

    const timerId = setTimeout(() => {
      this.#reconnectTimers.delete(name);
      try {
        reconnectFn();
      } catch (err) {
        console.warn(`[StreamManager] reconnect callback failed for "${name}":`, err);
      }
    }, bounded);

    this.#reconnectTimers.set(name, timerId);
  }

  /**
   * Returns the names of all currently registered streams.
   * Useful for debugging.
   *
   * @returns {string[]}
   */
  activeStreams() {
    return [...this.#streams.keys()];
  }
}

export const streamManager = StreamManager.getInstance();
