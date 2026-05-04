import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeAudit, configureAudit } from "../../src/security/audit.js";
import { isWindows, setupTools, type ToolBundle } from "./helpers.js";

interface AuditLine {
  ts: string;
  session_id: string;
  command: string;
  args: string[];
  cwd: string;
  policy: string;
  decision: "allowed" | "refused";
  reason: string | null;
  exit_code: number | null;
  duration_ms: number | null;
}

function readAuditLines(path: string): AuditLine[] {
  const text = readFileSync(path, "utf8");
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as AuditLine);
}

async function flushAudit(): Promise<void> {
  await closeAudit();
}

describe("audit log", () => {
  let tempDir: string;
  let auditPath: string;
  let tools: ToolBundle | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "termpilot-audit-"));
    auditPath = join(tempDir, "audit.jsonl");
    configureAudit(auditPath);
  });

  afterEach(async () => {
    if (tools) {
      await tools.cleanup();
      tools = undefined;
    }
    await flushAudit();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes a refused entry when policy rejects the command", async () => {
    tools = setupTools({ TERMPILOT_POLICY: "warn" });
    await expect(tools.open.handler({ command: "rm", args: ["-rf", "/"] })).rejects.toThrow(
      /policy: refused/,
    );

    await flushAudit();
    const lines = readAuditLines(auditPath);
    expect(lines.length).toBe(1);
    const entry = lines[0];
    if (!entry) throw new Error("expected one audit line");
    expect(entry.decision).toBe("refused");
    expect(entry.command).toBe("rm");
    expect(entry.args).toEqual(["-rf", "/"]);
    expect(entry.reason).toMatch(/policy: refused/);
    expect(entry.exit_code).toBeNull();
    expect(entry.duration_ms).toBeNull();
    expect(typeof entry.ts).toBe("string");
    expect(Number.isFinite(Date.parse(entry.ts))).toBe(true);
  });

  it.skipIf(isWindows)(
    "writes an allowed entry on session exit with exit_code and duration_ms",
    async () => {
      tools = setupTools({ TERMPILOT_POLICY: "unrestricted" });
      const response = await tools.run.handler({
        command: "sh",
        args: ["-c", "exit 0"],
        timeout_ms: 5000,
      });
      expect(response.content).toBeDefined();

      await flushAudit();
      const lines = readAuditLines(auditPath);
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const allowed = lines.find((line) => line.decision === "allowed");
      expect(allowed).toBeDefined();
      expect(allowed?.command).toBe("sh");
      expect(allowed?.exit_code).toBe(0);
      expect(typeof allowed?.duration_ms).toBe("number");
      expect((allowed?.duration_ms ?? -1) >= 0).toBe(true);
    },
  );

  it("emits well-formed JSONL with all documented fields", async () => {
    tools = setupTools({ TERMPILOT_POLICY: "warn" });
    await expect(
      tools.open.handler({ command: "shutdown", args: ["-h", "now"] }),
    ).rejects.toThrow();
    await expect(tools.open.handler({ command: "ls", cwd: tmpdir() })).rejects.toThrow();

    await flushAudit();
    const lines = readAuditLines(auditPath);
    expect(lines.length).toBe(2);
    for (const entry of lines) {
      expect(typeof entry.ts).toBe("string");
      expect(typeof entry.session_id).toBe("string");
      expect(typeof entry.command).toBe("string");
      expect(Array.isArray(entry.args)).toBe(true);
      expect(typeof entry.cwd).toBe("string");
      expect(typeof entry.policy).toBe("string");
      expect(["allowed", "refused"]).toContain(entry.decision);
      expect(["string", "object"]).toContain(typeof entry.reason);
      expect(["number", "object"]).toContain(typeof entry.exit_code);
      expect(["number", "object"]).toContain(typeof entry.duration_ms);
    }
  });
});
