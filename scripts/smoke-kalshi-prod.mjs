#!/usr/bin/env node

const url = process.argv[2] || 'https://quant-desk-sooty.vercel.app/';

const requiredIds = [
  'kRingSvg',
  'kRingArc',
  'kRingTxt',
  'kCountdown',
  'kPhase',
  'kEntryGuidance',
  'kEV',
  'kTrend',
  'kWin2',
];

const requiredMarkers = [
  'updateKalshiCountdownDisplay',
  'setInterval(fetchKalshiLive, 10000)',
  '/14 signals',
  'kalshiEV',
];

function hasId(html, id) {
  return html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
}

function printSection(title, rows) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
  for (const row of rows) {
    const status = row.ok ? 'PASS' : 'FAIL';
    console.log(`${status.padEnd(5)} ${row.name}`);
  }
}

async function main() {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    console.error(`FAIL  fetch ${url} -> HTTP ${res.status}`);
    process.exit(1);
  }

  const html = await res.text();

  const idChecks = requiredIds.map((name) => ({ name: `#${name}`, ok: hasId(html, name) }));
  const markerChecks = requiredMarkers.map((name) => ({ name, ok: html.includes(name) }));

  printSection('Kalshi Element IDs', idChecks);
  printSection('Kalshi Runtime Markers', markerChecks);

  const allOk = [...idChecks, ...markerChecks].every((r) => r.ok);
  console.log(`\nOverall: ${allOk ? 'PASS' : 'FAIL'}`);
  if (!allOk) process.exitCode = 2;
}

main().catch((err) => {
  console.error('FAIL  smoke-check crashed');
  console.error(err?.stack || String(err));
  process.exit(1);
});
