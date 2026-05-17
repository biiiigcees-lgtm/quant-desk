import Fastify from 'fastify';

const app = Fastify({ logger: true });

// Health check endpoint
app.get('/health', async (req, rep) => {
  return { status: 'ok', timestamp: Date.now() };
});

// AI analysis endpoint (placeholder for now)
app.post('/ai/analyze', async (req, rep) => {
  // Placeholder for AI analysis - will be implemented with quant-core integration
  return { 
    ok: true, 
    insight: {
      action: 'NO_TRADE',
      direction: 'NEUTRAL',
      probability: 0.5,
      confidence: 0.5,
      expectedValue: 0,
      regime: 'UNKNOWN',
      riskStatus: 'LOW',
      explanation: 'API endpoint ready - quant-core integration pending'
    }
  };
});

app.listen({ port: 3002 }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening on ${address}`);
});
