import { afterEach, describe, expect, it } from "vitest";

import { isWindows, sessionIdFromYaml, setupTools, type ToolBundle, textOf } from "./helpers.js";

describe.skipIf(isWindows)("terminal_wait_for", () => {
  let tools: ToolBundle | undefined;

  afterEach(async () => {
    if (tools) {
      await tools.cleanup();
      tools = undefined;
    }
  });

  it("returns the snapshot once the text appears", async () => {
    tools = setupTools({ TERMPILOT_POLICY: "unrestricted" });
    const openResponse = await tools.open.handler({
      command: "sh",
      args: ["-c", "sleep 0.2 && echo READY"],
    });
    const sessionId = sessionIdFromYaml(textOf(openResponse));

    const start = Date.now();
    const waitResponse = await tools.waitFor.handler({
      session_id: sessionId,
      predicate: { type: "text", match: "READY" },
      timeout_ms: 1000,
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
    expect(textOf(waitResponse)).toContain("READY");
  });

  it("includes the snapshot in the timeout error", async () => {
    tools = setupTools({ TERMPILOT_POLICY: "unrestricted" });
    const openResponse = await tools.open.handler({
      command: "sh",
      args: ["-c", "sleep 5"],
    });
    const sessionId = sessionIdFromYaml(textOf(openResponse));

    await expect(
      tools.waitFor.handler({
        session_id: sessionId,
        predicate: { type: "text", match: "DONE" },
        timeout_ms: 200,
      }),
    ).rejects.toThrow(/wait_for timeout after 200ms/);
  });
});
