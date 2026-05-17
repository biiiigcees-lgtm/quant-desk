import Fastify from 'fastify';
import { buildAIInsight } from '../../quant-core/src/engines/insight';
import { MarketContext, Trade, OrderBook } from '../../quant-core/src/types/market';

const app = Fastify({ logger: true });

const MarketSchema = {
  type: 'object',
  required: [
    'symbol',
    'timestamp',
    'price',
    'volume',
    'buyVolume',
    'sellVolume',
    'bidDepth',
    'askDepth',
    'openInterest',
    'fundingRate',
    'liquidationLong',
    'liquidationShort',
    'volatility',
  ],
  properties: {
    symbol: { type: 'string' },
    timestamp: { type: 'number' },
    price: { type: 'number' },
    volume: { type: 'number' },
    buyVolume: { type: 'number' },
    sellVolume: { type: 'number' },
    bidDepth: { type: 'number' },
    askDepth: { type: 'number' },
    openInterest: { type: 'number' },
    fundingRate: { type: 'number' },
    liquidationLong: { type: 'number' },
    liquidationShort: { type: 'number' },
    volatility: { type: 'number' },
  },
};

app.post('/ai/analyze', {
  schema: {
    body: {
      type: 'object',
      required: ['ctx', 'trades', 'orderBook'],
      properties: {
        ctx: MarketSchema,
        trades: { type: 'array' },
        orderBook: { type: 'object' },
      },
    },
  },
}, async (req, rep) => {
  const { ctx, trades, orderBook } = req.body as {
    ctx: MarketContext;
    trades: Trade[];
    orderBook: OrderBook;
  };
  const insight = buildAIInsight(ctx, trades, orderBook);
  return { ok: true, insight };
});

app.listen({ port: 3002 }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening on ${address}`);
});
