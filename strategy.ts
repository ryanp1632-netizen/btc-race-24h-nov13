// Decision logic for the cbBTC/USDC bar bot. Kept free of protocol and I/O so the same code
// runs in main.ts (the graded bot) and in research/backtest.ts (offline sweeps over past windows).
//
// Everything here runs on float64 + - * / and comparisons only, so a given sequence of bars
// always yields the same decisions (the grader runs every entry twice and compares action logs).

export interface Params {
  /** Slow EMA span in bars: the reference level for "cheap" and "trending". */
  emaSpan: number;
  /** Bars to wait before the first entry (lets the EMA settle; there is no warm-up feed). */
  warmBars: number;

  /** Dip entry: close at least this many bps under the EMA (0 turns dip entries off). */
  dipBps: number;
  /** ...and the close back at least this many bps above the lowest low of the last bounceLook bars. */
  bounceBps: number;
  bounceLook: number;
  /** Skip dip entries while the EMA itself fell more than this many bps over the last slopeLook bars (0 = no filter). */
  maxFallBps: number;
  slopeLook: number;

  /**
   * Reclaim entry (0 turns it off): some low of the last flushLook bars sat at least flushBps under
   * the slow EMA, and now the close is back at least reclaimBps above a fast EMA (fastSpan) while
   * still under the slow EMA: buying the first leg of a recovery after a capitulation, not the knife.
   */
  flushBps: number;
  flushLook: number;
  fastSpan: number;
  reclaimBps: number;

  /** Momentum entry: close up at least momBps over the close momLook bars back (0 turns it off)... */
  momBps: number;
  momLook: number;
  /** ...with the close at least this many bps above the EMA (trend filter; -100000 = no filter)... */
  momAboveBps: number;
  /** ...and the EMA itself rising at least this many bps over slopeLook bars (-100000 = no filter). */
  momSlopeBps: number;

  /** Exits, in bps from the average entry price. */
  tpBps: number;
  slBps: number;
  /** Trailing stop: once the close is trailArmBps above entry, exit on a give-back of trailBps from the peak close (0 = off). */
  trailArmBps: number;
  trailBps: number;
  /** Exit when the close gets back to EMA + this many bps (OFF = 100000 turns it off). */
  emaExitBps: number;
  /** Time stop in bars. */
  maxHold: number;

  /** Fraction of equity per entry (0..1). */
  size: number;
  /** At most this many entries in the window. */
  maxEntries: number;
  /** Bars to wait after an exit before the next entry. */
  cooldown: number;
  /** Stop opening trades once realised losses reach this many bps of starting equity (0 = never). */
  haltLossBps: number;
}

export const DEFAULTS: Params = {
  emaSpan: 300,
  warmBars: 180,
  dipBps: 90,
  bounceBps: 15,
  bounceLook: 20,
  maxFallBps: 0,
  slopeLook: 120,
  flushBps: 0,
  flushLook: 120,
  fastSpan: 30,
  reclaimBps: 10,
  momBps: 0,
  momLook: 15,
  momAboveBps: -100000,
  momSlopeBps: -100000,
  tpBps: 75,
  slBps: 200,
  trailArmBps: 0,
  trailBps: 0,
  emaExitBps: 100000,
  maxHold: 480,
  size: 1,
  maxEntries: 4,
  cooldown: 30,
  haltLossBps: 0,
};

export type Decision = { kind: 'none' } | { kind: 'buy'; fraction: number } | { kind: 'sell'; reason: string };

/** One bar as the strategy sees it: prices as plain numbers (USDC per BTC). */
export interface PxBar {
  o: number;
  h: number;
  l: number;
  c: number;
}

export class Strategy {
  readonly p: Params;
  private n = 0;
  private ema = 0;
  private emaHist: number[] = [];
  private lows: number[] = [];
  private closes: number[] = [];
  private fast = 0;
  private depths: number[] = [];
  private entries = 0;
  private lastExitBar = -1_000_000;
  private realised = 0; // in bps of starting equity, signed
  private holding = false;
  private entryPx = 0;
  private entryBar = 0;
  private peak = 0;
  private stake = 0;

  constructor(p: Params) {
    this.p = p;
  }

  /** Feed a closed bar; get what to do at the next open. `holding` is the account's truth. */
  onBar(b: PxBar, holding: boolean): Decision {
    const p = this.p;
    this.n++;
    if (this.n === 1) this.ema = b.c;
    else this.ema += (2 / (p.emaSpan + 1)) * (b.c - this.ema);
    if (this.n === 1) this.fast = b.c;
    else this.fast += (2 / (p.fastSpan + 1)) * (b.c - this.fast);
    // how far under the slow EMA this bar's low reached, kept for flushLook bars
    this.depths.push((1 - b.l / this.ema) * 10000);
    if (this.depths.length > p.flushLook) this.depths.shift();
    this.emaHist.push(this.ema);
    this.lows.push(b.l);
    this.closes.push(b.c);
    if (this.lows.length > p.bounceLook) this.lows.shift();
    if (this.emaHist.length > p.slopeLook + 1) this.emaHist.shift();
    if (this.closes.length > p.momLook + 1) this.closes.shift();

    // The account may disagree with what we asked for (a rejected order): trust it.
    if (this.holding && !holding) this.closeBook(b.c);
    if (!this.holding && holding) this.openBook(b.c, 1);
    if (this.holding) {
      if (b.c > this.peak) this.peak = b.c;
      const r = (b.c / this.entryPx - 1) * 10000;
      const held = this.n - this.entryBar;
      if (r >= p.tpBps) return { kind: 'sell', reason: 'tp' };
      if (r <= -p.slBps) return { kind: 'sell', reason: 'sl' };
      if (p.trailBps > 0 && (this.peak / this.entryPx - 1) * 10000 >= p.trailArmBps && (1 - b.c / this.peak) * 10000 >= p.trailBps)
        return { kind: 'sell', reason: 'trail' };
      if ((b.c / this.ema - 1) * 10000 >= p.emaExitBps) return { kind: 'sell', reason: 'ema' };
      if (held >= p.maxHold) return { kind: 'sell', reason: 'time' };
      return { kind: 'none' };
    }

    if (this.n < p.warmBars || this.entries >= p.maxEntries) return { kind: 'none' };
    if (this.n - this.lastExitBar < p.cooldown) return { kind: 'none' };
    if (p.haltLossBps > 0 && -this.realised >= p.haltLossBps) return { kind: 'none' };

    if (p.dipBps > 0) {
      const under = (1 - b.c / this.ema) * 10000;
      let low = Infinity;
      for (const x of this.lows) if (x < low) low = x;
      const bounce = (b.c / low - 1) * 10000;
      const fall = this.emaHist.length > p.slopeLook ? (1 - this.ema / this.emaHist[0]) * 10000 : 0;
      if (under >= p.dipBps && bounce >= p.bounceBps && (p.maxFallBps <= 0 || fall <= p.maxFallBps)) {
        return { kind: 'buy', fraction: p.size };
      }
    }
    if (p.flushBps > 0) {
      let deepest = -Infinity;
      for (const d of this.depths) if (d > deepest) deepest = d;
      const overFast = (b.c / this.fast - 1) * 10000;
      if (deepest >= p.flushBps && overFast >= p.reclaimBps && b.c < this.ema) return { kind: 'buy', fraction: p.size };
    }
    if (p.momBps > 0 && this.closes.length > p.momLook) {
      const up = (b.c / this.closes[0] - 1) * 10000;
      const above = (b.c / this.ema - 1) * 10000;
      const rise = this.emaHist.length > p.slopeLook ? (this.ema / this.emaHist[0] - 1) * 10000 : 0;
      if (up >= p.momBps && above >= p.momAboveBps && rise >= p.momSlopeBps) return { kind: 'buy', fraction: p.size };
    }
    return { kind: 'none' };
  }

  /** Tell the strategy what actually filled (average price incl. costs), so exits measure from it. */
  filledBuy(px: number, fraction: number): void {
    this.openBook(px, fraction);
    this.entries++;
  }

  filledSell(px: number): void {
    this.closeBook(px);
  }

  private openBook(px: number, fraction: number): void {
    this.holding = true;
    this.entryPx = px;
    this.entryBar = this.n;
    this.peak = px;
    this.stake = fraction;
  }

  private closeBook(px: number): void {
    if (!this.holding) return;
    this.realised += (px / this.entryPx - 1) * 10000 * this.stake;
    this.holding = false;
    this.lastExitBar = this.n;
  }
}
