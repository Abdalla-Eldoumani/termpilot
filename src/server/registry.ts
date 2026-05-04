import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { Config } from "../config/env.js";
import type { SessionManager } from "../pty/manager.js";
import { makeCloseTool } from "./tools/close.js";
import { makeListTool } from "./tools/list.js";
import { makeOpenTool } from "./tools/open.js";
import { makePressTool } from "./tools/press.js";
import { makeResizeTool } from "./tools/resize.js";
import { makeRunTool } from "./tools/run.js";
import { makeScreenshotTool } from "./tools/screenshot.js";
import { makeSnapshotTool } from "./tools/snapshot.js";
import { makeTypeTool } from "./tools/type.js";
import { makeWaitForTool } from "./tools/wait_for.js";

export interface ToolDeps {
  config: Config;
  manager: SessionManager;
}

export type ToolResponse = CallToolResult;

export interface Tool {
  name: string;
  description: string;
  // JSON Schema describing the tool's input. Generated from a Zod schema via
  // zod-to-json-schema. The handler revalidates with the same Zod schema.
  inputSchema: object;
  handler: (input: unknown) => Promise<ToolResponse>;
}

export function buildRegistry(deps: ToolDeps): Tool[] {
  return [
    makeOpenTool(deps),
    makeCloseTool(deps),
    makeListTool(deps),
    makeResizeTool(deps),
    makeTypeTool(deps),
    makePressTool(deps),
    makeSnapshotTool(deps),
    makeWaitForTool(deps),
    makeScreenshotTool(deps),
    makeRunTool(deps),
  ];
}
