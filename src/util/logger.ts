import type { LogLevel } from "../types.js";

const LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

let currentLevel: LogLevel = "warn";

export function setLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLevel(): LogLevel {
  return currentLevel;
}

function shouldEmit(level: LogLevel): boolean {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(currentLevel);
}

function formatField(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatLine(level: LogLevel, message: string, fields?: Record<string, unknown>): string {
  let line = `[termpilot] ${level} ${message}`;
  if (fields) {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      parts.push(`${key}=${formatField(value)}`);
    }
    if (parts.length > 0) {
      line += ` ${parts.join(" ")}`;
    }
  }
  return line;
}

function emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  if (!shouldEmit(level)) return;
  process.stderr.write(`${formatLine(level, message, fields)}\n`);
}

export function debug(message: string, fields?: Record<string, unknown>): void {
  emit("debug", message, fields);
}

export function info(message: string, fields?: Record<string, unknown>): void {
  emit("info", message, fields);
}

export function warn(message: string, fields?: Record<string, unknown>): void {
  emit("warn", message, fields);
}

export function error(message: string, fields?: Record<string, unknown>): void {
  emit("error", message, fields);
}

type StdoutWrite = typeof process.stdout.write;

let originalStdoutWrite: StdoutWrite | null = null;

function chunkToString(chunk: unknown): string {
  if (typeof chunk === "string") return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString("utf8");
  return String(chunk);
}

// Replaces process.stdout.write with a wrapper that throws on any write whose
// content is not a JSON-RPC frame. MCP stdio transport writes JSON objects
// (each starting with "{"); anything else is stdout pollution that would
// corrupt the protocol and disconnect the client.
export function panicGuard(): void {
  if (originalStdoutWrite !== null) return;
  const original = process.stdout.write.bind(process.stdout) as StdoutWrite;
  originalStdoutWrite = original;

  const wrapped = function (
    this: typeof process.stdout,
    // any: required to forward through process.stdout.write's overloaded signature
    // biome-ignore lint/suspicious/noExplicitAny: see comment above
    ...args: any[]
  ): boolean {
    const chunk = args[0];
    const text = chunkToString(chunk);
    const trimmed = text.trimStart();
    if (!trimmed.startsWith("{")) {
      throw new Error(
        `[termpilot] stdout write blocked: stdout is reserved for MCP JSON-RPC framing. ` +
          `Use src/util/logger.ts for diagnostics. Got: ${JSON.stringify(text.slice(0, 80))}`,
      );
    }
    // biome-ignore lint/suspicious/noExplicitAny: forward the original overload set
    return (original as any).apply(this, args);
  } as StdoutWrite;

  process.stdout.write = wrapped;
}

export function releaseGuard(): void {
  if (originalStdoutWrite === null) return;
  process.stdout.write = originalStdoutWrite;
  originalStdoutWrite = null;
}
