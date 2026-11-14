// The parameter set the bot races with (see strategy.ts for what each one means).
// Kept apart from main.ts so research scripts can import it without starting the protocol loop.
import { DEFAULTS, type Params } from './strategy.ts';

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
