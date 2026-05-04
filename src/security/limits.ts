export interface LimitCheck {
  ok: boolean;
  reason: string;
}

export function checkSessionCap(currentCount: number, max: number): LimitCheck {
  if (currentCount >= max) {
    return { ok: false, reason: `max sessions exceeded (${max})` };
  }
  return { ok: true, reason: "" };
}

// xterm-headless takes a scrollback line count, not a byte cap. Map a byte
// budget to an approximate line count using an 80-column heuristic. The cap
// is necessarily approximate; the public docs document the trade-off.
const ASSUMED_COLUMNS = 80;
const MIN_SCROLLBACK_LINES = 100;

export function scrollbackLines(maxBytes: number): number {
  const bytesPerLine = ASSUMED_COLUMNS;
  const lines = Math.floor(maxBytes / bytesPerLine);
  return Math.max(MIN_SCROLLBACK_LINES, lines);
}
