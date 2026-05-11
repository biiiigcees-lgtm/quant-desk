// @ts-nocheck
// @ts-nocheck
const { describe, it, beforeEach } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
import { MarketStore } from '../lib/marketStore.js';

describe('MarketStore — reactive state', () => {
  let store;

  beforeEach(() => { store = new MarketStore(); });

  it('initializes with default price null', () => {
    assert.equal(store.state.price, null);
  });

  it('setState merges patch into state', () => {
    store.setState({ price: 95000 });
    assert.equal(store.state.price, 95000);
  });

  it('setState sets updatedAt to a recent timestamp', () => {
    const before = Date.now();
    store.setState({ price: 1 });
    assert.ok(store.state.updatedAt >= before);
  });

  it('subscribe fires immediately with current state', () => {
    store.setState({ price: 42000 });
    let received = null;
    store.subscribe(s => { received = s.price; });
    assert.equal(received, 42000);
  });

  it('subscribe fires on subsequent setState', () => {
    const calls = [];
    store.subscribe(s => calls.push(s.price));
    store.setState({ price: 10000 });
    assert.deepEqual(calls, [null, 10000]);
  });

  it('unsubscribe stops further notifications', () => {
    const calls = [];
    const unsub = store.subscribe(s => calls.push(s.price));
    unsub();
    store.setState({ price: 99999 });
    assert.equal(calls.length, 1); // only the immediate call
  });

  it('listener errors do not break other listeners', () => {
    store.subscribe(() => { throw new Error('bad listener'); });
    const calls = [];
    store.subscribe(s => calls.push(s.price));
    store.setState({ price: 1 });
    assert.equal(calls.at(-1), 1);
  });
});

describe('MarketStore — orderbook', () => {
  let store;

  beforeEach(() => { store = new MarketStore(); });

  it('snapshotOrderbook populates sorted bids/asks', () => {
    store.snapshotOrderbook(
      [['50000', '1.5'], ['49900', '2.0']],
      [['50100', '0.5'], ['50200', '1.0']],
    );
    const { bids, asks } = store.state.orderbook;
    assert.equal(bids[0][0], 50000); // highest bid first
    assert.equal(asks[0][0], 50100); // lowest ask first
  });

  it('updateOrderbook removes levels with size 0', () => {
    store.snapshotOrderbook([['50000', '1']], []);
    store.updateOrderbook([['buy', '50000', '0']]);
    assert.equal(store.state.orderbook.bids.length, 0);
  });

  it('updateOrderbook updates existing level size', () => {
    store.snapshotOrderbook([['50000', '1']], []);
    store.updateOrderbook([['buy', '50000', '3']]);
    assert.equal(store.state.orderbook.bids[0][1], 3);
  });

  it('imbalance is positive when bid volume dominates', () => {
    // Large bids, tiny asks
    store.snapshotOrderbook(
      Array.from({ length: 10 }, (_, i) => [String(49990 - i), '10']),
      Array.from({ length: 10 }, (_, i) => [String(50000 + i), '0.001']),
    );
    assert.ok(store.state.imbalance > 0, `imbalance=${store.state.imbalance}`);
  });
});

describe('MarketStore — trade flow', () => {
  let store;

  beforeEach(() => { store = new MarketStore(); });

  it('addTrade updates lastTrade', () => {
    const trade = { price: 50000, size: 1, side: 'buy', time: null, ts: Date.now() };
    store.addTrade(trade);
    assert.equal(store.state.lastTrade.price, 50000);
  });

  it('CVD increments on buy, decrements on sell', () => {
    store.addTrade({ price: 1, size: 2, side: 'buy',  ts: Date.now() });
    store.addTrade({ price: 1, size: 1, side: 'sell', ts: Date.now() });
    assert.equal(store.state.cvd, 1);
  });

  it('trade buffer is capped at 100', () => {
    for (let i = 0; i < 105; i++) {
      store.addTrade({ price: 1, size: 0.1, side: 'buy', ts: Date.now() });
    }
    assert.equal(store.state.trades.length, 100);
  });
});

describe('MarketStore — liquidation zones', () => {
  let store;

  beforeEach(() => { store = new MarketStore(); });

  it('produces 8 zones at known offsets from price', () => {
    store.computeLiquidationZones(100000);
    const zones = store.state.liquidationZones;
    assert.equal(zones.length, 8);
    // 10x long: price * 1.012
    assert.ok(Math.abs(zones[0].price - 101200) < 1);
    // 10x short: price * 0.988
    assert.ok(Math.abs(zones[1].price - 98800) < 1);
  });

  it('does nothing when price is falsy', () => {
    store.computeLiquidationZones(0);
    assert.equal(store.state.liquidationZones.length, 0);
  });
});

describe('MarketStore — flow toxicity', () => {
  let store;

  beforeEach(() => { store = new MarketStore(); });

  it('returns 0 when no trades exist', () => {
    store.computeFlowToxicity();
    assert.equal(store.state.flowToxicity, 0);
  });

  it('returns 100 when flow is one-sided', () => {
    for (let i = 0; i < 10; i++) {
      store.addTrade({ price: 1, size: 1, side: 'buy', ts: Date.now() });
    }
    store.computeFlowToxicity();
    assert.equal(store.state.flowToxicity, 100);
  });

  it('returns 0 when buy and sell are perfectly balanced', () => {
    for (let i = 0; i < 10; i++) {
      store.addTrade({ price: 1, size: 1, side: 'buy',  ts: Date.now() });
      store.addTrade({ price: 1, size: 1, side: 'sell', ts: Date.now() });
    }
    store.computeFlowToxicity();
    assert.equal(store.state.flowToxicity, 0);
  });

  it('computeFlowToxicity is called automatically by addTrade', () => {
    // After adding one-sided trades, toxicity should be non-zero without
    // manually calling computeFlowToxicity()
    for (let i = 0; i < 10; i++) {
      store.addTrade({ price: 1, size: 1, side: 'buy', ts: Date.now() });
    }
    assert.ok(store.state.flowToxicity > 0, 'flowToxicity should be auto-computed on addTrade');
  });
});

describe('MarketStore — _prevWalls memory management', () => {
  let store;

  beforeEach(() => { store = new MarketStore(); });

  it('prunes stale _prevWalls entries when size exceeds 500', () => {
    // Seed 600 stale entries (ts well in the past)
    for (let i = 0; i < 600; i++) {
      store._prevWalls.set(`bid:${i}`, { size: 1, ts: Date.now() - 120000 });
    }
    // Trigger _detectSpoof via a snapshot update which calls _rebuildOrderbook
    store.snapshotOrderbook(
      [['50000', '1']],
      [['50100', '1']],
    );
    // All 600 stale entries should have been pruned
    assert.ok(store._prevWalls.size <= 500, `_prevWalls size ${store._prevWalls.size} should be ≤500 after pruning`);
  });
});
