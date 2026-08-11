import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MetricsService } from '../../src/services/metrics.service.js';

describe('MetricsService — BRD §4.11 metric catalogue', () => {
  test('AC1: decisions, rejections (by dimension/window/metric), in-progress and errors are all counted per client', async () => {
    const metrics = new MetricsService({ collectDefaultMetrics: false });
    metrics.recordDecision('CLIENT_A', 'APPROVED');
    metrics.recordDecision('CLIENT_A', 'REJECTED');
    metrics.recordRejection('CLIENT_A', { dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', metrics: ['AMOUNT', 'COUNT'] });
    metrics.recordInProgress('CLIENT_A');
    metrics.recordError('CLIENT_A', 'SYSTEM_FAILURE');

    const exposition = await metrics.exposition();
    assert.match(exposition, /imps_transaction_decisions_total\{clientId="CLIENT_A",outcome="APPROVED"\} 1/);
    assert.match(exposition, /imps_transaction_decisions_total\{clientId="CLIENT_A",outcome="REJECTED"\} 1/);
    assert.match(exposition, /imps_transaction_rejections_total\{clientId="CLIENT_A",dimensionCode="UCIC",windowType="DAILY_CALENDAR",metric="AMOUNT"\} 1/);
    assert.match(exposition, /imps_transaction_rejections_total\{clientId="CLIENT_A",dimensionCode="UCIC",windowType="DAILY_CALENDAR",metric="COUNT"\} 1/);
    assert.match(exposition, /imps_transaction_in_progress_total\{clientId="CLIENT_A"\} 1/);
    assert.match(exposition, /imps_transaction_errors_total\{clientId="CLIENT_A",code="SYSTEM_FAILURE"\} 1/);
  });

  test('AC2: floor-guard failures and counter drift are counted, distinguishing source/action', async () => {
    const metrics = new MetricsService({ collectDefaultMetrics: false });
    metrics.recordFloorGuardFailure('CLIENT_B', 'tier2', 'COMPENSATION');
    metrics.recordFloorGuardFailure('CLIENT_B', 'tier1', 'REVERSAL');
    metrics.recordDrift('CLIENT_B', 'CORRECTED');
    metrics.recordDrift('CLIENT_B', 'ALERTED');

    const exposition = await metrics.exposition();
    assert.match(exposition, /imps_floor_guard_failures_total\{clientId="CLIENT_B",tier="tier2",source="COMPENSATION"\} 1/);
    assert.match(exposition, /imps_floor_guard_failures_total\{clientId="CLIENT_B",tier="tier1",source="REVERSAL"\} 1/);
    assert.match(exposition, /imps_counter_drift_total\{clientId="CLIENT_B",action="CORRECTED"\} 1/);
    assert.match(exposition, /imps_counter_drift_total\{clientId="CLIENT_B",action="ALERTED"\} 1/);
  });

  test('AC3: retryHooksFor wires onTransient/onExhausted into per-tier retry counters', async () => {
    const metrics = new MetricsService({ collectDefaultMetrics: false });
    const hooks = metrics.retryHooksFor('tier2');
    hooks.onTransient();
    hooks.onTransient();
    hooks.onExhausted();

    const exposition = await metrics.exposition();
    assert.match(exposition, /imps_counter_retry_attempts_total\{tier="tier2"\} 2/);
    assert.match(exposition, /imps_counter_retry_exhausted_total\{tier="tier2"\} 1/);
  });

  test('AC4: per-tier and end-to-end latency are recorded as histograms', async () => {
    const metrics = new MetricsService({ collectDefaultMetrics: false });
    metrics.observeTierLatency('tier1', 0.003);
    metrics.observeRequestLatency(0.015);

    const exposition = await metrics.exposition();
    assert.match(exposition, /imps_counter_tier_duration_seconds_count\{tier="tier1"\} 1/);
    assert.match(exposition, /imps_transaction_request_duration_seconds_count 1/);
  });

  test('AC5: replication lag is exposed as a gauge', async () => {
    const metrics = new MetricsService({ collectDefaultMetrics: false });
    metrics.setReplicationLag(2.5);
    const exposition = await metrics.exposition();
    assert.match(exposition, /imps_replication_lag_seconds 2\.5/);
  });

  test('multiple independent MetricsService instances do not collide (each owns its own registry)', async () => {
    const a = new MetricsService({ collectDefaultMetrics: false });
    const b = new MetricsService({ collectDefaultMetrics: false });
    a.recordDecision('X', 'APPROVED');
    b.recordDecision('X', 'REJECTED');

    const expositionA = await a.exposition();
    const expositionB = await b.exposition();
    assert.match(expositionA, /outcome="APPROVED"\} 1/);
    assert.doesNotMatch(expositionA, /outcome="REJECTED"/);
    assert.match(expositionB, /outcome="REJECTED"\} 1/);
    assert.doesNotMatch(expositionB, /outcome="APPROVED"/);
  });
});
