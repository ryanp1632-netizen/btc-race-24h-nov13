// Offline replay of the bars-replay fill model, for sweeping Strategy params over past windows.
// Fill model (from the competition rules): orders decided on bar t fill at bar t+1's open;
// 4 bps fee on notional / gross proceeds; 2 bps slippage; price impact factor 1 + a/D with
// a the traded USDC value and D the bar's open depth; whatever is held at the end is sold at the
// last close against its close depth. This is a float approximation of the integer grader, good
// to a few micro-USDC per trade; the official grade-local run is the final word.

import { readFileSync } from 'node:fs';
import { Strategy, type Params, type PxBar } from '../strategy.ts';

export interface RawBar {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  o_depth: string[];
  c_depth: string[];
}

export interface Window {
  name: string;
  bars: RawBar[];
}

const PRICE_SCALE = 1e5;
const FEE = 4 / 10000;
const SLIP = 2 / 10000;

export function loadWindow(path: string, name: string): Window {
  const bars = readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as RawBar);
  return { name, bars };
}

function px(b: RawBar): PxBar {
  return { o: +b.o / PRICE_SCALE, h: +b.h / PRICE_SCALE, l: +b.l / PRICE_SCALE, c: +b.c / PRICE_SCALE };
}

export interface Result {
  pnl: number;
  trades: number;
  maxDd: number;
  log: string[];
}

export function run(p: Params, w: Window, keepLog = false, probe = true): Result {
  const s = new Strategy(p);
  let cash = 1000;
  let qty = 0;
  let trades = 0;
  let peak = 1000;
  let maxDd = 0;
  const log: string[] = [];
  let pending: { side: 'buy'; notional: number; fraction: number } | { side: 'sell' } | null = null;
  const bars = w.bars;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const o = +b.o / PRICE_SCALE;
    const depth = +b.o_depth[0] / 1e6;
    if (pending !== null) {
      if (pending.side === 'buy') {
        const a = pending.notional * (1 - FEE);
        const price = o * (1 + SLIP) * (1 + a / depth);
        qty += a / price;
        cash -= pending.notional;
        trades++;
        s.filledBuy(pending.notional / (a / price), pending.fraction);
        if (keepLog) log.push(`${i} buy ${pending.notional.toFixed(2)} @${price.toFixed(1)}`);
      } else {
        const a = qty * o;
        const price = (o * (1 - SLIP)) / (1 + a / depth);
        const net = qty * price * (1 - FEE);
        cash += net;
        s.filledSell(net / qty);
        if (keepLog) log.push(`${i} sell @${price.toFixed(1)} cash ${cash.toFixed(3)}`);
        qty = 0;
        trades++;
      }
      pending = null;
    }
    const bar = px(b);
    const eq = cash + qty * bar.c;
    if (eq > peak) peak = eq;
    if ((peak - eq) / 1000 > maxDd) maxDd = (peak - eq) / 1000;
    const d = s.onBar(bar, qty > 0);
    if (i === bars.length - 1) break;
    if (d.kind === 'buy' && qty === 0) {
      const notional = Math.floor(cash * d.fraction * 0.999 * 1e6) / 1e6;
      if (notional >= 1) pending = { side: 'buy', notional, fraction: d.fraction };
    } else if (d.kind === 'sell' && qty > 0) pending = { side: 'sell' };
  }
  if (qty > 0) {
    const last = bars[bars.length - 1];
    const c = +last.c / PRICE_SCALE;
    const a = qty * c;
    const price = (c * (1 - SLIP)) / (1 + a / (+last.c_depth[0] / 1e6));
    cash += qty * price * (1 - FEE);
    qty = 0;
  }
  // the 1.2 USDC probe round trip costs about 0.0003 USDC
  return { pnl: cash - 1000 - (probe ? 0.0003 : 0), trades, maxDd, log };
}
