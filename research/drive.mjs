// Minimal local stand-in for the bars-replay harness, for smoke-testing main.ts end to end on
// Windows (the kit's grade-local sandbox needs POSIX host paths). It speaks the protocol
// (hello, one batch per bar, done), fills orders at the next bar's open with the fee, slippage
// and 1 + a/D impact in float, and prints the fills and the final PnL. The official grader is
// integer-exact; this only checks that the bot talks the protocol and trades as the backtest says.
// usage: node research/drive.mjs <bars.ndjson> [botDir]
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';

const bars = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const botDir = resolve(process.argv[3] ?? '.');
const bot = spawn(process.execPath, [join(botDir, 'main.ts')], { stdio: ['pipe', 'pipe', 'inherit'] });
const replies = createInterface({ input: bot.stdout });
const it = replies[Symbol.asyncIterator]();

const PS = 1e5, QS = 1e8, US = 1e6;
let cash = 1000 * US; // quote units
let qty = 0; // raw qty units
let cost = 0;
let trades = 0;
const send = (m) => bot.stdin.write(JSON.stringify(m) + '\n');
const account = (c) => {
  const pos = qty > 0 ? [{ symbol: 'CBBTC', qty: String(Math.round(qty)), cost_quote_units: String(Math.round(cost)) }] : [];
  return { cash_quote_units: String(Math.round(cash)), positions: pos, equity_quote_units: String(Math.round(cash + (qty / QS) * c * US)) };
};
const toBar = (b) => ({ symbol: 'CBBTC', t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, o_depth: b.o_depth, c_depth: b.c_depth });

send({
  type: 'hello', protocol: 'agent-fun/bars-replay/v1', seed: '1',
  symbols: [{ symbol: 'CBBTC', mint: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', price_scale: 5, qty_scale: 8 }],
  capital: { quote: 'USDC', quote_scale: 6, quote_units: String(1000 * US) }, bar_interval: '1m', first_close_ms: bars[0].t,
  caps: { max_open_positions: 1, max_orders_per_bar: 16, max_weight_bps: 10000, shorts: false, leverage: false },
  fees: { fee_bps: 4, slippage_bps: 2, min_notional_quote_units: '1000000' }, latency_bars: 1,
});

let pending = [];
for (let i = 0; i < bars.length; i++) {
  const b = bars[i];
  const o = +b.o / PS, depth = +b.o_depth[0] / US, prevC = i > 0 ? +bars[i - 1].c / PS : o;
  const fills = [];
  for (const ord of pending) {
    const base = { client_id: ord.client_id, symbol: 'CBBTC', side: ord.side, decided_bar: i - 1, fill_bar: i };
    if (i === 0) { fills.push({ ...base, status: 'rejected', reason: 'no_bar', price: '0', qty: '0', notional_quote_units: '0', fee_quote_units: '0' }); continue; }
    if (ord.side === 'buy') {
      const n = +ord.notional_quote_units / US, a = n * 0.9996, p = o * 1.0002 * (1 + a / depth);
      if ((p / prevC - 1) * 1e4 > ord.max_slippage_bps || n * US > cash) { fills.push({ ...base, status: 'rejected', reason: 'max_slippage', price: '0', qty: '0', notional_quote_units: '0', fee_quote_units: '0' }); continue; }
      const q = (a / p) * QS;
      qty += q; cost += n * US; cash -= n * US; trades++;
      fills.push({ ...base, status: 'filled', reason: null, price: String(Math.round(p * PS)), qty: String(Math.round(q)), notional_quote_units: String(Math.round(n * US)), fee_quote_units: String(Math.round(n * 4e-4 * US)) });
    } else {
      const q = Math.min(+ord.qty, qty), a = (q / QS) * o, p = (o * 0.9998) / (1 + a / depth), gross = (q / QS) * p;
      cash += gross * 0.9996 * US; qty -= q; cost = qty > 0 ? cost * (qty / (qty + q)) : 0; trades++;
      fills.push({ ...base, status: 'filled', reason: null, price: String(Math.round(p * PS)), qty: String(Math.round(q)), notional_quote_units: String(Math.round(gross * US)), fee_quote_units: String(Math.round(gross * 4e-4 * US)) });
    }
    console.log(`bar ${i} ${ord.side} ${ord.client_id} filled @${(+fills.at(-1).price / PS).toFixed(1)} cash ${(cash / US).toFixed(4)}`);
  }
  send({ type: 'batch', seq: i, t: b.t, bars: [toBar(b)], fills, account: account(+b.c / PS) });
  const { value } = await it.next();
  const reply = JSON.parse(value);
  if (reply.type !== 'reply' || reply.seq !== i) throw new Error(`bad reply at ${i}: ${value}`);
  pending = i === bars.length - 1 ? [] : reply.orders;
}
const last = bars.at(-1), c = +last.c / PS;
if (qty > 0) { const a = (qty / QS) * c; cash += (qty / QS) * ((c * 0.9998) / (1 + a / (+last.c_depth[0] / US))) * 0.9996 * US; qty = 0; }
send({ type: 'done', seq: bars.length, reason: 'end_of_data', account: account(c) });
bot.stdin.end();
console.log(`net pnl ${((cash - 1000 * US) / US).toFixed(6)} USDC, trades ${trades}`);
