import { strict as assert } from 'node:assert';
import { parseAgentJson } from '../services/ai-orchestration/agents/common.js';

function testParsesStrictJsonObject(): void {
  const parsed = parseAgentJson<{ confidence: number; nested: { ok: boolean } }>(
    '{"confidence":0.82,"nested":{"ok":true}}',
  );

  assert.equal(parsed.confidence, 0.82);
  assert.equal(parsed.nested.ok, true);
}

function testParsesFencedJsonObject(): void {
  const parsed = parseAgentJson<{ regimeClassification: string; confidence: number }>(
    '```json\n{"regimeClassification":"trending","confidence":0.66}\n```',
  );

  assert.equal(parsed.regimeClassification, 'trending');
  assert.equal(parsed.confidence, 0.66);
}

function testRejectsNarrativeWrappedJson(): void {
  assert.throws(
    () => parseAgentJson('Here is your payload: {"confidence":0.5}'),
    /strict JSON object/i,
  );
}

function testRejectsUnsafeKeys(): void {
  assert.throws(
    () => parseAgentJson('{"__proto__":{"polluted":true}}'),
    /unsafe key/i,
  );
}

function testRejectsNonObjectRoot(): void {
  assert.throws(
    () => parseAgentJson('[{"confidence":0.2}]'),
    /strict JSON object|root must be an object/i,
  );
}

function run(): void {
  testParsesStrictJsonObject();
  testParsesFencedJsonObject();
  testRejectsNarrativeWrappedJson();
  testRejectsUnsafeKeys();
  testRejectsNonObjectRoot();
  process.stdout.write('orchestration-parser-guard-ok\n');
}

run();
