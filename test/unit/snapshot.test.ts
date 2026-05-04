import { describe, expect, it } from "vitest";

import { Session } from "../../src/pty/session.js";
import { buildSnapshot, serializeSnapshotYaml } from "../../src/render/snapshot.js";
import type { ExitInfo } from "../../src/types.js";

const isWindows = process.platform === "win32";

function fullEnv(): Record<string, string> {
  // Pass the entire host env through so platform-specific vars (TMPDIR,
  // DYLD_LIBRARY_PATH, etc.) that node-pty's posix_spawnp may need on macOS
  // aren't filtered out.
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function spawnAndWait(args: string[]): Promise<Session> {
  const session = new Session({
    id: `snap_${args.join("_").slice(0, 12)}`,
    command: "bash",
    args: ["-c", ...args],
    cwd: process.cwd(),
    env: fullEnv(),
    cols: 80,
    rows: 24,
    maxOutputBytes: 1024 * 1024,
  });
  return new Promise((resolve) => {
    session.onExit((_info: ExitInfo) => resolve(session));
  });
}

describe.skipIf(isWindows)("buildSnapshot", () => {
  it("captures output lines and exit info", async () => {
    const session = await spawnAndWait(["echo line1; echo line2"]);

    const snapshot = buildSnapshot(session, { defaultPromptRegex: "[$%>#]\\s*$" });

    expect(snapshot.session.command).toBe("bash");
    expect(snapshot.session.status).toBe("exited");
    expect(snapshot.exit?.code).toBe(0);

    const text = snapshot.buffer.map((line) => line.text).join("\n");
    expect(text).toContain("line1");
    expect(text).toContain("line2");
  });

  it("assigns sequential refs to visible lines", async () => {
    const session = await spawnAndWait(["echo a; echo b; echo c"]);

    const snapshot = buildSnapshot(session, { defaultPromptRegex: "[$%>#]\\s*$" });

    const refs = snapshot.buffer.map((line) => line.ref);
    expect(refs[0]).toBe("l1");
    expect(refs.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < refs.length; i++) {
      expect(refs[i]).toBe(`l${i + 1}`);
    }
  });

  it("detects prompt-shaped lines via the default regex", async () => {
    const session = await spawnAndWait(["printf 'output\\nuser@host $ '"]);

    const snapshot = buildSnapshot(session, { defaultPromptRegex: "[$%>#]\\s*$" });
    expect(snapshot.prompts.length).toBeGreaterThan(0);
    const flagged = snapshot.buffer.filter((line) => line.prompt === true);
    expect(flagged.length).toBe(snapshot.prompts.length);
  });

  it("serializes to YAML in the documented shape", async () => {
    const session = await spawnAndWait(["echo hello"]);

    const snapshot = buildSnapshot(session, { defaultPromptRegex: "[$%>#]\\s*$" });
    const yaml = serializeSnapshotYaml(snapshot);

    expect(yaml).toContain("session:");
    expect(yaml).toContain("status: exited");
    expect(yaml).toContain("started_at:");
    expect(yaml).toContain("since_last:");
    expect(yaml).toContain("new_lines:");
    expect(yaml).toContain("hello");
  });

  it("resets newLines after markSnapshot advances the cursor", async () => {
    const session = await spawnAndWait(["echo first; echo second"]);

    const first = buildSnapshot(session, { defaultPromptRegex: "[$%>#]\\s*$" });
    expect(first.sinceLast.newLines).toBeGreaterThan(0);

    // buildSnapshot is pure: only markSnapshot advances the since-last cursor.
    // Two consecutive buildSnapshot calls return the same newLines count.
    const beforeMark = buildSnapshot(session, { defaultPromptRegex: "[$%>#]\\s*$" });
    expect(beforeMark.sinceLast.newLines).toBe(first.sinceLast.newLines);

    session.markSnapshot();
    const afterMark = buildSnapshot(session, { defaultPromptRegex: "[$%>#]\\s*$" });
    expect(afterMark.sinceLast.newLines).toBe(0);
  });
});
