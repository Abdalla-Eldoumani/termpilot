import { afterEach, describe, expect, it } from "vitest";

import { isScreenshotAvailable } from "../../src/render/screenshot.js";
import {
  imageDataOf,
  isWindows,
  sessionIdFromYaml,
  setupTools,
  type ToolBundle,
  textOf,
} from "./helpers.js";

const skip = isWindows || !isScreenshotAvailable();

describe.skipIf(skip)("terminal_screenshot", () => {
  let tools: ToolBundle | undefined;

  afterEach(async () => {
    if (tools) {
      await tools.cleanup();
      tools = undefined;
    }
  });

  it("returns valid PNG bytes after coloured output", async () => {
    tools = setupTools({ TERMPILOT_POLICY: "unrestricted" });
    const openResponse = await tools.open.handler({
      command: "sh",
      args: ["-c", "printf '\\033[31mhello\\033[0m\\n'; sleep 0.5"],
    });
    const sessionId = sessionIdFromYaml(textOf(openResponse));

    await tools.waitFor.handler({
      session_id: sessionId,
      predicate: { type: "text", match: "hello" },
      timeout_ms: 2000,
    });

    const screenshot = await tools.screenshot.handler({ session_id: sessionId });
    const base64 = imageDataOf(screenshot);
    const bytes = Buffer.from(base64, "base64");

    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(bytes.length).toBeGreaterThan(8);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
    expect(bytes[4]).toBe(0x0d);
    expect(bytes[5]).toBe(0x0a);
    expect(bytes[6]).toBe(0x1a);
    expect(bytes[7]).toBe(0x0a);
  });
});
