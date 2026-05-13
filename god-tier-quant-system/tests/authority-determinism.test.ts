import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { FeatureIntelligenceService } from '../services/feature-intelligence/service.js';
import { DriftEngine } from '../services/drift-engine/service.js';
import { AiMemoryService } from '../services/ai-memory/service.js';
import { FeatureEvent } from '../core/schemas/events.js';

function feedSequence(bus: EventBus, contractId: string): Array<{ psi: number; severity: string }> {
  const outputs: Array<{ psi: number; severity: string }> = [];
  bus.on(EVENTS.DRIFT_EVENT, (event) => {
    outputs.push({
      psi: Number((event as { psi: number }).psi.toFixed(6)),
      severity: (event as { severity: string }).severity,
    });
  });

  const baseTs = 1_700_000_000_000;
  for (let i = 0; i < 20; i += 1) {
    const row: FeatureEvent = {
      contractId,
      impliedProbability: 0.45 + i * 0.005,
      probabilityVelocity: 0.01,
      volatility: 0.03,
      spreadExpansionScore: 0.1,
      obi: 0.2,
      sweepProbability: 0.15,
      pressureAcceleration: 0.002,
      timeToExpirySeconds: 600,
      timestamp: baseTs + i * 1000,
    };
    bus.emit(EVENTS.FEATURES, row);
  }

  return outputs;
}

const busA = new EventBus();
new FeatureIntelligenceService(busA).start();
new DriftEngine(busA).start();
new AiMemoryService(busA).start();
const seqA = feedSequence(busA, 'KXBTC-DEMO');

const busB = new EventBus();
new FeatureIntelligenceService(busB).start();
new DriftEngine(busB).start();
new AiMemoryService(busB).start();
const seqB = feedSequence(busB, 'KXBTC-DEMO');

assert.deepEqual(seqA, seqB);

const acceptedWithoutTimestamp = busA.emit(EVENTS.MARKET_DATA, {
  contractId: 'KXBTC-DEMO',
  yesPrice: 0.5,
  noPrice: 0.5,
  spread: 0.01,
  bidLevels: [[0.49, 10]],
  askLevels: [[0.51, 10]],
  volume: 10,
});
assert.equal(acceptedWithoutTimestamp, false, 'authoritative events without explicit timestamp must be rejected');
assert.ok(
  busA.rejections(EVENTS.MARKET_DATA).some((event) => event.rejectionReason === 'missing-explicit-timestamp'),
  'missing explicit timestamps should be recorded as deterministic ingress rejections',
);

console.log('authority determinism test passed');
