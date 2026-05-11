import { AgentSpec } from '../types.js';

const MAX_AGENT_JSON_CHARS = 40_000;
const MAX_JSON_DEPTH = 20;
const MAX_OBJECT_KEYS = 256;
const MAX_ARRAY_ITEMS = 512;
const MAX_STRING_CHARS = 8_192;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const FENCED_JSON_RE = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

export function extractFirstJsonObject(raw: string): string {
  if (typeof raw !== 'string') {
    throw new TypeError('agent output must be text');
  }
  if (raw.length > MAX_AGENT_JSON_CHARS) {
    throw new Error('agent output exceeded maximum size');
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('agent output was empty');
  }

  const fenced = FENCED_JSON_RE.exec(trimmed);
  const candidate = (fenced ? fenced[1] : trimmed)?.trim() ?? '';
  if (!candidate.startsWith('{') || !candidate.endsWith('}')) {
    throw new Error('agent output must be a strict JSON object');
  }

  return candidate;
}

export function parseAgentJson<T>(raw: string): T {
  const body = extractFirstJsonObject(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new Error('agent output contained invalid JSON');
  }

  assertPlainObject(parsed);
  assertSafeJsonValue(parsed, 0);
  return parsed as T;
}

export function makeCompactContext(payload: unknown, maxLen: number = 3000): string {
  const text = JSON.stringify(payload);
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen)}...[truncated:${text.length - maxLen}]`;
}

export function assertConfidence(input: unknown): number {
  if (typeof input !== 'number' || Number.isNaN(input)) {
    return 0;
  }
  return Math.max(0, Math.min(1, input));
}

export type AnyAgentSpec = AgentSpec<unknown>;

function assertPlainObject(value: unknown): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('agent JSON root must be an object');
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error('agent JSON root must be a plain object');
  }
}

function assertSafeJsonValue(value: unknown, depth: number): void {
  if (depth > MAX_JSON_DEPTH) {
    throw new Error('agent JSON exceeded maximum depth');
  }

  if (value === null) {
    return;
  }

  if (Array.isArray(value)) {
    assertJsonArray(value, depth);
    return;
  }

  if (assertPrimitiveJsonValue(value)) {
    return;
  }

  if (typeof value !== 'object') {
    throw new TypeError('agent JSON contains unsupported value type');
  }

  assertJsonObject(value, depth);
}

function assertJsonArray(value: unknown[], depth: number): void {
  if (value.length > MAX_ARRAY_ITEMS) {
    throw new Error('agent JSON array exceeded maximum size');
  }
  for (const item of value) {
    assertSafeJsonValue(item, depth + 1);
  }
}

function assertPrimitiveJsonValue(value: unknown): boolean {
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_CHARS) {
      throw new Error('agent JSON string exceeded maximum size');
    }
    return true;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('agent JSON number must be finite');
    }
    return true;
  }

  return typeof value === 'boolean';
}

function assertJsonObject(value: object, depth: number): void {
  assertPlainObject(value);
  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) {
    throw new Error('agent JSON object exceeded maximum key count');
  }

  for (const [key, nested] of entries) {
    if (UNSAFE_KEYS.has(key)) {
      throw new Error('agent JSON contains unsafe key');
    }
    assertSafeJsonValue(nested, depth + 1);
  }
}
