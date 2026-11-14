// Stitch overlapping bar files into continuous stretches, then replay a parameter set on every
// 24h window that starts on the hour inside them: a wider (if correlated) look than the 8 windows.
// usage: PARAMS='{...overrides of params.ts}' node research/rolling.ts <dataDir>
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PARAMS } from '../params.ts';
import { loadWindow, run, type RawBar } from './backtest.ts';

const dir = process.argv[2];
const byT = new Map<number, RawBar>();
for (const f of readdirSync(dir).filter((x) => x.endsWith('.ndjson'))) for (const b of loadWindow(join(dir, f), f).bars) byT.set(b.t, b);
const all = [...byT.values()].sort((a, b) => a.t - b.t);
const stretches: RawBar[][] = [];
for (const b of all) {
  const cur = stretches.at(-1);
  if (cur !== undefined && b.t - cur.at(-1)!.t <= 5 * 60_000) cur.push(b);
  else stretches.push([b]);
}
const p = { ...PARAMS, ...JSON.parse(process.env.PARAMS ?? '{}') };
const pnls: number[] = [];
for (const s of stretches) {
  if (s.length < 1440) continue;
  const line: string[] = [];
  for (let i = 0; i + 1440 <= s.length; i += 60) {
    const r = run(p, { name: '', bars: s.slice(i, i + 1440) });
    pnls.push(r.pnl);
    line.push(r.pnl.toFixed(1));
  }
  console.log(`${new Date(s[0].t).toISOString().slice(5, 16)} +${s.length}: ${line.join(' ')}`);
}
const n = pnls.length;
console.log(`${n} windows: >0 ${pnls.filter((x) => x > 0.01).length}, ~0 ${pnls.filter((x) => Math.abs(x) <= 0.01).length}, <0 ${pnls.filter((x) => x < -0.01).length}, mean ${(pnls.reduce((a, x) => a + x, 0) / n).toFixed(2)}, worst ${Math.min(...pnls).toFixed(2)}`);
