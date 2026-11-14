// The parameter set the bot races with (see strategy.ts for what each one means).
// Kept apart from main.ts so research scripts can import it without starting the protocol loop.
//
// v2: one high-probability bounce trade per day. Only the top 10 of the race are paid, so what
// counts is the chance of finishing above the 10th place (+1.4 and -0.0 USDC in the last two
// races), not the average. A small target (+70 bps) against a wide stop (-350 bps) is reached far
// more often than not, and one hit at full size is about +5.9 USDC after costs.
// v1 (flush-then-reclaim with a 4h time exit) is still in strategy.ts: its result hinged on the
// exact 240-bar exit, so it is off here (flushBps 0).
import { DEFAULTS, type Params } from './strategy.ts';

export const PARAMS: Params = {
  ...DEFAULTS,
  // entry: a fast 1% drop under the 1-hour EMA that has already bounced 0.2% off its 20-bar low
  emaSpan: 60,
  warmBars: 90,
  dipBps: 100,
  bounceBps: 20,
  bounceLook: 20,
  maxFallBps: 0,
  flushBps: 0,
  momBps: 0,
  // exit: +70 bps take-profit, -350 bps stop, else held to the end of the window
  tpBps: 70,
  slBps: 350,
  trailArmBps: 0,
  trailBps: 0,
  emaExitBps: 100000,
  maxHold: 1440,
  // risk: one full-size trade a day, none in the last 4 hours
  size: 1,
  maxEntries: 1,
  lastEntryBar: 1200,
  cooldown: 10,
  haltLossBps: 1,
};
