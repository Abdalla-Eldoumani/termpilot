import type { Config } from "../../src/config/env.js";
import { parseConfig } from "../../src/config/env.js";
import { SessionManager } from "../../src/pty/manager.js";
import { makeCloseTool } from "../../src/server/tools/close.js";
import { makeListTool } from "../../src/server/tools/list.js";
import { makeOpenTool } from "../../src/server/tools/open.js";
import { makePressTool } from "../../src/server/tools/press.js";
import { makeResizeTool } from "../../src/server/tools/resize.js";
import { makeRunTool } from "../../src/server/tools/run.js";
import { makeScreenshotTool } from "../../src/server/tools/screenshot.js";
import { makeSnapshotTool } from "../../src/server/tools/snapshot.js";
import { makeTypeTool } from "../../src/server/tools/type.js";
import { makeWaitForTool } from "../../src/server/tools/wait_for.js";
import { newSessionId } from "../../src/util/ids.js";

export const isWindows = process.platform === "win32";

export interface ToolBundle {
  config: Config;
  manager: SessionManager;
  open: ReturnType<typeof makeOpenTool>;
  close: ReturnType<typeof makeCloseTool>;
  list: ReturnType<typeof makeListTool>;
  resize: ReturnType<typeof makeResizeTool>;
  type: ReturnType<typeof makeTypeTool>;
  press: ReturnType<typeof makePressTool>;
  snapshot: ReturnType<typeof makeSnapshotTool>;
  waitFor: ReturnType<typeof makeWaitForTool>;
  screenshot: ReturnType<typeof makeScreenshotTool>;
  run: ReturnType<typeof makeRunTool>;
  cleanup: () => Promise<void>;
}

export function setupTools(env: Record<string, string> = {}): ToolBundle {
  const config = parseConfig(env);
  const manager = new SessionManager(config, newSessionId);
  const deps = { config, manager };
  return {
    config,
    manager,
    open: makeOpenTool(deps),
    close: makeCloseTool(deps),
    list: makeListTool(deps),
    resize: makeResizeTool(deps),
    type: makeTypeTool(deps),
    press: makePressTool(deps),
    snapshot: makeSnapshotTool(deps),
    waitFor: makeWaitForTool(deps),
    screenshot: makeScreenshotTool(deps),
    run: makeRunTool(deps),
    cleanup: () => manager.closeAll(),
  };
}

export function textOf(response: { content: Array<{ type: string }> }): string {
  const first = response.content[0];
  if (!first || first.type !== "text") {
    throw new Error("expected text content");
  }
  return (first as { type: "text"; text: string }).text;
}

export function imageDataOf(response: { content: Array<{ type: string }> }): string {
  const first = response.content[0];
  if (!first || first.type !== "image") {
    throw new Error("expected image content");
  }
  return (first as { type: "image"; data: string; mimeType: string }).data;
}

export function sessionIdFromYaml(yaml: string): string {
  const match = yaml.match(/^\s*id:\s*(\S+)/m);
  if (!match || !match[1]) {
    throw new Error(`could not parse session id from yaml:\n${yaml}`);
  }
  return match[1];
}
