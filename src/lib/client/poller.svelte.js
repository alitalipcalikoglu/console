import { untrack } from 'svelte';
import { PollMetrics } from './poll-metrics.js';
import { services } from './services.svelte.js';
import { visibility } from './visibility.svelte.js';

/** @typedef {() => Promise<unknown>} Loader */

/**
 * One scheduler per service. Every page interested in a service registers its loader here; the
 * poller owns the single timer, runs loaders strictly one tick at a time, folds ticks that arrive
 * mid-flight into one follow-up run, measures each run and stretches the interval when the
 * service is slow. Changing the configured interval destroys the old timer and starts a new one.
 */
export class ServicePoller {
  /** @param {string} sid */
  constructor(sid) {
    this.sid = sid;
    /** @type {Set<Loader>} */
    this.loaders = new Set();
    this.metrics = new PollMetrics();
    this.countdown = $state(0);
    this.inFlight = $state(false);
    this.pending = $state(false);
    this.effectiveSec = $state(0);
    this.running = $state(false);
    /** Reactive mirror of the metrics for templates. */
    this.stats = $state({ durations: /** @type {number[]} */ ([]), avgMs: 0, lastMs: 0, maxMs: 0, runs: 0, errors: 0, coalesced: 0 });
    /** @type {ReturnType<typeof setInterval>|null} */
    this.timer = null;
  }

  get configuredSec() {
    const p = services.get(this.sid)?.polling;
    return p?.enabled ? p.intervalSec : 0;
  }

  /**
   * Register a loader; returns the unsubscribe function. Timer starts with the first loader
   * (if the service setting is on) and stops with the last.
   * @param {Loader} fn
   */
  subscribe(fn) {
    this.loaders.add(fn);
    this.reconfigure();
    return () => {
      this.loaders.delete(fn);
      this.reconfigure();
    };
  }

  /** Run every loader now, serialised: a run during a run is folded into exactly one follow-up. */
  async trigger() {
    if (this.inFlight) {
      if (!this.pending) { this.pending = true; this.metrics.coalesced += 1; this.#publish(); }
      return;
    }
    this.inFlight = true;
    const started = performance.now();
    let ok = true;
    try {
      await Promise.all([...this.loaders].map((fn) => fn().catch(() => { ok = false; })));
    } finally {
      this.metrics.record(Math.round(performance.now() - started), ok);
      this.inFlight = false;
      this.#publish();
      this.#applyInterval();
      if (this.pending) {
        this.pending = false;
        void this.trigger();
      }
    }
  }

  /** (Re)start or stop the timer according to setting, subscribers and tab visibility. */
  reconfigure() {
    this.#stop();
    const sec = this.configuredSec;
    if (!sec || !this.loaders.size || !untrack(() => visibility.visible)) { this.running = false; this.countdown = 0; this.effectiveSec = sec; return; }
    this.running = true;
    this.effectiveSec = this.metrics.effectiveSec(sec);
    this.countdown = this.effectiveSec;
    this.timer = setInterval(() => {
      if (this.countdown <= 1) {
        this.countdown = this.effectiveSec;
        void this.trigger();
      } else {
        this.countdown -= 1;
      }
    }, 1000);
  }

  /** After each run: if the measured average now demands a longer interval, restart with it. */
  #applyInterval() {
    const sec = this.configuredSec;
    if (!sec || !this.running) return;
    const next = this.metrics.effectiveSec(sec);
    if (next !== this.effectiveSec) this.reconfigure();
  }

  #stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  #publish() {
    const m = this.metrics;
    this.stats = { durations: [...m.durations], avgMs: m.avgMs, lastMs: m.lastMs, maxMs: m.maxMs, runs: m.runs, errors: m.errors, coalesced: m.coalesced };
  }
}

/** Registry of pollers; also reacts to tab visibility and setting changes. */
export class PollScheduler {
  constructor() {
    /** @type {Map<string, ServicePoller>} */
    this.pollers = new Map();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => this.reconfigureAll());
  }

  /** @param {string} sid */
  for(sid) {
    let p = this.pollers.get(sid);
    if (!p) {
      p = new ServicePoller(sid);
      this.pollers.set(sid, p);
    }
    return p;
  }

  reconfigureAll() {
    for (const p of this.pollers.values()) p.reconfigure();
  }
}

export const poller = new PollScheduler();
