// Grid sweep of Strategy params over every window in a data directory.
// usage: node research/sweep.ts <dataDir> [top]
// Ranks parameter sets by their worst window first (we want "rarely loses"), then the mean.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULTS, type Params } from '../strategy.ts';
import { loadWindow, run } from './backtest.ts';

const dir = process.argv[2];
const top = Number(process.argv[3] ?? 25);
const windows = readdirSync(dir)
  .filter((f) => f.endsWith('.ndjson'))
  .sort()
  .map((f) => loadWindow(join(dir, f), f.replace('.ndjson', '').replace('btc-race-', '')));

const grid: Record<string, number[]> = JSON.parse(process.env.GRID ?? '{}');
const keys = Object.keys(grid);
const combos: Partial<Params>[] = [{}];
for (const k of keys) {
  const next: Partial<Params>[] = [];
  for (const c of combos) for (const v of grid[k]) next.push({ ...c, [k]: v });
  combos.splice(0, combos.length, ...next);
}

const rows: { c: Partial<Params>; pnls: number[]; trades: number[]; min: number; mean: number; pos: number; dd: number }[] = [];
for (const c of combos) {
  const p = { ...DEFAULTS, ...JSON.parse(process.env.BASE ?? '{}'), ...c } as Params;
  const rs = windows.map((w) => run(p, w));
  const pnls = rs.map((r) => r.pnl);
  rows.push({
    c,
    pnls,
    trades: rs.map((r) => r.trades),
    min: Math.min(...pnls),
    mean: pnls.reduce((a, x) => a + x, 0) / pnls.length,
    pos: pnls.filter((x) => x > 0).length,
    dd: Math.max(...rs.map((r) => r.maxDd)),
  });
}
const by = process.env.SORT ?? 'min';
rows.sort((a, b) => (by === 'mean' ? b.mean - a.mean : b.min - a.min || b.mean - a.mean));
console.log('windows:', windows.map((w) => w.name).join(' | '));
console.log(`${combos.length} combos`);
for (const r of rows.slice(0, top)) {
  console.log(
    `min ${r.min.toFixed(2).padStart(7)} mean ${r.mean.toFixed(2).padStart(6)} pos ${r.pos}/${windows.length} dd ${(r.dd * 100).toFixed(2)}% | ` +
      r.pnls.map((x, i) => `${x.toFixed(1)}(${r.trades[i]})`).join(' ') +
      ' | ' +
      JSON.stringify(r.c),
  );
}
