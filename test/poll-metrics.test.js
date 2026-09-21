import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PollMetrics } from '../src/lib/client/poll-metrics.js';

test('PollMetrics keeps the last ten durations and stretches the interval to 1.3× the average', () => {
  const m = new PollMetrics();
  assert.equal(m.effectiveSec(15), 15, 'no data → configured');
  for (let i = 1; i <= 12; i++) m.record(i * 1000, true);
  assert.equal(m.durations.length, 10);
  assert.deepEqual(m.durations, [3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000]);
  assert.equal(m.avgMs, 7500);
  assert.equal(m.lastMs, 12000);
  assert.equal(m.maxMs, 12000);
  assert.equal(m.runs, 12);
  assert.equal(m.effectiveSec(5), 10, 'ceil(7.5 × 1.3) = 10');
  assert.equal(m.effectiveSec(30), 30, 'fast enough → configured wins');
  assert.equal(m.isSlowedDown(5), true);
  assert.equal(m.isSlowedDown(30), false);

  const slow = new PollMetrics();
  for (let i = 0; i < 10; i++) slow.record(10_000, i % 2 === 0);
  assert.equal(slow.effectiveSec(10), 13, '10 s average → at least 13 s');
  assert.equal(slow.errors, 5);
});
