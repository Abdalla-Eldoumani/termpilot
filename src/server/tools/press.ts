import { z } from "zod";

import { keyToBytes } from "../../util/keys.js";
import type { Tool, ToolDeps } from "../registry.js";
import { getSessionOrThrow, jsonSchemaFor, textResponse } from "./helpers.js";

const InputSchema = z.object({
  session_id: z.string(),
  keys: z.array(z.string()).min(1),
});

export function makePressTool(deps: ToolDeps): Tool {
  return {
    name: "terminal_press",
    description:
      'Send named keys (Enter, Tab, Esc, arrows, F1-F12, Ctrl-X, Alt-X, Shift-Tab) to a session. Provide the names in an array; they are sent in order with no delay. Example: { keys: ["Ctrl-C"] }.',
    inputSchema: jsonSchemaFor(InputSchema),
    handler: async (input) => {
      const parsed = InputSchema.parse(input);
      const session = getSessionOrThrow(deps.manager, parsed.session_id);
      let total = 0;
      for (const name of parsed.keys) {
        const bytes = keyToBytes(name);
        session.write(bytes);
        total += bytes.length;
      }
      return textResponse(`pressed: ${parsed.keys.length} keys (${total} bytes)`);
    },
  };
}
