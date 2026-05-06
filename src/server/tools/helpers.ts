import type { ZodType } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { Config } from "../../config/env.js";
import type { SessionManager } from "../../pty/manager.js";
import type { Session } from "../../pty/session.js";
import { buildSnapshot, serializeSnapshotYaml } from "../../render/snapshot.js";
import type { ToolResponse } from "../registry.js";

export function jsonSchemaFor(schema: ZodType): object {
  const out = zodToJsonSchema(schema, { target: "openApi3", $refStrategy: "none" }) as object;
  return normalizeForDraft202012(out);
}

// zod-to-json-schema's openApi3 target emits draft-04 boolean exclusiveMinimum/
// exclusiveMaximum (e.g. {minimum: 0, exclusiveMinimum: true}). Anthropic's tool
// input_schema validator requires draft-2020-12, where exclusiveMinimum/Maximum
// are numbers. Convert in place. Also strip any leftover $schema field.
function normalizeForDraft202012<T>(node: T): T {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    for (const item of node) normalizeForDraft202012(item);
    return node;
  }
  const obj = node as Record<string, unknown>;
  delete obj.$schema;
  if (obj.exclusiveMinimum === true && typeof obj.minimum === "number") {
    obj.exclusiveMinimum = obj.minimum;
    delete obj.minimum;
  } else if (obj.exclusiveMinimum === false) {
    delete obj.exclusiveMinimum;
  }
  if (obj.exclusiveMaximum === true && typeof obj.maximum === "number") {
    obj.exclusiveMaximum = obj.maximum;
    delete obj.maximum;
  } else if (obj.exclusiveMaximum === false) {
    delete obj.exclusiveMaximum;
  }
  for (const key of Object.keys(obj)) normalizeForDraft202012(obj[key]);
  return node;
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
