// Print every fill of one parameter set on every window in a directory.
// usage: PARAMS='{"dipBps":200}' node research/show.ts <dataDir>
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULTS, type Params } from '../strategy.ts';
import { loadWindow, run } from './backtest.ts';

const dir = process.argv[2];
const p = { ...DEFAULTS, ...JSON.parse(process.env.PARAMS ?? '{}') } as Params;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.ndjson')).sort()) {
  const r = run(p, loadWindow(join(dir, f), f), true);
  console.log(`${f.padEnd(45)} pnl ${r.pnl.toFixed(3)} trades ${r.trades} dd ${(r.maxDd * 100).toFixed(2)}%  ${r.log.join(' | ')}`);
}
