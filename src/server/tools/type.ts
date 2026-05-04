import { z } from "zod";

import type { Tool, ToolDeps } from "../registry.js";
import { getSessionOrThrow, jsonSchemaFor, textResponse } from "./helpers.js";

const InputSchema = z.object({
  session_id: z.string(),
  text: z.string(),
  submit: z.boolean().optional(),
});

export function makeTypeTool(deps: ToolDeps): Tool {
  return {
    name: "terminal_type",
    description:
      "Send literal text to a session. Use this when you would type characters at the terminal. Set submit: true to append a carriage return at the end (the equivalent of pressing Enter). Does not return a snapshot; call terminal_snapshot to observe the result.",
    inputSchema: jsonSchemaFor(InputSchema),
    handler: async (input) => {
      const parsed = InputSchema.parse(input);
      const session = getSessionOrThrow(deps.manager, parsed.session_id);
      if (parsed.text === "" && parsed.submit !== true) {
        return textResponse("typed: 0 bytes");
      }
      const payload = parsed.submit === true ? `${parsed.text}\r` : parsed.text;
      session.write(payload);
      return textResponse(`typed: ${payload.length} bytes`);
    },
  };
}
