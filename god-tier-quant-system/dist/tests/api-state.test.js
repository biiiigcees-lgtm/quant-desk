import { strict as assert } from 'node:assert';
import http from 'node:http';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { ApiServer } from '../apps/api/server.js';
async function requestJson(port, path) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                }
                catch (error) {
                    reject(error);
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}
async function run() {
    const bus = new EventBus();
    bus.emit(EVENTS.EXECUTION_CONTROL, {
        mode: 'hard-stop',
        reason: 'calibration-critical',
        timestamp: 1,
    });
    bus.emit(EVENTS.EXECUTION_STATE, {
        executionId: 'exec-1',
        contractId: 'KXBTC-API',
        phase: 'blocked',
        reason: 'calibration-critical',
        safetyMode: 'hard-stop',
        timestamp: 2,
    });
    const api = new ApiServer(bus, '127.0.0.1', 0);
    await api.start();
    const server = api.server;
    assert.ok(server, 'API server should start');
    const address = server?.address();
    if (!address || typeof address === 'string') {
        throw new Error('expected API server to bind to a port');
    }
    const state = (await requestJson(address.port, '/state'));
    assert.equal(state.executionControl?.mode, 'hard-stop', 'state endpoint should expose execution control mode');
    assert.equal(state.executionState?.phase, 'blocked', 'state endpoint should expose execution state');
    const execution = (await requestJson(address.port, '/execution'));
    assert.equal(execution.executionControl?.mode, 'hard-stop', 'execution endpoint should expose control mode');
    assert.equal(execution.executionState?.phase, 'blocked', 'execution endpoint should expose state');
    const stateAtOne = (await requestJson(address.port, '/state-at-sequence/1'));
    assert.equal(stateAtOne.executionControl?.mode, 'hard-stop', 'state-at-sequence should include events up to target sequence');
    assert.equal(stateAtOne.executionState, undefined, 'state-at-sequence should exclude later events beyond target sequence');
    const stateAtTwo = (await requestJson(address.port, '/state-at-sequence/2'));
    assert.equal(stateAtTwo.executionState?.phase, 'blocked', 'state-at-sequence should include matching sequence state');
    await api.stop();
    process.stdout.write('api-state-ok\n');
}
await run();
