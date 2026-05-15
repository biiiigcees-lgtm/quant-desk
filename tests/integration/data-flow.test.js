// Integration Tests for Data Pipeline
// Tests WebSocket → MarketStore → Indicators → UI flow

describe('Data Pipeline Integration', () => {
  
  describe('WebSocket to MarketStore Flow', () => {
    test('should handle ticker message and update marketStore', async () => {
      const mockMessage = {
        type: 'ticker',
        price: '50000.00',
        best_bid: '49999.00',
        best_ask: '50001.00',
        high_24h: '51000.00',
        low_24h: '49000.00',
        open_24h: '49500.00',
        volume_24h: '1000.00',
        time: new Date().toISOString()
      };
      
      // Simulate WebSocket message handling
      handleTicker(mockMessage);
      
      expect(marketStore.price).toBe(50000.00);
      expect(marketStore.bestBid).toBe(49999.00);
      expect(marketStore.bestAsk).toBe(50001.00);
      expect(marketStore.high24).toBe(51000.00);
      expect(marketStore.low24).toBe(49000.00);
    });

    test('should handle orderbook snapshot', () => {
      const mockSnapshot = {
        type: 'snapshot',
        bids: [['49999.00', '1.5'], ['49998.00', '2.0']],
        asks: [['50001.00', '1.0'], ['50002.00', '1.5']]
      };
      
      handleObSnapshot(mockSnapshot);
      
      expect(marketStore.bids.size).toBe(2);
      expect(marketStore.asks.size).toBe(2);
      expect(marketStore.bidsList.length).toBe(2);
      expect(marketStore.asksList.length).toBe(2);
    });

    test('should handle orderbook updates', () => {
      handleObSnapshot({
        type: 'snapshot',
        bids: [['49999.00', '1.5']],
        asks: [['50001.00', '1.0']]
      });
      
      const mockUpdate = {
        type: 'l2update',
        changes: [['buy', '49999.00', '2.0'], ['sell', '50001.00', '0']]
      };
      
      handleObUpdate(mockUpdate);
      
      expect(marketStore.bids.get(49999.00)).toBe(2.0);
      expect(marketStore.asks.has(50001.00)).toBe(false);
    });

    test('should handle trade messages', () => {
      const mockTrade = {
        type: 'match',
        price: '50000.00',
        size: '0.5',
        side: 'buy',
        time: new Date().toISOString()
      };
      
      handleTrade(mockTrade);
      
      expect(marketStore.trades.length).toBeGreaterThan(0);
      expect(marketStore.cvd).toBeGreaterThan(0);
      expect(marketStore.tradeDeltaBuy).toBeGreaterThan(0);
    });
  });

  describe('MarketStore to Indicators Flow', () => {
    test('should compute indicators when candles are available', () => {
      // Setup candles
      marketStore.candles = Array.from({length: 30}, (_, i) => ({
        time: Date.now() - (30 - i) * 900000,
        open: 49000 + i * 10,
        high: 49000 + i * 10 + 5,
        low: 49000 + i * 10 - 5,
        close: 49000 + i * 10,
        volume: 100 + i
      }));
      marketStore.price = 49300;
      
      computeIndicators();
      
      expect(marketStore.ema9).toBeGreaterThan(0);
      expect(marketStore.ema21).toBeGreaterThan(0);
      expect(marketStore.rsi).toBeGreaterThanOrEqual(0);
      expect(marketStore.rsi).toBeLessThanOrEqual(100);
      expect(marketStore.macd).toBeDefined();
      expect(marketStore.bb.upper).toBeGreaterThan(0);
    });

    test('should skip indicators with insufficient candles', () => {
      marketStore.candles = Array.from({length: 10}, (_, i) => ({
        time: Date.now() - (10 - i) * 900000,
        open: 49000 + i * 10,
        high: 49000 + i * 10 + 5,
        low: 49000 + i * 10 - 5,
        close: 49000 + i * 10,
        volume: 100
      }));
      
      computeIndicators();
      
      // Should not compute indicators with < 22 candles
      expect(marketStore.ema9).toBe(0);
      expect(marketStore.ema21).toBe(0);
    });
  });

  describe('API Integration Flow', () => {
    test('should fetch oracle data successfully', async () => {
      const response = await fetch('/api/oracle');
      const data = await response.json();
      
      expect(data.price).toBeDefined();
      expect(data.price).toBeGreaterThan(0);
      expect(data.sources).toBeDefined();
      expect(Array.isArray(data.sources)).toBe(true);
    });

    test('should fetch derivatives data successfully', async () => {
      const response = await fetch('/api/derivatives');
      const data = await response.json();
      
      expect(data.fundingRate).toBeDefined();
      expect(data.openInterest).toBeDefined();
      expect(data.markPrice).toBeDefined();
    });

    test('should handle AI analysis request', async () => {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Test prompt',
          system: 'Test system'
        })
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.content).toBeDefined();
    });
  });

  describe('Candle Bootstrap and Live Update', () => {
    test('should bootstrap candles from REST API', async () => {
      await bootstrapCandles();
      
      expect(marketStore.candles.length).toBeGreaterThan(0);
      expect(marketStore.candles[0].time).toBeDefined();
      expect(marketStore.candles[0].close).toBeGreaterThan(0);
    });

    test('should update current candle on price tick', () => {
      marketStore.candles = [{
        time: Math.floor(Date.now() / 900000) * 900,
        open: 50000,
        high: 50000,
        low: 50000,
        close: 50000,
        volume: 0
      }];
      
      updateCurrentCandle(50010);
      
      const lastCandle = marketStore.candles[marketStore.candles.length - 1];
      expect(lastCandle.close).toBe(50010);
      expect(lastCandle.high).toBe(50010);
    });

    test('should create new candle when time advances', () => {
      const oldTime = Math.floor(Date.now() / 900000) * 900 - 900;
      marketStore.candles = [{
        time: oldTime,
        open: 50000,
        high: 50000,
        low: 50000,
        close: 50000,
        volume: 0
      }];
      
      updateCurrentCandle(50010);
      
      expect(marketStore.candles.length).toBe(2);
      const newCandle = marketStore.candles[marketStore.candles.length - 1];
      expect(newCandle.open).toBe(50010);
    });
  });

  describe('State Synchronization', () => {
    test('should sync module MarketStore to inline marketStore', () => {
      const moduleStore = window._mStore;
      moduleStore.setState({ price: 50000, bestBid: 49999 });
      
      // Check if inline marketStore is updated via subscription
      expect(marketStore.price).toBe(50000);
      expect(marketStore.bestBid).toBe(49999);
    });

    test('should maintain candle sync between stores', () => {
      const testCandles = Array.from({length: 30}, (_, i) => ({
        time: Date.now() - (30 - i) * 900000,
        open: 49000 + i * 10,
        high: 49000 + i * 10 + 5,
        low: 49000 + i * 10 - 5,
        close: 49000 + i * 10,
        volume: 100
      }));
      
      window._mStore.setState({ candles: testCandles });
      
      expect(marketStore.candles.length).toBe(testCandles.length);
    });
  });
});
