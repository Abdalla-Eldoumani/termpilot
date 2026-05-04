import type { IBufferCell, IBufferLine } from "@xterm/headless";
import { stringify } from "yaml";

import type { Session } from "../pty/session.js";
import type { Cursor, ExitInfo, Line, RgbTriple, Snapshot, StyleRun } from "../types.js";

export interface SnapshotOptions {
  includeStyles?: boolean;
  maxLines?: number;
  sinceLast?: boolean;
  defaultPromptRegex: string;
}

const DEFAULT_MAX_LINES = 200;

export function buildSnapshot(session: Session, options: SnapshotOptions): Snapshot {
  const buffer = session.buffer.active;
  const totalLines = buffer.length;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;

  const promptPattern = compilePromptRegex(session.promptRegex ?? options.defaultPromptRegex);

  const newLines = session.linesSinceMark;
  const sinceLast = options.sinceLast === true;
  const startLine = sinceLast
    ? Math.max(0, totalLines - newLines)
    : Math.max(0, totalLines - maxLines);

  const lines: Line[] = [];
  const promptRefs: string[] = [];

  for (let i = startLine; i < totalLines; i++) {
    const xtermLine = buffer.getLine(i);
    if (!xtermLine) continue;
    const text = xtermLine.translateToString(true);
    const ref = `l${i - startLine + 1}`;
    const line: Line = { ref, text };
    if (promptPattern.test(text)) {
      line.prompt = true;
      promptRefs.push(ref);
    }
    if (options.includeStyles) {
      const styles = extractStyleRuns(xtermLine, session.cols);
      if (styles.length > 0) line.styles = styles;
    }
    lines.push(line);
  }

  const cursor: Cursor = {
    row: buffer.cursorY,
    col: buffer.cursorX,
    visible: true,
  };

  const exit: ExitInfo | null = session.exit;
  const status = exit ? "exited" : "running";

  // Capturing the count must happen before markSnapshot resets it.
  session.markSnapshot();

  return {
    session: {
      id: session.id,
      command: session.command,
      args: [...session.args],
      pid: session.pid,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      status,
      startedAt: session.startedAt,
    },
    exit,
    cursor,
    buffer: lines,
    prompts: promptRefs,
    sinceLast: {
      newLines,
      lastInputAt: session.lastInputAt,
    },
  };
}

function compilePromptRegex(source: string): RegExp {
  try {
    return new RegExp(source);
  } catch {
    // Fall back to the default prompt regex when the user supplies a malformed
    // pattern. The default catches POSIX shells.
    return /[$%>#]\s*$/;
  }
}

interface CellState {
  fgValue: number;
  fgMode: number;
  bgValue: number;
  bgMode: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
}

function readCellState(cell: IBufferCell): CellState {
  return {
    fgValue: cell.getFgColor(),
    fgMode: cell.getFgColorMode(),
    bgValue: cell.getBgColor(),
    bgMode: cell.getBgColorMode(),
    bold: cell.isBold() !== 0,
    italic: cell.isItalic() !== 0,
    underline: cell.isUnderline() !== 0,
    inverse: cell.isInverse() !== 0,
  };
}

function isPlainCell(state: CellState): boolean {
  return (
    state.fgMode === 0 &&
    state.bgMode === 0 &&
    !state.bold &&
    !state.italic &&
    !state.underline &&
    !state.inverse
  );
}

function statesEqual(a: CellState, b: CellState): boolean {
  return (
    a.fgValue === b.fgValue &&
    a.fgMode === b.fgMode &&
    a.bgValue === b.bgValue &&
    a.bgMode === b.bgMode &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.inverse === b.inverse
  );
}

function colorFor(value: number, mode: number): number | RgbTriple | undefined {
  if (mode === 0) return undefined;
  if (mode === 3) {
    const r = (value >> 16) & 0xff;
    const g = (value >> 8) & 0xff;
    const b = value & 0xff;
    return [r, g, b];
  }
  return value;
}

function stateToRun(state: CellState, start: number, length: number): StyleRun {
  const run: StyleRun = { start, length };
  const fg = colorFor(state.fgValue, state.fgMode);
  if (fg !== undefined) run.fg = fg;
  const bg = colorFor(state.bgValue, state.bgMode);
  if (bg !== undefined) run.bg = bg;
  if (state.bold) run.bold = true;
  if (state.italic) run.italic = true;
  if (state.underline) run.underline = true;
  if (state.inverse) run.reverse = true;
  return run;
}

function extractStyleRuns(line: IBufferLine, cols: number): StyleRun[] {
  const cell = line.getCell(0);
  if (!cell) return [];

  const runs: StyleRun[] = [];
  let current: { state: CellState; start: number } | null = null;

  for (let x = 0; x < cols; x++) {
    if (!line.getCell(x, cell)) continue;
    const state = readCellState(cell);

    if (isPlainCell(state)) {
      if (current) {
        runs.push(stateToRun(current.state, current.start, x - current.start));
        current = null;
      }
      continue;
    }

    if (current && statesEqual(current.state, state)) continue;

    if (current) {
      runs.push(stateToRun(current.state, current.start, x - current.start));
    }
    current = { state, start: x };
  }

  if (current) {
    runs.push(stateToRun(current.state, current.start, cols - current.start));
  }

  return runs;
}

interface WireLine {
  ref: string;
  text: string;
  prompt?: boolean;
  styles?: StyleRun[];
}

interface WireSnapshot {
  session: {
    id: string;
    command: string;
    args: string[];
    pid: number;
    cwd: string;
    cols: number;
    rows: number;
    status: "running" | "exited";
    started_at: string;
  };
  exit: ExitInfo | null;
  cursor: Cursor;
  buffer: WireLine[];
  prompts: string[];
  since_last: {
    new_lines: number;
    last_input_at: string | null;
  };
}

function snapshotToWire(snapshot: Snapshot): WireSnapshot {
  return {
    session: {
      id: snapshot.session.id,
      command: snapshot.session.command,
      args: [...snapshot.session.args],
      pid: snapshot.session.pid,
      cwd: snapshot.session.cwd,
      cols: snapshot.session.cols,
      rows: snapshot.session.rows,
      status: snapshot.session.status,
      started_at: snapshot.session.startedAt,
    },
    exit: snapshot.exit,
    cursor: snapshot.cursor,
    buffer: snapshot.buffer.map((line) => {
      const wire: WireLine = { ref: line.ref, text: line.text };
      if (line.prompt) wire.prompt = true;
      if (line.styles) wire.styles = line.styles;
      return wire;
    }),
    prompts: snapshot.prompts,
    since_last: {
      new_lines: snapshot.sinceLast.newLines,
      last_input_at: snapshot.sinceLast.lastInputAt,
    },
  };
}

export function serializeSnapshotYaml(snapshot: Snapshot): string {
  return stringify(snapshotToWire(snapshot), { lineWidth: 0 });
}
