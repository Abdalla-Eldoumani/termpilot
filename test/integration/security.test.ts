import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { setupTools, type ToolBundle } from "./helpers.js";

describe("terminal_open security gates", () => {
  let tools: ToolBundle | undefined;

  afterEach(async () => {
    if (tools) {
      await tools.cleanup();
      tools = undefined;
    }
  });

  it("refuses sudo regardless of policy mode", async () => {
    tools = setupTools({ TERMPILOT_POLICY: "unrestricted" });
    await expect(tools.open.handler({ command: "sudo", args: ["ls"] })).rejects.toThrow(
      /policy: refused.*privileged command/,
    );
  });

  it("refuses rm -rf / under the warn policy", async () => {
    tools = setupTools({ TERMPILOT_POLICY: "warn" });
    await expect(tools.open.handler({ command: "rm", args: ["-rf", "/"] })).rejects.toThrow(
      /policy: refused/,
    );
  });

  it("refuses cwd outside workspace root", async () => {
    tools = setupTools({ TERMPILOT_POLICY: "unrestricted" });
    await expect(tools.open.handler({ command: "ls", cwd: tmpdir() })).rejects.toThrow(
      /outside workspace/,
    );
  });
});
