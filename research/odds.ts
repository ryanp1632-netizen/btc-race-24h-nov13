// Only the top 10 are paid, so what matters is P(net PnL >= the 10th place), not the mean.
// Past 10th places: +1.43 (Nov 11 race), -0.00 (Nov 12 race). This scores a grid by the share of
// rolling 24h windows (hourly starts over the stitched past data) that end at >= +1.5 and >= +4,
// and shows the dev-window PnL (the gate: it must be > 0).
// usage: BASE='{...}' GRID='{"k":[...]}' node research/odds.ts <dataDir> [top]
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PARAMS } from '../params.ts';
import type { Params } from '../strategy.ts';
import { loadWindow, run, type RawBar } from './backtest.ts';

const dir = process.argv[2];
const top = Number(process.argv[3] ?? 30);
const byT = new Map<number, RawBar>();
for (const f of readdirSync(dir).filter((x) => x.endsWith('.ndjson'))) for (const b of loadWindow(join(dir, f), f).bars) byT.set(b.t, b);
const all = [...byT.values()].sort((a, b) => a.t - b.t);
const stretches: RawBar[][] = [];
for (const b of all) {
  const cur = stretches.at(-1);
  if (cur !== undefined && b.t - cur.at(-1)!.t <= 5 * 60_000) cur.push(b);
  else stretches.push([b]);
}
const windows: RawBar[][] = [];
for (const s of stretches) for (let i = 0; i + 1440 <= s.length; i += 60) windows.push(s.slice(i, i + 1440));
const dev = loadWindow(join(dir, 'cur_dev.ndjson'), 'dev');

const grid: Record<string, number[]> = JSON.parse(process.env.GRID ?? '{}');
let combos: Partial<Params>[] = [{}];
for (const k of Object.keys(grid)) combos = combos.flatMap((c) => grid[k].map((v) => ({ ...c, [k]: v })));
const base = { ...PARAMS, ...JSON.parse(process.env.BASE ?? '{}') };
const rows = combos.map((c) => {
  const p = { ...base, ...c } as Params;
  const pn = windows.map((w) => run(p, { name: '', bars: w }).pnl);
  const share = (x: number) => pn.filter((v) => v >= x).length / pn.length;
  return { c, a: share(1.5), b: share(4), neg: pn.filter((v) => v < -0.01).length / pn.length, mean: pn.reduce((s, v) => s + v, 0) / pn.length, dev: run(p, dev).pnl };
});
rows.sort((x, y) => y.a + y.b - (x.a + x.b));
console.log(`${windows.length} rolling windows, ${combos.length} combos`);
for (const r of rows.slice(0, top))
  console.log(`>=1.5 ${(r.a * 100).toFixed(0).padStart(3)}% >=4 ${(r.b * 100).toFixed(0).padStart(3)}% <0 ${(r.neg * 100).toFixed(0).padStart(3)}% mean ${r.mean.toFixed(1).padStart(6)} dev ${r.dev.toFixed(2).padStart(6)} | ${JSON.stringify(r.c)}`);
