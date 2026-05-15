// Performance Tests
// Tests API latency, WebSocket update delay, computation speed, memory usage

describe('Performance Tests', () => {
  
  describe('API Latency', () => {
    test('oracle API should respond within 3 seconds', async () => {
      const start = Date.now();
      const response = await fetch('/api/oracle');
      const duration = Date.now() - start;
      
      expect(response.ok).toBe(true);
      expect(duration).toBeLessThan(3000);
    });

    test('derivatives API should respond within 5 seconds', async () => {
      const start = Date.now();
      const response = await fetch('/api/derivatives');
      const duration = Date.now() - start;
      
      expect(response.ok).toBe(true);
      expect(duration).toBeLessThan(5000);
    });

    test('analyze API should respond within 10 seconds', async () => {
      const start = Date.now();
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Test prompt for performance',
          system: 'Test system'
        })
      });
      const duration = Date.now() - start;
      
      expect(response.ok).toBe(true);
      expect(duration).toBeLessThan(10000);
    });
  });

  describe('WebSocket Update Delay', () => {
    test('ticker message should process within 50ms', () => {
      const start = performance.now();
      
      handleTicker({
        type: 'ticker',
        price: '50000.00',
        best_bid: '49999.00',
        best_ask: '50001.00',
        high_24h: '51000.00',
        low_24h: '49000.00',
        open_24h: '49500.00',
        volume_24h: '1000.00',
        time: new Date().toISOString()
      });
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50);
    });

    test('orderbook update should process within 30ms', () => {
      const start = performance.now();
      
      handleObUpdate({
        type: 'l2update',
        changes: [
          ['buy', '49999.00', '2.0'],
          ['sell', '50001.00', '1.5'],
          ['buy', '49998.00', '1.0']
        ]
      });
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(30);
    });

    test('trade message should process within 20ms', () => {
      const start = performance.now();
      
      handleTrade({
        type: 'match',
        price: '50000.00',
        size: '0.5',
        side: 'buy',
        time: new Date().toISOString()
      });
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(20);
    });
  });

  describe('Indicator Computation Speed', () => {
    test('computeIndicators should complete within 100ms for 300 candles', () => {
      marketStore.candles = Array.from({length: 300}, (_, i) => ({
        time: Date.now() - (300 - i) * 900000,
        open: 49000 + i * 10,
        high: 49000 + i * 10 + 5,
        low: 49000 + i * 10 - 5,
        close: 49000 + i * 10,
        volume: 100 + i
      }));
      marketStore.price = 52000;
      
      const start = performance.now();
      computeIndicators();
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(100);
    });

    test('EMA computation should be O(n)', () => {
      const sizes = [50, 100, 200, 300];
      const times = [];
      
      sizes.forEach(size => {
        const prices = Array.from({length: size}, (_, i) => 49000 + i * 10);
        const start = performance.now();
        computeEMA(prices, 21);
        times.push(performance.now() - start);
      });
      
      // Time should scale linearly with size
      const ratio = times[3] / times[0];
      expect(ratio).toBeLessThan(10); // 6x data should take < 10x time
    });

    test('renderAll should complete within 50ms', () => {
      // Setup marketStore with data
      marketStore.candles = Array.from({length: 100}, (_, i) => ({
        time: Date.now() - (100 - i) * 900000,
        open: 49000 + i * 10,
        high: 49000 + i * 10 + 5,
        low: 49000 + i * 10 - 5,
        close: 49000 + i * 10,
        volume: 100 + i
      }));
      marketStore.price = 50000;
      marketStore.bestBid = 49999;
      marketStore.bestAsk = 50001;
      computeIndicators();
      
      const start = performance.now();
      renderAll();
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Memory Usage', () => {
    test('should not leak memory with repeated indicator computations', () => {
      marketStore.candles = Array.from({length: 200}, (_, i) => ({
        time: Date.now() - (200 - i) * 900000,
        open: 49000 + i * 10,
        high: 49000 + i * 10 + 5,
        low: 49000 + i * 10 - 5,
        close: 49000 + i * 10,
        volume: 100 + i
      }));
      marketStore.price = 51000;
      
      const initialMemory = performance.memory?.usedJSHeapSize || 0;
      
      for (let i = 0; i < 100; i++) {
        computeIndicators();
      }
      
      const finalMemory = performance.memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be minimal (< 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    test('should not leak memory with repeated renders', () => {
      const initialMemory = performance.memory?.usedJSHeapSize || 0;
      
      for (let i = 0; i < 50; i++) {
        renderAll();
      }
      
      const finalMemory = performance.memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;
      
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });
  });

  describe('Rendering Performance', () => {
    test('drawChart should complete within 30ms for 200 candles', () => {
      marketStore.candles = Array.from({length: 200}, (_, i) => ({
        time: Date.now() - (200 - i) * 900000,
        open: 49000 + i * 10,
        high: 49000 + i * 10 + 5,
        low: 49000 + i * 10 - 5,
        close: 49000 + i * 10,
        volume: 100 + i
      }));
      resizeChart();
      
      const start = performance.now();
      drawChart();
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(30);
    });

    test('renderLoop should maintain 10fps target', () => {
      const frameTimes = [];
      let frameCount = 0;
      
      const testRenderLoop = (ts) => {
        if (frameCount >= 10) return;
        
        const start = performance.now();
        computeIndicators();
        renderAll();
        const duration = performance.now() - start;
        frameTimes.push(duration);
        
        frameCount++;
        requestAnimationFrame(testRenderLoop);
      };
      
      requestAnimationFrame(testRenderLoop);
      
      // Wait for 10 frames
      return new Promise(resolve => setTimeout(resolve, 1100)).then(() => {
        const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        expect(avgFrameTime).toBeLessThan(100); // 10fps = 100ms per frame
      });
    });
  });

  describe('Blocking Operations', () => {
    test('should not block UI during indicator computation', () => {
      marketStore.candles = Array.from({length: 300}, (_, i) => ({
        time: Date.now() - (300 - i) * 900000,
        open: 49000 + i * 10,
        high: 49000 + i * 10 + 5,
        low: 49000 + i * 10 - 5,
        close: 49000 + i * 10,
        volume: 100 + i
      }));
      
      const start = performance.now();
      computeIndicators();
      const duration = performance.now() - start;
      
      // Should not block for more than 100ms
      expect(duration).toBeLessThan(100);
    });

    test('should not block UI during orderbook rebuild', () => {
      // Create large orderbook
      for (let i = 0; i < 100; i++) {
        marketStore.bids.set(50000 - i, 1 + Math.random() * 10);
        marketStore.asks.set(50000 + i, 1 + Math.random() * 10);
      }
      
      const start = performance.now();
      rebuildObLists();
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(20);
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent WebSocket messages', () => {
      const messages = Array.from({length: 50}, (_, i) => ({
        type: i % 3 === 0 ? 'ticker' : i % 3 === 1 ? 'l2update' : 'match',
        price: (50000 + i).toString(),
        best_bid: (49999 + i).toString(),
        best_ask: (50001 + i).toString(),
        high_24h: '51000.00',
        low_24h: '49000.00',
        open_24h: '49500.00',
        volume_24h: '1000.00',
        time: new Date().toISOString(),
        changes: [['buy', (50000 - i).toString(), '1.0']],
        size: '0.1',
        side: i % 2 === 0 ? 'buy' : 'sell'
      }));
      
      const start = performance.now();
      messages.forEach(msg => {
        if (msg.type === 'ticker') handleTicker(msg);
        else if (msg.type === 'l2update') handleObUpdate(msg);
        else if (msg.type === 'match') handleTrade(msg);
      });
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(100);
    });
  });
});
