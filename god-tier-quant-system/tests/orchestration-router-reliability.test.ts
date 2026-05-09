import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { AiAgentRouterService } from '../services/ai-orchestration/router/service.js';
import { AgentProvider, AgentProviderResult } from '../services/ai-orchestration/types.js';

class AlwaysFailProvider implements AgentProvider {
  public calls = 0;

  async run(): Promise<AgentProviderResult> {
    this.calls += 1;
    throw new Error('provider-failure');
  }
}

async function testCircuitBreakerSkipsAfterThreshold(): Promise<void> {
  const bus = new EventBus();
  const provider = new AlwaysFailProvider();

  const router = new AiAgentRouterService(bus, provider, {
    enabled: true,
    defaultContractId: 'KXBTC-REL',
    shadowMode: false,
    scheduler: { maxParallel: 8 },
    circuitBreaker: { failureThreshold: 1, cooldownMs: 60_000 },
  });
  router.start();

  let failures = 0;
  const errorTypes: string[] = [];
  bus.on(EVENTS.AI_AGENT_FAILURE, (event: { error: string }) => {
    failures += 1;
    errorTypes.push(event.error);
  });

  // First event should attempt provider call and fail.
  bus.emit(EVENTS.EXECUTION_PLAN, {
    executionId: 'exec-a',
    contractId: 'KXBTC-REL',
    direction: 'YES',
    orderStyle: 'market',
    slices: 1,
    expectedSlippage: 0.01,
    fillProbability: 0.8,
    limitPrice: 0.5,
    size: 10,
    latencyBudgetMs: 40,
    routeReason: 'test',
    safetyMode: 'normal',
    timestamp: Date.now(),
  });

  await new Promise((resolve) => setTimeout(resolve, 25));

  // Wait past execution-intelligence debounce window so a second routing attempt occurs.
  await new Promise((resolve) => setTimeout(resolve, 800));

  // Second event should be blocked by open circuit and not call provider.
  bus.emit(EVENTS.EXECUTION_PLAN, {
    executionId: 'exec-b',
    contractId: 'KXBTC-REL',
    direction: 'YES',
    orderStyle: 'market',
    slices: 1,
    expectedSlippage: 0.01,
    fillProbability: 0.8,
    limitPrice: 0.5,
    size: 10,
    latencyBudgetMs: 40,
    routeReason: 'test',
    safetyMode: 'normal',
    timestamp: Date.now() + 1,
  });

  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(provider.calls, 1, 'provider should be called once before circuit opens');
  assert.ok(failures >= 2, 'expected provider failure and circuit-open failure events');
  assert.ok(errorTypes.includes('circuit-open'), 'expected circuit-open failure emission');
}

async function run(): Promise<void> {
  await testCircuitBreakerSkipsAfterThreshold();
  process.stdout.write('orchestration-router-reliability-ok\n');
}

await run();
