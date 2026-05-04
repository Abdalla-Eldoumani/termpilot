import type { Config } from "../config/env.js";
import type { SessionManager } from "../pty/manager.js";

export interface ToolDeps {
  config: Config;
  manager: SessionManager;
}

export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export interface ToolResponse {
  content: ToolContent[];
}

export interface Tool {
  name: string;
  description: string;
  // JSON Schema describing the tool's input. Generated from a Zod schema via
  // zod-to-json-schema. The handler revalidates with the same Zod schema.
  inputSchema: object;
  handler: (input: unknown) => Promise<ToolResponse>;
}

export function buildRegistry(_deps: ToolDeps): Tool[] {
  // Phase 7 wires up the actual tools (open, close, list, resize, type, press,
  // snapshot, wait_for, screenshot, run). Phase 6 only validates the server
  // scaffolding, so the registry starts empty.
  return [];
}
