import { z } from "zod";

import type { Tool, ToolDeps } from "../registry.js";
import { getSessionOrThrow, jsonSchemaFor, snapshotYaml, textResponse } from "./helpers.js";

const InputSchema = z.object({
  session_id: z.string(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

export function makeResizeTool(deps: ToolDeps): Tool {
  return {
    name: "terminal_resize",
    description:
      "Change the dimensions of a session's terminal. Sends SIGWINCH to the foreground process. Returns an updated snapshot.",
    inputSchema: jsonSchemaFor(InputSchema),
    handler: async (input) => {
      const parsed = InputSchema.parse(input);
      const session = getSessionOrThrow(deps.manager, parsed.session_id);
      session.resize(parsed.cols, parsed.rows);
      return textResponse(snapshotYaml(session, deps.config));
    },
  };
}
