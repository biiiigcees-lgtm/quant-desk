import { strict as assert } from 'node:assert';
import { parseAgentJson } from '../services/ai-orchestration/agents/common.js';
function testParsesStrictJsonObject() {
    const parsed = parseAgentJson('{"confidence":0.82,"nested":{"ok":true}}');
    assert.equal(parsed.confidence, 0.82);
    assert.equal(parsed.nested.ok, true);
}
function testParsesFencedJsonObject() {
    const parsed = parseAgentJson('```json\n{"regimeClassification":"trending","confidence":0.66}\n```');
    assert.equal(parsed.regimeClassification, 'trending');
    assert.equal(parsed.confidence, 0.66);
}
function testRejectsNarrativeWrappedJson() {
    assert.throws(() => parseAgentJson('Here is your payload: {"confidence":0.5}'), /strict JSON object/i);
}
function testRejectsUnsafeKeys() {
    assert.throws(() => parseAgentJson('{"__proto__":{"polluted":true}}'), /unsafe key/i);
}
function testRejectsNonObjectRoot() {
    assert.throws(() => parseAgentJson('[{"confidence":0.2}]'), /strict JSON object|root must be an object/i);
}
function run() {
    testParsesStrictJsonObject();
    testParsesFencedJsonObject();
    testRejectsNarrativeWrappedJson();
    testRejectsUnsafeKeys();
    testRejectsNonObjectRoot();
    process.stdout.write('orchestration-parser-guard-ok\n');
}
run();
