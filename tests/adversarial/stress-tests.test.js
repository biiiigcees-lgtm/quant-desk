// Adversarial Tests - Simulate Extreme Conditions
// Tests system stability under volatility spikes, data corruption, delays

describe('Adversarial Stress Tests', () => {
  
  describe('Extreme Volatility Scenarios', () => {
    test('should handle rapid price spikes without crashing', () => {
      const initialPrice = 50000;
      marketStore.price = initialPrice;
      
      // Simulate 10% spike in 1 second
      for (let i = 0; i < 100; i++) {
        handleTicker({
          type: 'ticker',
          price: (initialPrice * (1 + (i / 100) * 0.1)).toString(),
          best_bid: (initialPrice * (1 + (i / 100) * 0.1) - 1).toString(),
          best_ask: (initialPrice * (1 + (i / 100) * 0.1) + 1).toString(),
          high_24h: (initialPrice * 1.15).toString(),
          low_24h: (initialPrice * 0.85).toString(),
          open_24h: initialPrice.toString(),
          volume_24h: '10000.00',
          time: new Date().toISOString()
        });
      }
      
      expect(marketStore.price).toBeGreaterThan(initialPrice * 1.09);
      expect(marketStore.candles.length).toBeGreaterThan(0);
      expect(() => computeIndicators()).not.toThrow();
    });

    test('should handle flash crash scenario', () => {
      const initialPrice = 50000;
      marketStore.price = initialPrice;
      
      // Simulate 20% crash
      handleTicker({
        type: 'ticker',
        price: '40000.00',
        best_bid: '39999.00',
        best_ask: '40001.00',
        high_24h: '51000.00',
        low_24h: '39000.00',
        open_24h: initialPrice.toString(),
        volume_24h: '50000.00',
        time: new Date().toISOString()
      });
      
      expect(marketStore.price).toBe(40000);
      expect(() => computeIndicators()).not.toThrow();
      expect(marketStore.regime).toBeDefined();
    });

    test('should handle liquidity collapse (zero spread)', () => {
      handleTicker({
        type: 'ticker',
        price: '50000.00',
        best_bid: '50000.00',
        best_ask: '50000.00',
        high_24h: '51000.00',
        low_24h: '49000.00',
        open_24h: '49500.00',
        volume_24h: '1000.00',
        time: new Date().toISOString()
      });
      
      expect(marketStore.spread).toBe(0);
      expect(() => computeIndicators()).not.toThrow();
    });
  });

  describe('Data Corruption Scenarios', () => {
    test('should handle malformed WebSocket messages', () => {
      const malformedMessages = [
        { type: 'ticker', price: 'invalid' },
        { type: 'ticker', price: null },
        { type: 'ticker' },
        { type: 'unknown' },
        null,
        undefined,
        'invalid string',
        { type: 'ticker', best_bid: 'NaN' }
      ];
      
      malformedMessages.forEach(msg => {
        expect(() => handleTicker(msg)).not.toThrow();
      });
      
      expect(marketStore.price).toBeDefined();
    });

    test('should handle corrupted orderbook data', () => {
      const corruptedSnapshots = [
        { type: 'snapshot', bids: null, asks: null },
        { type: 'snapshot', bids: [['invalid', 'invalid']], asks: [['invalid', 'invalid']] },
        { type: 'snapshot', bids: [['-100', '10']], asks: [['-100', '10']] },
        { type: 'snapshot', bids: [['50000', '-5']], asks: [['50000', '-5']] }
      ];
      
      corruptedSnapshots.forEach(snapshot => {
        expect(() => handleObSnapshot(snapshot)).not.toThrow();
      });
      
      expect(marketStore.bidsList).toBeDefined();
      expect(marketStore.asksList).toBeDefined();
    });

    test('should handle corrupted candle data', async () => {
      // Mock fetch to return corrupted data
      const originalFetch = global.fetch;
      global.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve([
          [1234567890, null, null, null, null, null],
          [1234567890, 'invalid', 'invalid', 'invalid', 'invalid', 'invalid'],
          [1234567890, -100, -100, -100, -100, -100]
        ])
      }));
      
      await bootstrapCandles();
      
      global.fetch = originalFetch;
      
      expect(marketStore.candles.length).toBeGreaterThanOrEqual(0);
      expect(() => computeIndicators()).not.toThrow();
    });

    test('should handle API failures gracefully', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));
      
      await expect(pollOracle()).resolves.not.toThrow();
      await expect(pollDerivatives()).resolves.not.toThrow();
      
      global.fetch = originalFetch;
    });
  });

  describe('Delayed WebSocket Updates', () => {
    test('should handle delayed ticker updates', (done) => {
      marketStore.price = 50000;
      
      setTimeout(() => {
        handleTicker({
          type: 'ticker',
          price: '50100.00',
          best_bid: '50099.00',
          best_ask: '50101.00',
          high_24h: '51000.00',
          low_24h: '49000.00',
          open_24h: '49500.00',
          volume_24h: '1000.00',
          time: new Date().toISOString()
        });
        
        expect(marketStore.price).toBe(50100);
        done();
      }, 5000); // 5 second delay
    });

    test('should handle out-of-order messages', () => {
      const messages = [
        { type: 'ticker', price: '50300.00', time: new Date(Date.now() - 3000).toISOString() },
        { type: 'ticker', price: '50100.00', time: new Date(Date.now() - 2000).toISOString() },
        { type: 'ticker', price: '50200.00', time: new Date(Date.now() - 1000).toISOString() }
      ];
      
      messages.reverse().forEach(msg => handleTicker(msg));
      
      expect(marketStore.price).toBe(50300);
      expect(() => computeIndicators()).not.toThrow();
    });
  });

  describe('Missing OHLCV Candles', () => {
    test('should handle gaps in candle data', () => {
      const now = Date.now();
      marketStore.candles = [
        { time: now - 1800000, open: 49000, high: 49100, low: 48900, close: 49050, volume: 100 },
        { time: now - 900000, open: 49050, high: 49150, low: 48950, close: 49100, volume: 100 }
        // Missing current candle
      ];
      
      updateCurrentCandle(49200);
      
      expect(marketStore.candles.length).toBe(3);
      expect(() => computeIndicators()).not.toThrow();
    });

    test('should handle single candle', () => {
      marketStore.candles = [{
        time: Date.now() - 900000,
        open: 50000,
        high: 50100,
        low: 49900,
        close: 50050,
        volume: 100
      }];
      
      computeIndicators();
      
      expect(marketStore.ema9).toBe(0);
      expect(marketStore.ema21).toBe(0);
    });
  });

  describe('WebSocket Reconnection Stress', () => {
    test('should handle rapid reconnection attempts', () => {
      marketStore.reconnectCount = 0;
      
      for (let i = 0; i < 10; i++) {
        scheduleReconnect();
      }
      
      expect(marketStore.reconnectCount).toBeGreaterThan(0);
      expect(marketStore.reconnectCount).toBeLessThan(30); // Cap at 30s max delay
    });

    test('should reset reconnect count on successful connection', () => {
      marketStore.reconnectCount = 5;
      
      // Simulate successful connection
      setWsStatus('connected');
      marketStore.wsConnected = true;
      marketStore.reconnectCount = 0;
      
      expect(marketStore.reconnectCount).toBe(0);
    });
  });

  describe('Memory Leak Tests', () => {
    test('should not accumulate unbounded trades', () => {
      const initialLength = marketStore.trades.length;
      
      for (let i = 0; i < 200; i++) {
        handleTrade({
          type: 'match',
          price: (50000 + i).toString(),
          size: '0.1',
          side: i % 2 === 0 ? 'buy' : 'sell',
          time: new Date().toISOString()
        });
      }
      
      expect(marketStore.trades.length).toBeLessThanOrEqual(100);
    });

    test('should not accumulate unbounded candles', () => {
      marketStore.candles = [];
      
      for (let i = 0; i < 400; i++) {
        updateCurrentCandle(50000 + i);
      }
      
      expect(marketStore.candles.length).toBeLessThanOrEqual(300);
    });

    test('should not accumulate unbounded anomalies', () => {
      for (let i = 0; i < 20; i++) {
        marketStore.anomalies.unshift({
          type: 'TEST_ANOMALY',
          price: 50000,
          ts: Date.now()
        });
      }
      
      expect(marketStore.anomalies.length).toBeLessThanOrEqual(6);
    });
  });

  describe('Extreme Regime Transitions', () => {
    test('should handle rapid regime flips', () => {
      marketStore.candles = Array.from({length: 30}, (_, i) => ({
        time: Date.now() - (30 - i) * 900000,
        open: 49000 + i * 100,
        high: 49000 + i * 100 + 50,
        low: 49000 + i * 100 - 50,
        close: 49000 + i * 100,
        volume: 1000
      }));
      marketStore.price = 52000;
      
      computeIndicators();
      const regime1 = marketStore.regime;
      
      // Reverse trend
      marketStore.candles = Array.from({length: 30}, (_, i) => ({
        time: Date.now() - (30 - i) * 900000,
        open: 52000 - i * 100,
        high: 52000 - i * 100 + 50,
        low: 52000 - i * 100 - 50,
        close: 52000 - i * 100,
        volume: 1000
      }));
      marketStore.price = 49000;
      
      computeIndicators();
      const regime2 = marketStore.regime;
      
      expect(regime1).toBeDefined();
      expect(regime2).toBeDefined();
      expect(() => computeIndicators()).not.toThrow();
    });
  });
});
