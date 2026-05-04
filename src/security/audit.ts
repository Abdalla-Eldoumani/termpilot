import { createWriteStream, type WriteStream } from "node:fs";

import type { AuditEntry } from "../types.js";
import * as logger from "../util/logger.js";

let stream: WriteStream | null = null;
let currentPath: string | null = null;

export function configureAudit(path: string | undefined): void {
  const target = path ?? null;
  if (target === currentPath) return;

  if (stream) {
    stream.end();
    stream = null;
  }
  currentPath = target;
  if (!target) return;

  try {
    const opened = createWriteStream(target, { flags: "a", encoding: "utf8" });
    opened.on("error", (err) => {
      logger.warn("audit log write failed", { path: target, message: err.message });
    });
    stream = opened;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("failed to open audit log", { path: target, message });
    stream = null;
    currentPath = null;
  }
}

function serialize(entry: AuditEntry): string {
  return JSON.stringify({
    ts: entry.ts,
    session_id: entry.sessionId,
    command: entry.command,
    args: entry.args,
    cwd: entry.cwd,
    policy: entry.policy,
    decision: entry.decision,
    reason: entry.reason,
    exit_code: entry.exitCode,
    duration_ms: entry.durationMs,
  });
}

export function auditLog(entry: AuditEntry): void {
  if (!stream) return;
  stream.write(`${serialize(entry)}\n`);
}

export function closeAudit(): Promise<void> {
  return new Promise((resolve) => {
    if (!stream) {
      currentPath = null;
      resolve();
      return;
    }
    const closing = stream;
    stream = null;
    currentPath = null;
    closing.end(() => resolve());
  });
}
