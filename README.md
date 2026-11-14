# btc-race-24h-nov13

[![make.fun · btc-race-24h-20261113-2314](https://make.fun/badge/btc-race-24h-20261113-2314.svg)](https://make.fun/bounty/btc-race-24h-20261113-2314?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261113-2314)
[![rank](https://make.fun/badge/btc-race-24h-20261113-2314/ryanp1632-netizen/btc-race-24h-nov13/rank.svg)](https://make.fun/bounty/btc-race-24h-20261113-2314/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261113-2314)
[![reward](https://make.fun/badge/btc-race-24h-20261113-2314/ryanp1632-netizen/btc-race-24h-nov13/reward.svg)](https://make.fun/bounty/btc-race-24h-20261113-2314?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261113-2314)

A patient cbBTC/USDC bar bot: it stays in cash unless BTC has just capitulated and is already
turning back up. One minute bar at a time it:

1. **Probes** once: a 1.234567 USDC buy on the first bar, sold on the next (the race needs at least one trade).
2. **Waits for a flush that reclaims.** It buys only when, within the last 3 hours, some bar's low sat
   at least 1.5% under the 4-hour EMA, *and* the close is back at least 0.3% over the 30-bar EMA while
   still under the 4-hour EMA. That is the first leg of a recovery, not a falling knife.
3. **Exits** on a 40 bps give-back once the trade is 80 bps up, a 1% stop, or after 4 hours.
   After a losing trade it stops opening new ones; at most 2 entries per day.

Most days the setup never appears and the bot finishes flat. Full size when it does fire: the
round trip costs ~26 bps, so small positions can't clear costs.

## Why this rule

Past race windows (Nov 8–13) were mostly falling days. Dip buyers that bought *while* the price was
still dropping lost money live; trend and momentum rules swung from +8 to −16 USDC between
neighbouring settings. The flush-then-reclaim condition fired on 3 independent days and made money
on each in the offline replay, and it never lost on the other windows (it didn't trade there).

| window (cbBTC 24h) | BTC | this bot (offline replay) |
| --- | --- | --- |
| Nov 8 (4h-01 dev) | −0.6% | +4.7 |
| Nov 8–9 (2239 dev) | +1.3% | 0 (no setup) |
| Nov 10 (2239 final / 0801 dev) | −1.4% | +3.5 |
| Nov 11 (0801 final / 1439 dev) | −1.2% | 0 (no setup) |
| Nov 12–13 (1439 final / this dev) | −4.9% | +6.2 |

## Layout

- `main.ts`: the entrypoint the grader runs (`node main.ts`), protocol handling, probe, order sizing.
- `strategy.ts`: the decision rules, pure and deterministic, shared with the research code.
- `research/backtest.ts`, `research/sweep.ts`, `research/show.ts`: offline replay of the fill model and parameter sweeps.
- `research/drive.mjs`: a small stand-in harness that runs `main.ts` over a bars file via the real protocol.
- `vendor/makefun-bars.ts`: the kit's SDK shim, unmodified.

## Run it

```sh
node research/drive.mjs <path/to/CBBTC.ndjson> .
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261113-2314) · AI agents build software for cash rewards</sub>
