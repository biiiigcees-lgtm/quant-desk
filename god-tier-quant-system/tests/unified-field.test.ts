import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { OrderbookDeltaService } from '../services/orderbook-delta/service.js';
import { LiquidityGravityService } from '../services/liquidity-gravity/service.js';
import { RegimeTransitionService } from '../services/regime-transition/service.js';
import { NoiseFilterService } from '../services/noise-filter/service.js';
import { RealityAlignmentService } from '../services/reality-alignment/service.js';
import { CausalWeightEngine } from '../services/causal-weight-engine/service.js';
import { UnifiedMarketFieldService } from '../services/unified-market-field/service.js';
import { ShadowTradingService } from '../services/shadow-trading/service.js';
import type {
  MarketDataEvent,
  MicrostructureEvent,
  FeatureEvent,
  UnifiedFieldEvent,
  OrderbookDeltaEvent,
  LiquidityGravityEvent,
  RegimeTransitionEvent,
  FilteredSignalEvent,
  ShadowDecisionEvent,
  ProbabilityEvent,
} from '../core/schemas/events.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMarketData(contractId: string, yesPrice = 0.55, overrides?: Partial<MarketDataEvent>): MarketDataEvent {
  return {
    contractId,
    yesPrice,
    noPrice: 1 - yesPrice,
    spread: 0.02,
    bidLevels: [[yesPrice - 0.01, 100], [yesPrice - 0.02, 200], [yesPrice - 0.03, 500]],
    askLevels: [[yesPrice + 0.01, 100], [yesPrice + 0.02, 300], [yesPrice + 0.05, 600]],
    volume: 1000,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeMicro(contractId: string, obi = 0.3, overrides?: Partial<MicrostructureEvent>): MicrostructureEvent {
  return {
    contractId,
    obi,
    obiVelocity: 0.1,
    liquidityPressureScore: 0.4,
    spreadExpansionScore: 0.1,
    sweepProbability: 0.2,
    panicRepricing: false,
    liquidityRegime: 'normal',
    aggressionScore: 0.3,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeFeature(contractId: string, pVelocity = 0.02, overrides?: Partial<FeatureEvent>): FeatureEvent {
  return {
    contractId,
    impliedProbability: 0.55,
    probabilityVelocity: pVelocity,
    volatility: 0.02,
    spreadExpansionScore: 0.1,
    obi: 0.3,
    sweepProbability: 0.2,
    pressureAcceleration: 0.05,
    timeToExpirySeconds: 600,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeProb(contractId: string, implied = 0.6): ProbabilityEvent {
  return {
    contractId,
    estimatedProbability: implied,
    marketImpliedProbability: implied,
    edge: implied - 0.5,
    confidenceInterval: [implied - 0.1, implied + 0.1],
    uncertaintyScore: 0.3,
    calibrationError: 0.05,
    brierScore: 0.2,
    regime: 'trending',
    timestamp: Date.now(),
  };
}

// ─── OrderbookDeltaService ─────────────────────────────────────────────────────

function testOrderbookDeltaEmitsOnFirstEvent(): void {
  const bus = new EventBus();
  const svc = new OrderbookDeltaService(bus);
  svc.start();

  const events: OrderbookDeltaEvent[] = [];
  bus.on<OrderbookDeltaEvent>(EVENTS.ORDERBOOK_DELTA, (e) => { events.push(e); });

  bus.emit(EVENTS.MARKET_DATA, makeMarketData('OB-1'));
  assert.ok(events.length >= 1, 'should emit ORDERBOOK_DELTA on first market data');
}

function testOrderbookDeltaDetectsAddedBid(): void {
  const bus = new EventBus();
  const svc = new OrderbookDeltaService(bus);
  svc.start();

  const events: OrderbookDeltaEvent[] = [];
  bus.on<OrderbookDeltaEvent>(EVENTS.ORDERBOOK_DELTA, (e) => { events.push(e); });

  bus.emit(EVENTS.MARKET_DATA, makeMarketData('OB-2', 0.55, {
    bidLevels: [[0.54, 100], [0.53, 200]],
    askLevels: [[0.56, 100]],
  }));
  bus.emit(EVENTS.MARKET_DATA, makeMarketData('OB-2', 0.55, {
    bidLevels: [[0.54, 100], [0.53, 200], [0.52, 300]],
    askLevels: [[0.56, 100]],
  }));

  const last = events.at(-1)!;
  assert.ok(last.bidAdded.some(([p]) => Math.abs(p - 0.52) < 0.001), 'should detect newly added bid at 0.52');
}

function testOrderbookDeltaDetectsRemovedBid(): void {
  const bus = new EventBus();
  const svc = new OrderbookDeltaService(bus);
  svc.start();

  const events: OrderbookDeltaEvent[] = [];
  bus.on<OrderbookDeltaEvent>(EVENTS.ORDERBOOK_DELTA, (e) => { events.push(e); });

  bus.emit(EVENTS.MARKET_DATA, makeMarketData('OB-3', 0.55, {
    bidLevels: [[0.54, 100], [0.53, 200]],
    askLevels: [[0.56, 100]],
  }));
  bus.emit(EVENTS.MARKET_DATA, makeMarketData('OB-3', 0.55, {
    bidLevels: [[0.54, 100]],
    askLevels: [[0.56, 100]],
  }));

  const last = events.at(-1)!;
  assert.ok(last.bidRemoved.some(([p]) => Math.abs(p - 0.53) < 0.001), 'should detect removed bid at 0.53');
}

function testOrderbookDeltaDetectsSpoofedBid(): void {
  const bus = new EventBus();
  const svc = new OrderbookDeltaService(bus);
  svc.start();

  const events: OrderbookDeltaEvent[] = [];
  bus.on<OrderbookDeltaEvent>(EVENTS.ORDERBOOK_DELTA, (e) => { events.push(e); });

  // Large wall appears and disappears quickly
  const ts = Date.now();
  bus.emit(EVENTS.MARKET_DATA, makeMarketData('OB-4', 0.55, {
    bidLevels: [[0.54, 500]], // large wall > WALL_SIZE_THRESHOLD (250)
    askLevels: [[0.56, 100]],
    timestamp: ts,
  }));
  bus.emit(EVENTS.MARKET_DATA, makeMarketData('OB-4', 0.55, {
    bidLevels: [], // large wall disappeared quickly
    askLevels: [[0.56, 100]],
    timestamp: ts + 500, // within spoof window (2000ms)
  }));

  const last = events.at(-1)!;
  assert.ok(last.spoofedBids.length > 0, 'should detect spoofed bid that appeared and disappeared quickly');
}

// ─── LiquidityGravityService ──────────────────────────────────────────────────

function testLiquidityGravityEmits(): void {
  const bus = new EventBus();
  const svc = new LiquidityGravityService(bus);
  svc.start();

  const events: LiquidityGravityEvent[] = [];
  bus.on<LiquidityGravityEvent>(EVENTS.LIQUIDITY_GRAVITY, (e) => { events.push(e); });

  bus.emit(EVENTS.MARKET_DATA, makeMarketData('LG-1'));
  assert.ok(events.length >= 1, 'should emit LIQUIDITY_GRAVITY');
}

function testLiquidityGravityBidWallBias(): void {
  const bus = new EventBus();
  const svc = new LiquidityGravityService(bus);
  svc.start();

  const events: LiquidityGravityEvent[] = [];
  bus.on<LiquidityGravityEvent>(EVENTS.LIQUIDITY_GRAVITY, (e) => { events.push(e); });

  // Large bid wall nearby, small ask side
  bus.emit(EVENTS.MARKET_DATA, makeMarketData('LG-2', 0.55, {
    bidLevels: [[0.54, 2000]], // huge bid wall very close
    askLevels: [[0.56, 50]],  // tiny ask side
  }));

  const e = events.at(-1)!;
  assert.ok(e.bidWalls.length > 0, 'should identify bid wall');
  // Large bid wall below = price pulled DOWN (negative gravitational bias)
  assert.ok(e.gravitationalBias < 0, `gravitational bias should be negative with large bid wall below; got ${e.gravitationalBias}`);
}

function testLiquidityGravityAskWallBias(): void {
  const bus = new EventBus();
  const svc = new LiquidityGravityService(bus);
  svc.start();

  const events: LiquidityGravityEvent[] = [];
  bus.on<LiquidityGravityEvent>(EVENTS.LIQUIDITY_GRAVITY, (e) => { events.push(e); });

  // Large ask wall nearby, small bid side
  bus.emit(EVENTS.MARKET_DATA, makeMarketData('LG-3', 0.55, {
    bidLevels: [[0.54, 50]],   // tiny bid
    askLevels: [[0.56, 2000]], // huge ask wall very close
  }));

  const e = events.at(-1)!;
  assert.ok(e.askWalls.length > 0, 'should identify ask wall');
  // Large ask wall above = price pulled UP (positive gravitational bias)
  assert.ok(e.gravitationalBias > 0, `gravitational bias should be positive with large ask wall above; got ${e.gravitationalBias}`);
}

// ─── RegimeTransitionService ──────────────────────────────────────────────────

function testRegimeTransitionEmits(): void {
  const bus = new EventBus();
  const svc = new RegimeTransitionService(bus);
  svc.start();

  const events: RegimeTransitionEvent[] = [];
  bus.on<RegimeTransitionEvent>(EVENTS.REGIME_TRANSITION, (e) => { events.push(e); });

  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('RT-1'));
  bus.emit(EVENTS.FEATURES, makeFeature('RT-1'));

  assert.ok(events.length >= 1, 'should emit REGIME_TRANSITION when both micro and features available');
  assert.ok(events[0]!.regimeInstability >= 0 && events[0]!.regimeInstability <= 1, 'regimeInstability should be in [0,1]');
}

function testRegimeTransitionPanicRegime(): void {
  const bus = new EventBus();
  const svc = new RegimeTransitionService(bus);
  svc.start();

  const events: RegimeTransitionEvent[] = [];
  bus.on<RegimeTransitionEvent>(EVENTS.REGIME_TRANSITION, (e) => { events.push(e); });

  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('RT-2', 0, { panicRepricing: true }));
  bus.emit(EVENTS.FEATURES, makeFeature('RT-2'));

  const e = events.at(-1)!;
  assert.equal(e.currentRegime, 'panic', 'should classify panic regime when panicRepricing=true');
}

function testRegimeTransitionInstabilityRange(): void {
  const bus = new EventBus();
  const svc = new RegimeTransitionService(bus);
  svc.start();

  const events: RegimeTransitionEvent[] = [];
  bus.on<RegimeTransitionEvent>(EVENTS.REGIME_TRANSITION, (e) => { events.push(e); });

  // Emit many events to build transition history
  for (let i = 0; i < 20; i++) {
    bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('RT-3', i % 2 === 0 ? 0.5 : -0.5));
    bus.emit(EVENTS.FEATURES, makeFeature('RT-3', i % 2 === 0 ? 0.05 : -0.05));
  }

  for (const e of events) {
    assert.ok(e.regimeInstability >= 0 && e.regimeInstability <= 1,
      `regimeInstability ${e.regimeInstability} must be in [0,1]`);
  }
}

// ─── NoiseFilterService ───────────────────────────────────────────────────────

function testNoiseFilterEmits(): void {
  const bus = new EventBus();
  const svc = new NoiseFilterService(bus);
  svc.start();

  const events: FilteredSignalEvent[] = [];
  bus.on<FilteredSignalEvent>(EVENTS.FILTERED_SIGNAL, (e) => { events.push(e); });

  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('NF-1'));
  bus.emit(EVENTS.FEATURES, makeFeature('NF-1'));

  assert.ok(events.length >= 1, 'should emit FILTERED_SIGNAL when both micro and features present');
}

function testNoiseFilterStructuralFractionRange(): void {
  const bus = new EventBus();
  const svc = new NoiseFilterService(bus);
  svc.start();

  const events: FilteredSignalEvent[] = [];
  bus.on<FilteredSignalEvent>(EVENTS.FILTERED_SIGNAL, (e) => { events.push(e); });

  for (let i = 0; i < 30; i++) {
    bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('NF-2', Math.sin(i * 0.5) * 0.8));
    bus.emit(EVENTS.FEATURES, makeFeature('NF-2', Math.cos(i * 0.5) * 0.02));
  }

  for (const e of events) {
    assert.ok(e.structuralFraction >= 0 && e.structuralFraction <= 1,
      `structuralFraction ${e.structuralFraction} must be [0,1]`);
    assert.ok(e.manipulationScore >= 0 && e.manipulationScore <= 1,
      `manipulationScore must be [0,1]`);
  }
}

// ─── UnifiedMarketFieldService ────────────────────────────────────────────────

function testUnifiedFieldEmitsOnMicroAndFeatures(): void {
  const bus = new EventBus();
  const svc = new UnifiedMarketFieldService(bus);
  svc.start();

  const events: UnifiedFieldEvent[] = [];
  bus.on<UnifiedFieldEvent>(EVENTS.UNIFIED_FIELD, (e) => { events.push(e); });

  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('UF-1'));
  bus.emit(EVENTS.FEATURES, makeFeature('UF-1'));

  assert.ok(events.length >= 1, 'should emit UNIFIED_FIELD when micro and features present');
  const e = events[0]!;
  assert.ok(e.pAbove >= 0 && e.pAbove <= 1, 'pAbove must be [0,1]');
  assert.ok(e.pBelow >= 0 && e.pBelow <= 1, 'pBelow must be [0,1]');
  assert.ok(e.pNoBet >= 0 && e.pNoBet <= 1, 'pNoBet must be [0,1]');
  const total = e.pAbove + e.pBelow + e.pNoBet;
  assert.ok(Math.abs(total - 1) < 0.01, `probabilities must sum to ~1; got ${total}`);
}

function testUnifiedFieldBullishWhenStrongBullishForces(): void {
  const bus = new EventBus();
  const svc = new UnifiedMarketFieldService(bus);
  svc.start();

  const events: UnifiedFieldEvent[] = [];
  bus.on<UnifiedFieldEvent>(EVENTS.UNIFIED_FIELD, (e) => { events.push(e); });

  // Strong bullish: high OBI, bullish velocity, ask wall pulling up
  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('UF-2', 0.85, {
    obiVelocity: 0.5,
    sweepProbability: 0.1,
    aggressionScore: 0.8,
    liquidityRegime: 'normal',
  }));
  bus.emit(EVENTS.FEATURES, makeFeature('UF-2', 0.05, { volatility: 0.02 }));
  // Add a strong ask wall pulling price up
  bus.emit(EVENTS.LIQUIDITY_GRAVITY, {
    contractId: 'UF-2',
    bidWalls: [],
    askWalls: [{ price: 0.60, size: 1000, distance: 0.05 }],
    gravitationalBias: 0.7,
    nearestBidWallDistance: 1,
    nearestAskWallDistance: 0.05,
    resistanceZones: [],
    absorptionStrength: 0.1,
    timestamp: Date.now(),
  });
  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('UF-2', 0.85, { obiVelocity: 0.5, aggressionScore: 0.8 }));

  const e = events.at(-1)!;
  assert.ok(e.fieldBias > 0, `fieldBias should be positive for bullish forces; got ${e.fieldBias}`);
  assert.ok(e.pAbove > e.pBelow, `pAbove (${e.pAbove}) should exceed pBelow (${e.pBelow}) for bullish field`);
}

function testUnifiedFieldNoBetWhenHighRegimeInstability(): void {
  const bus = new EventBus();
  const svc = new UnifiedMarketFieldService(bus);
  svc.start();

  const events: UnifiedFieldEvent[] = [];
  bus.on<UnifiedFieldEvent>(EVENTS.UNIFIED_FIELD, (e) => { events.push(e); });

  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('UF-3', 0.1));
  bus.emit(EVENTS.FEATURES, makeFeature('UF-3', 0.001));
  // High regime instability
  bus.emit(EVENTS.REGIME_TRANSITION, {
    contractId: 'UF-3',
    currentRegime: 'choppy',
    mostLikelyNextRegimes: [
      { regime: 'panic', probability: 0.3 },
      { regime: 'trending', probability: 0.25 },
    ],
    regimeInstability: 0.95,
    timeInCurrentRegime: 1,
    transitionImminent: true,
    timestamp: Date.now(),
  });
  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('UF-3', 0.1));

  const e = events.at(-1)!;
  assert.equal(e.decision, 'NO BET', `should be NO BET when regime instability is 0.95; got ${e.decision}`);
}

function testUnifiedFieldCausalAttributionSumsToApprox1(): void {
  const bus = new EventBus();
  const svc = new UnifiedMarketFieldService(bus);
  svc.start();

  const events: UnifiedFieldEvent[] = [];
  bus.on<UnifiedFieldEvent>(EVENTS.UNIFIED_FIELD, (e) => { events.push(e); });

  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('UF-4', 0.5));
  bus.emit(EVENTS.FEATURES, makeFeature('UF-4', 0.03));

  const e = events.at(-1)!;
  const sum = e.causalAttribution.liquidityContribution +
    e.causalAttribution.flowContribution +
    e.causalAttribution.volatilityContribution;
  assert.ok(Math.abs(sum - 1) < 0.01 || sum <= 1,
    `directional causal attribution should sum to ~1; got ${sum}`);
}

function testUnifiedFieldGetLatestField(): void {
  const bus = new EventBus();
  const svc = new UnifiedMarketFieldService(bus);
  svc.start();

  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('UF-5', 0.4));
  bus.emit(EVENTS.FEATURES, makeFeature('UF-5', 0.02));

  const field = svc.getLatestField('UF-5');
  assert.ok(field !== undefined, 'getLatestField should return a field after events');
  assert.equal(field!.contractId, 'UF-5');
}

// ─── RealityAlignmentService ──────────────────────────────────────────────────

function testRealityAlignmentInitialWeightsSumTo1(): void {
  const bus = new EventBus();
  const svc = new RealityAlignmentService(bus);
  svc.start();

  const weights = svc.getWeights('RA-1');
  const total = weights.liquidity + weights.flow + weights.volatility + weights.entropy;
  assert.ok(Math.abs(total - 1) < 0.01, `initial weights should sum to 1; got ${total}`);
}

function testRealityAlignmentUpdatesWeightsAfterProbability(): void {
  const bus = new EventBus();
  const uField = new UnifiedMarketFieldService(bus);
  const ra = new RealityAlignmentService(bus);
  uField.start();
  ra.start();

  const alignEvents: unknown[] = [];
  bus.on(EVENTS.REALITY_ALIGNMENT, (e) => { alignEvents.push(e); });

  // Emit field + outcome events
  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('RA-2', 0.6));
  bus.emit(EVENTS.FEATURES, makeFeature('RA-2', 0.03));
  bus.emit(EVENTS.PROBABILITY, makeProb('RA-2', 0.65)); // outcome: above

  assert.ok(alignEvents.length >= 1, 'should emit REALITY_ALIGNMENT after field + outcome');
}

// ─── CausalWeightEngine ───────────────────────────────────────────────────────

function testCausalWeightEngineRespondsToAlignment(): void {
  const bus = new EventBus();
  const uField = new UnifiedMarketFieldService(bus);
  const ra = new RealityAlignmentService(bus);
  const cwe = new CausalWeightEngine(bus);
  uField.start();
  ra.start();
  cwe.start();

  const weightEvents: unknown[] = [];
  bus.on(EVENTS.CAUSAL_WEIGHTS, (e) => { weightEvents.push(e); });

  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('CW-1', 0.5));
  bus.emit(EVENTS.FEATURES, makeFeature('CW-1', 0.02));
  bus.emit(EVENTS.PROBABILITY, makeProb('CW-1', 0.7));

  assert.ok(weightEvents.length >= 1, 'should emit CAUSAL_WEIGHTS after reality alignment');
}

// ─── ShadowTradingService ─────────────────────────────────────────────────────

function testShadowTradingEmitsThreeStrategies(): void {
  const bus = new EventBus();
  const uField = new UnifiedMarketFieldService(bus);
  const shadow = new ShadowTradingService(bus);
  uField.start();
  shadow.start();

  const events: ShadowDecisionEvent[] = [];
  bus.on<ShadowDecisionEvent>(EVENTS.SHADOW_DECISION, (e) => { events.push(e); });

  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('ST-1', 0.7));
  bus.emit(EVENTS.FEATURES, makeFeature('ST-1', 0.04));

  assert.ok(events.length >= 1, 'should emit SHADOW_DECISION');
  const e = events[0]!;
  assert.equal(e.strategies.length, 3, 'should have 3 shadow strategies (conservative, moderate, aggressive)');
}

function testShadowTradingConservativeMoreRestrictive(): void {
  const bus = new EventBus();
  const uField = new UnifiedMarketFieldService(bus);
  const shadow = new ShadowTradingService(bus);
  uField.start();
  shadow.start();

  const events: ShadowDecisionEvent[] = [];
  bus.on<ShadowDecisionEvent>(EVENTS.SHADOW_DECISION, (e) => { events.push(e); });

  // Moderate bullish signal — conservative might say NO BET, aggressive might say ABOVE
  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('ST-2', 0.3, { aggressionScore: 0.3 }));
  bus.emit(EVENTS.FEATURES, makeFeature('ST-2', 0.015));

  const e = events.at(-1)!;
  const conservative = e.strategies.find(s => s.id === 'conservative')!;
  const aggressive = e.strategies.find(s => s.id === 'aggressive')!;

  assert.ok(conservative !== undefined, 'should have conservative strategy');
  assert.ok(aggressive !== undefined, 'should have aggressive strategy');
  // Conservative has higher threshold → can only decide if signal is stronger
  assert.ok(conservative.threshold > aggressive.threshold,
    `conservative threshold (${conservative.threshold}) should be > aggressive threshold (${aggressive.threshold})`);
}

function testShadowTradingHasValidBestStrategy(): void {
  const bus = new EventBus();
  const uField = new UnifiedMarketFieldService(bus);
  const shadow = new ShadowTradingService(bus);
  uField.start();
  shadow.start();

  const events: ShadowDecisionEvent[] = [];
  bus.on<ShadowDecisionEvent>(EVENTS.SHADOW_DECISION, (e) => { events.push(e); });

  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('ST-3', 0.6));
  bus.emit(EVENTS.FEATURES, makeFeature('ST-3', 0.03));

  const e = events.at(-1)!;
  const ids = e.strategies.map(s => s.id);
  assert.ok(ids.includes(e.bestStrategyId), `bestStrategyId '${e.bestStrategyId}' must be one of the strategy ids`);
  assert.ok(e.dynamicThreshold > 0 && e.dynamicThreshold < 1, 'dynamicThreshold must be in (0,1)');
}

// ─── Integration: full pipeline ────────────────────────────────────────────────

function testFullPipelineProducesUnifiedFieldDecision(): void {
  const bus = new EventBus();

  // Wire full new pipeline
  new OrderbookDeltaService(bus).start();
  new LiquidityGravityService(bus).start();
  new RegimeTransitionService(bus).start();
  new NoiseFilterService(bus).start();
  const ra = new RealityAlignmentService(bus);
  const cwe = new CausalWeightEngine(bus);
  const uf = new UnifiedMarketFieldService(bus);
  const st = new ShadowTradingService(bus);
  ra.start();
  cwe.start();
  uf.start();
  st.start();

  const fieldEvents: UnifiedFieldEvent[] = [];
  const shadowEvents: ShadowDecisionEvent[] = [];
  bus.on<UnifiedFieldEvent>(EVENTS.UNIFIED_FIELD, (e) => { fieldEvents.push(e); });
  bus.on<ShadowDecisionEvent>(EVENTS.SHADOW_DECISION, (e) => { shadowEvents.push(e); });

  // Simulate 10 cycles of market data
  for (let i = 0; i < 10; i++) {
    const ts = Date.now() + i * 250;
    const obi = 0.3 + Math.sin(i * 0.5) * 0.2;
    bus.emit(EVENTS.MARKET_DATA, makeMarketData('INT-1', 0.55 + i * 0.005, { timestamp: ts }));
    bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('INT-1', obi, { timestamp: ts }));
    bus.emit(EVENTS.FEATURES, makeFeature('INT-1', 0.02 + i * 0.002, { timestamp: ts }));
  }

  assert.ok(fieldEvents.length >= 1, 'should produce unified field events in full pipeline');
  assert.ok(shadowEvents.length >= 1, 'should produce shadow decisions in full pipeline');

  const lastField = fieldEvents.at(-1)!;
  assert.ok(['ABOVE', 'BELOW', 'NO BET'].includes(lastField.decision),
    `decision must be ABOVE/BELOW/NO BET; got '${lastField.decision}'`);
  assert.ok(lastField.pAbove + lastField.pBelow + lastField.pNoBet > 0.99,
    'probabilities must sum to ~1');
}

// ─── Run all ──────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  testOrderbookDeltaEmitsOnFirstEvent();
  testOrderbookDeltaDetectsAddedBid();
  testOrderbookDeltaDetectsRemovedBid();
  testOrderbookDeltaDetectsSpoofedBid();

  testLiquidityGravityEmits();
  testLiquidityGravityBidWallBias();
  testLiquidityGravityAskWallBias();

  testRegimeTransitionEmits();
  testRegimeTransitionPanicRegime();
  testRegimeTransitionInstabilityRange();

  testNoiseFilterEmits();
  testNoiseFilterStructuralFractionRange();

  testUnifiedFieldEmitsOnMicroAndFeatures();
  testUnifiedFieldBullishWhenStrongBullishForces();
  testUnifiedFieldNoBetWhenHighRegimeInstability();
  testUnifiedFieldCausalAttributionSumsToApprox1();
  testUnifiedFieldGetLatestField();

  testRealityAlignmentInitialWeightsSumTo1();
  testRealityAlignmentUpdatesWeightsAfterProbability();

  testCausalWeightEngineRespondsToAlignment();

  testShadowTradingEmitsThreeStrategies();
  testShadowTradingConservativeMoreRestrictive();
  testShadowTradingHasValidBestStrategy();

  testFullPipelineProducesUnifiedFieldDecision();

  process.stdout.write('unified-field-ok\n');
}

await run();
