import { afterEach, describe, expect, it } from "vitest";

import { isWindows, setupTools, type ToolBundle, textOf } from "./helpers.js";

describe.skipIf(isWindows)("terminal_run", () => {
  let tools: ToolBundle | undefined;

  afterEach(async () => {
    if (tools) {
      await tools.cleanup();
      tools = undefined;
    }
  });

  it("runs echo and reports exit code 0 with hello in the buffer", async () => {
    tools = setupTools({ TERMPILOT_POLICY: "unrestricted" });
    const response = await tools.run.handler({
      command: "echo",
      args: ["hello"],
      timeout_ms: 5000,
    });
    const yaml = textOf(response);
    expect(yaml).toContain("status: exited");
    expect(yaml).toMatch(/code:\s*0/);
    expect(yaml).toContain("hello");
  });
});
