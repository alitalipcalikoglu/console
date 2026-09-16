import { PrometheusText, ServiceClient } from './client.js';

/** Typed wrapper over the scheduler API. */
export class SchedulerClient extends ServiceClient {
  /**
   * @param {Record<string, string|number|undefined>} q
   * @param {readonly string[]} keys
   */
  static params(q, keys) {
    const p = new URLSearchParams();
    for (const k of keys) if (q[k] !== undefined && q[k] !== '') p.set(k, String(q[k]));
    return p;
  }

  /** @param {Record<string, string|number|undefined>} q */
  listJobs(q) {
    return this.json('GET', `/v1/jobs?${SchedulerClient.params(q, ['q', 'tag', 'enabled', 'limit', 'cursor'])}`);
  }

  /** @param {string} name */
  getJob(name) {
    return this.json('GET', `/v1/jobs/${encodeURIComponent(name)}`);
  }

  /** @param {object} body */
  createJob(body) {
    return this.json('POST', '/v1/jobs', { body });
  }

  /** @param {string} name @param {object} patch */
  patchJob(name, patch) {
    return this.json('PATCH', `/v1/jobs/${encodeURIComponent(name)}`, { body: patch });
  }

  /** @param {string} name */
  deleteJob(name) {
    return this.json('DELETE', `/v1/jobs/${encodeURIComponent(name)}`);
  }

  /** @param {string} name */
  runJob(name) {
    return this.json('POST', `/v1/jobs/${encodeURIComponent(name)}/run`);
  }

  /** @param {string|null} job @param {{ status?: string, limit?: number, before?: string }} q */
  runs(job, q) {
    const p = SchedulerClient.params(q, ['status', 'limit', 'before']);
    return this.json('GET', job === null ? `/v1/runs?${p}` : `/v1/jobs/${encodeURIComponent(job)}/runs?${p}`);
  }

  /** @param {string} id */
  getRun(id) {
    return this.json('GET', `/v1/runs/${encodeURIComponent(id)}`);
  }

  /** @param {string} id */
  cancelRun(id) {
    return this.json('POST', `/v1/runs/${encodeURIComponent(id)}/cancel`);
  }

  /** @param {{ cron: string, timezone?: string, count?: number }} q */
  preview(q) {
    return this.json('GET', `/v1/schedule/preview?${SchedulerClient.params(q, ['cron', 'timezone', 'count'])}`);
  }

  targetKeys() {
    return this.json('GET', '/v1/target-keys');
  }

  timezones() {
    return this.json('GET', '/v1/timezones');
  }

  stats() {
    return this.json('GET', '/v1/stats');
  }

  async summary() {
    const s = await this.metricsSamples();
    if (!s) return null;
    return {
      enabledJobs: PrometheusText.value(s, 'scheduler_jobs', { state: 'enabled' }),
      disabledJobs: PrometheusText.value(s, 'scheduler_jobs', { state: 'disabled' }),
      runsByStatus: Object.fromEntries(s.filter((x) => x.name === 'scheduler_runs').map((x) => [x.labels.status, x.value])),
      failedSinceStart: PrometheusText.value(s, 'scheduler_runs_finished_total', { status: 'failed' }),
      inFlight: PrometheusText.value(s, 'scheduler_in_flight'),
      nextDueSec: PrometheusText.value(s, 'scheduler_next_due_seconds'),
      uptimeSec: PrometheusText.value(s, 'scheduler_process_uptime_seconds'),
    };
  }
}
