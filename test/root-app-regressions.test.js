import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('root app regressions', () => {
  it('contains no browser storage usage in index.html', () => {
    const html = read('index.html');
    assert.doesNotMatch(html, /localStorage|sessionStorage/);
  });

  it('contains no Binance or Kraken references in the root app runtime code', () => {
    const files = [
      'index.html',
      'README.md',
      'api/analyze.js',
      'api/derivatives.js',
      'api/ohlcv.js',
      'api/oracle.js',
      'api/performance.js',
      'api/record-result.js',
      'api/system-truth.js',
      'lib/coinbaseWebsocket.js',
      'lib/systemTruthClient.js',
    ];

    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /binance/i, `${file} should not reference Binance`);
      assert.doesNotMatch(source, /kraken/i, `${file} should not reference Kraken`);
    }
  });
});
