import { afterEach, describe, expect, it } from "vitest";

import { isWindows, sessionIdFromYaml, setupTools, type ToolBundle, textOf } from "./helpers.js";

describe.skipIf(isWindows)("terminal tool flow", () => {
  let tools: ToolBundle | undefined;

  afterEach(async () => {
    if (tools) {
      await tools.cleanup();
      tools = undefined;
    }
  });

  it("open, type echo, wait for prompt, snapshot, close", async () => {
    tools = setupTools({ TERMPILOT_POLICY: "unrestricted" });
    const openResponse = await tools.open.handler({
      command: "bash",
      args: ["--norc", "-i"],
    });
    const sessionId = sessionIdFromYaml(textOf(openResponse));

    await tools.type.handler({
      session_id: sessionId,
      text: "echo hello",
      submit: true,
    });

    await tools.waitFor.handler({
      session_id: sessionId,
      predicate: { type: "text", match: "hello" },
      timeout_ms: 5000,
    });

    const snapshotResponse = await tools.snapshot.handler({ session_id: sessionId });
    expect(textOf(snapshotResponse)).toContain("hello");

    const closeResponse = await tools.close.handler({ session_id: sessionId });
    expect(textOf(closeResponse)).toContain("status: exited");
  });
});
