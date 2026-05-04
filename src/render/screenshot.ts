import type { Canvas } from "canvas";

import type { Session } from "../pty/session.js";
import * as logger from "../util/logger.js";

const DEFAULT_FONT_SIZE = 14;
const DEFAULT_FONT_FAMILY = "Menlo, Consolas, monospace";

export type Theme = "dark" | "light";

export interface ScreenshotOptions {
  fontSize?: number;
  fontFamily?: string;
  theme?: Theme;
}

interface ThemeColors {
  background: string;
  foreground: string;
}

const THEMES: Record<Theme, ThemeColors> = {
  dark: { background: "#1e1e1e", foreground: "#d4d4d4" },
  light: { background: "#ffffff", foreground: "#000000" },
};

type CreateCanvasFn = (width: number, height: number) => Canvas;

let createCanvas: CreateCanvasFn | null = null;
let canvasError: Error | null = null;

try {
  const mod = await import("canvas");
  createCanvas = mod.createCanvas as CreateCanvasFn;
} catch (err) {
  canvasError = err instanceof Error ? err : new Error(String(err));
  logger.warn("canvas module unavailable; screenshots disabled", {
    message: canvasError.message,
  });
}

export function isScreenshotAvailable(): boolean {
  return createCanvas !== null;
}

export function screenshotUnavailableReason(): string | null {
  if (createCanvas !== null) return null;
  return canvasError?.message ?? "canvas module not loaded";
}

export function renderScreenshot(session: Session, opts: ScreenshotOptions = {}): Buffer {
  if (createCanvas === null) {
    throw new Error(`screenshots unavailable: ${canvasError?.message ?? "canvas not loaded"}`);
  }

  const fontSize = opts.fontSize ?? DEFAULT_FONT_SIZE;
  const fontFamily = opts.fontFamily ?? DEFAULT_FONT_FAMILY;
  const theme = THEMES[opts.theme ?? "dark"];

  const cellWidth = Math.ceil(fontSize * 0.6);
  const cellHeight = Math.ceil(fontSize * 1.4);

  const buffer = session.buffer.active;
  const cols = session.cols;
  const rows = session.rows;

  const totalLines = buffer.length;
  const startLine = Math.max(0, totalLines - rows);

  const canvas = createCanvas(cols * cellWidth, rows * cellHeight);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textBaseline = "top";

  for (let row = 0; row < rows; row++) {
    const lineIndex = startLine + row;
    const xtermLine = buffer.getLine(lineIndex);
    if (!xtermLine) continue;

    const cell = xtermLine.getCell(0);
    if (!cell) continue;

    for (let col = 0; col < cols; col++) {
      if (!xtermLine.getCell(col, cell)) continue;

      const fg = resolveColor(cell.getFgColor(), cell.getFgColorMode(), theme.foreground);
      const bg = resolveColor(cell.getBgColor(), cell.getBgColorMode(), theme.background);
      const reverse = cell.isInverse() !== 0;
      const bold = cell.isBold() !== 0;
      const italic = cell.isItalic() !== 0;
      const underline = cell.isUnderline() !== 0;

      const finalFg = reverse ? bg : fg;
      const finalBg = reverse ? fg : bg;

      if (finalBg !== theme.background) {
        ctx.fillStyle = finalBg;
        ctx.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
      }

      const ch = cell.getChars();
      if (ch && ch !== " " && ch !== "") {
        ctx.font = buildFontSpec(fontSize, fontFamily, bold, italic);
        ctx.fillStyle = finalFg;
        ctx.fillText(ch, col * cellWidth, row * cellHeight);
      }

      if (underline) {
        ctx.fillStyle = finalFg;
        ctx.fillRect(col * cellWidth, row * cellHeight + cellHeight - 2, cellWidth, 1);
      }
    }
  }

  return canvas.toBuffer("image/png");
}

function buildFontSpec(size: number, family: string, bold: boolean, italic: boolean): string {
  const parts: string[] = [];
  if (italic) parts.push("italic");
  if (bold) parts.push("bold");
  parts.push(`${size}px`);
  parts.push(family);
  return parts.join(" ");
}

function resolveColor(value: number, mode: number, fallback: string): string {
  if (mode === 0) return fallback;
  if (mode === 3) {
    return rgbHex((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
  }
  const palette = palette256();
  const entry = value >= 0 && value < palette.length ? palette[value] : undefined;
  return entry ?? fallback;
}

function hex(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function rgbHex(r: number, g: number, b: number): string {
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

let cachedPalette: string[] | null = null;

function palette256(): string[] {
  if (cachedPalette !== null) return cachedPalette;
  const colors: string[] = [];

  const standard16 = [
    "#000000",
    "#cd0000",
    "#00cd00",
    "#cdcd00",
    "#0000ee",
    "#cd00cd",
    "#00cdcd",
    "#e5e5e5",
    "#7f7f7f",
    "#ff0000",
    "#00ff00",
    "#ffff00",
    "#5c5cff",
    "#ff00ff",
    "#00ffff",
    "#ffffff",
  ];
  colors.push(...standard16);

  const steps = [0, 95, 135, 175, 215, 255];
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        // biome-ignore lint/style/noNonNullAssertion: indices are bounded by the loop
        colors.push(rgbHex(steps[r]!, steps[g]!, steps[b]!));
      }
    }
  }

  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10;
    colors.push(rgbHex(v, v, v));
  }

  cachedPalette = colors;
  return colors;
}
