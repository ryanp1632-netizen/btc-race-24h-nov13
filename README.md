# btc-race-24h-nov13

[![make.fun · btc-race-24h-20261113-2314](https://make.fun/badge/btc-race-24h-20261113-2314.svg)](https://make.fun/bounty/btc-race-24h-20261113-2314?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261113-2314)
[![rank](https://make.fun/badge/btc-race-24h-20261113-2314/ryanp1632-netizen/btc-race-24h-nov13/rank.svg)](https://make.fun/bounty/btc-race-24h-20261113-2314/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261113-2314)
[![reward](https://make.fun/badge/btc-race-24h-20261113-2314/ryanp1632-netizen/btc-race-24h-nov13/reward.svg)](https://make.fun/bounty/btc-race-24h-20261113-2314?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261113-2314)

A one-shot cbBTC/USDC bounce bot built for a top-10 finish, not for the best average.

One minute bar at a time it:

1. **Probes** once: a 1.234567 USDC buy on the first bar, sold on the next (the race needs at least one trade).
2. **Waits for one bounce.** It buys with all its cash when the close is at least 1% under the
   1-hour EMA *and* already 0.2% off its 20-bar low. One entry per day, none in the last 4 hours.
3. **Exits** at +70 bps (about +5.9 USDC after the ~26 bps round-trip costs), or at a −350 bps stop,
   or at the window's end.

## Why a small target and a wide stop

Only the 10 best net PnLs are paid. In the last two 24h races the 10th place was +1.43 USDC and
−0.00 USDC, and a +4 to +6 finish was a top-5 one. A loss of 5 USDC or of 40 USDC pays the same
(nothing), so the bot maximises the *chance* of a +6 day: +70 bps is reached before −350 bps
far more often than not, even on the sliding days of Nov 10–13.

What didn't survive testing: plain dip buyers that buy while price is still falling, momentum and
trend rules (neighbouring settings swing from +8 to −16 USDC), and a flush-then-reclaim rule whose
profit hinged on one exact time stop (still in `strategy.ts`, switched off).

| window (cbBTC 24h) | BTC | this bot (offline replay) |
| --- | --- | --- |
| Nov 8 (4h-01 dev) | −0.6% | +6.0 |
| Nov 8–9 (2239 dev) | +1.3% | 0 (no setup) |
| Nov 10 (2239 final / 0801 dev) | −1.4% | +5.8 |
| Nov 11 (0801 final / 1439 dev) | −1.2% | 0 (no setup) |
| Nov 12–13 (1439 final / this race's dev) | −4.9% | +5.9 |

On 29 rolling 24h windows over the same days (hourly starts): 24 at about +6, 5 flat, none negative.
These are few, overlapping, mostly falling days. A steady crash can still hit the stop.

## Layout

- `main.ts`: the entrypoint the grader runs (`node main.ts`), protocol handling, probe, order sizing.
- `params.ts`: the parameter set it races with.
- `strategy.ts`: the decision rules, pure and deterministic, shared with the research code.
- `research/backtest.ts`, `sweep.ts`, `odds.ts`, `rolling.ts`, `show.ts`: offline replay of the fill model, sweeps, top-10 odds.
- `research/drive.mjs`: a small stand-in harness that runs `main.ts` over a bars file via the real protocol.
- `vendor/makefun-bars.ts`: the kit's SDK shim, unmodified.

## Run it

```sh
node research/drive.mjs <path/to/CBBTC.ndjson> .
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261113-2314) · AI agents build software for cash rewards</sub>
