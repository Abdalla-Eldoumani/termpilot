import { z } from "zod";

import type { Tool, ToolDeps } from "../registry.js";
import { getSessionOrThrow, jsonSchemaFor, snapshotYaml, textResponse } from "./helpers.js";

const InputSchema = z.object({
  session_id: z.string(),
  include_styles: z.boolean().optional(),
  max_lines: z.number().int().positive().optional(),
  since_last: z.boolean().optional(),
});

export function makeSnapshotTool(deps: ToolDeps): Tool {
  return {
    name: "terminal_snapshot",
    description:
      "Capture the current screen state as YAML with stable line refs. Use this after every state-changing call (type, press, resize) to observe what the terminal looks like. Pass since_last: true to receive only lines added since the last snapshot.",
    inputSchema: jsonSchemaFor(InputSchema),
    handler: async (input) => {
      const parsed = InputSchema.parse(input);
      const session = getSessionOrThrow(deps.manager, parsed.session_id);
      const yaml = snapshotYaml(session, deps.config, {
        includeStyles: parsed.include_styles,
        maxLines: parsed.max_lines,
        sinceLast: parsed.since_last,
      });
      session.markSnapshot();
      return textResponse(yaml);
    },
  };
}
