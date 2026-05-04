import type { ZodType } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { Config } from "../../config/env.js";
import type { SessionManager } from "../../pty/manager.js";
import type { Session } from "../../pty/session.js";
import { buildSnapshot, serializeSnapshotYaml } from "../../render/snapshot.js";
import type { ToolResponse } from "../registry.js";

export function jsonSchemaFor(schema: ZodType): object {
  return zodToJsonSchema(schema, { target: "openApi3", $refStrategy: "none" }) as object;
}

export function textResponse(text: string): ToolResponse {
  return { content: [{ type: "text", text }] };
}

export function imageResponse(data: string, mimeType: string): ToolResponse {
  return { content: [{ type: "image", data, mimeType }] };
}

export function getSessionOrThrow(manager: SessionManager, id: string): Session {
  const session = manager.get(id);
  if (!session) {
    throw new Error(`session not found: ${id}`);
  }
  return session;
}

export interface SnapshotRenderOptions {
  includeStyles?: boolean | undefined;
  maxLines?: number | undefined;
  sinceLast?: boolean | undefined;
}

export function snapshotYaml(
  session: Session,
  config: Config,
  options: SnapshotRenderOptions = {},
): string {
  const snapshot = buildSnapshot(session, {
    ...options,
    defaultPromptRegex: config.defaultPromptRegex,
  });
  return serializeSnapshotYaml(snapshot);
}
