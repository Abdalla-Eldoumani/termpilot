import { describe, expect, it } from "vitest";

import { Session } from "../../src/pty/session.js";
import type { ExitInfo } from "../../src/types.js";

const isWindows = process.platform === "win32";

function readBuffer(session: Session): string {
  const buffer = session.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i);
    if (line) {
      lines.push(line.translateToString(true));
    }
  }
  return lines.join("\n");
}

function minimalEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ["PATH", "HOME", "USER", "LANG", "LC_ALL", "TERM", "SHELL"]) {
    const value = process.env[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

describe.skipIf(isWindows)("Session", () => {
  it("captures echo output and exit code from bash", async () => {
    const session = new Session({
      id: "test_echo",
      command: "bash",
      args: ["-c", "echo hello"],
      cwd: process.cwd(),
      env: minimalEnv(),
      cols: 80,
      rows: 24,
      maxOutputBytes: 1024 * 1024,
    });

    const exit = await new Promise<ExitInfo>((resolve) => {
      session.onExit(resolve);
    });

    expect(exit.code).toBe(0);
    expect(readBuffer(session)).toContain("hello");
  });

  it("rejects writes after exit", async () => {
    const session = new Session({
      id: "test_exit_write",
      command: "bash",
      args: ["-c", "true"],
      cwd: process.cwd(),
      env: minimalEnv(),
      cols: 80,
      rows: 24,
      maxOutputBytes: 1024 * 1024,
    });

    await new Promise<ExitInfo>((resolve) => {
      session.onExit(resolve);
    });

    expect(() => session.write("anything\n")).toThrow(/exited; cannot write/);
  });
});
