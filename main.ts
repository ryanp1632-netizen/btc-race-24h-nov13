// cbBTC/USDC bar bot for make.fun's 24h BTC race (protocol agent-fun/bars-replay/v1).
//
// What it does, batch by batch:
//   1. A probe: buys 1.234567 USDC of cbBTC on the first batch and sells it on the next, so the
//      window always has at least one trade (the guardrail) at a cost of a fraction of a cent.
//   2. Then it waits. It only buys after a capitulation that is already turning: some bar of the
//      last few hours flushed far under the slow EMA, and the close has climbed back over a fast
//      EMA while still under the slow one. Most days that never happens and the bot stays in cash.
//   3. Exits: trailing stop once in profit, a hard stop, a time stop; no new entry after a loss.
//
// The rules live in strategy.ts (shared with the offline backtester in research/).

import { runBars, type Bar, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';
import { Strategy, DEFAULTS, type Params } from './strategy.ts';

export const PARAMS: Params = {
  ...DEFAULTS,
  emaSpan: 240,
  warmBars: 120,
  dipBps: 0,
  momBps: 0,
  flushBps: 150,
  flushLook: 180,
  fastSpan: 30,
  reclaimBps: 30,
  tpBps: 100000,
  slBps: 100,
  trailArmBps: 80,
  trailBps: 40,
  maxHold: 240,
  size: 1,
  maxEntries: 2,
  cooldown: 30,
  haltLossBps: 1,
};

const PROBE_QUOTE = 1_234_567n; // 1.234567 USDC
const BUY_SLIPPAGE_BPS = 60; // skip an entry the market gaps away from
const SELL_SLIPPAGE_BPS = 10_000; // an exit must always fill

const strategy = new Strategy(PARAMS);
let probe: 'todo' | 'bought' | 'done' = 'todo';
let exiting = false;

function price(bar: Bar, scale: number): number {
  return Number(bar.c) / 10 ** scale;
}

function onBatch(state: BarsState, batch: { bars: Bar[]; fills: { client_id: string; side: string; status: string; qty: string; notional_quote_units: string; fee_quote_units: string }[] }): OrderInput[] {
  const sym = state.hello.symbols[0];
  const held = state.positions.get(sym.symbol);
  const qtyScale = 10 ** sym.qty_scale;
  const quoteScale = 10 ** state.hello.capital.quote_scale;

  // 1. learn what filled
  for (const f of batch.fills) {
    if (f.client_id.startsWith('probe')) {
      if (f.client_id.startsWith('probe-out') && f.status === 'filled') probe = 'done';
      continue;
    }
    if (f.status !== 'filled') continue;
    const qty = Number(f.qty) / qtyScale;
    if (f.side === 'buy' && held !== undefined) {
      strategy.filledBuy(Number(held.cost) / quoteScale / (Number(held.qty) / qtyScale), PARAMS.size);
    } else if (f.side === 'sell' && qty > 0) {
      strategy.filledSell((Number(f.notional_quote_units) - Number(f.fee_quote_units)) / quoteScale / qty);
      exiting = false;
    }
  }

  const bar = batch.bars.find((b) => b.symbol === sym.symbol);
  if (bar === undefined) return [];
  const px = { o: Number(bar.o) / 10 ** sym.price_scale, h: Number(bar.h) / 10 ** sym.price_scale, l: Number(bar.l) / 10 ** sym.price_scale, c: price(bar, sym.price_scale) };

  // 2. the probe round trip
  if (probe !== 'done') {
    strategy.onBar(px, false);
    if (probe === 'todo') {
      probe = 'bought';
      return [{ side: 'buy', symbol: sym.symbol, notional_quote_units: PROBE_QUOTE, max_slippage_bps: 10_000, client_id: `probe-in` }];
    }
    if (held !== undefined) return [{ side: 'sell', symbol: sym.symbol, qty: held.qty, max_slippage_bps: SELL_SLIPPAGE_BPS, client_id: `probe-out-${state.seq}` }];
    probe = 'done';
    return [];
  }

  // 3. the strategy
  const holding = held !== undefined && held.qty > 0n;
  if (!holding) exiting = false;
  const d = strategy.onBar(px, holding);
  if (holding && (exiting || d.kind === 'sell')) {
    exiting = true;
    return [{ side: 'sell', symbol: sym.symbol, qty: held.qty, max_slippage_bps: SELL_SLIPPAGE_BPS }];
  }
  if (!holding && d.kind === 'buy') {
    // leave a hair of cash so rounding can never trip insufficient_cash
    const spend = (state.cash * BigInt(Math.round(d.fraction * 9990))) / 10_000n;
    if (spend >= BigInt(state.hello.fees.min_notional_quote_units)) {
      return [{ side: 'buy', symbol: sym.symbol, notional_quote_units: spend, max_slippage_bps: BUY_SLIPPAGE_BPS }];
    }
  }
  return [];
}

await runBars({ onBatch });
