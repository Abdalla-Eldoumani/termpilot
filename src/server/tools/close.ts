import { z } from "zod";

import type { Tool, ToolDeps } from "../registry.js";
import { jsonSchemaFor, snapshotYaml, textResponse } from "./helpers.js";

const InputSchema = z.object({
  session_id: z.string(),
  signal: z.enum(["SIGTERM", "SIGKILL", "SIGINT", "SIGHUP"]).optional(),
});

export function makeCloseTool(deps: ToolDeps): Tool {
  return {
    name: "terminal_close",
    description:
      "Terminate a session. Sends SIGTERM by default and escalates to SIGKILL after two seconds if the process is still alive. Returns the final snapshot with exit info.",
    inputSchema: jsonSchemaFor(InputSchema),
    handler: async (input) => {
      const parsed = InputSchema.parse(input);
      const session = deps.manager.get(parsed.session_id);
      if (!session) {
        throw new Error(`session not found: ${parsed.session_id}`);
      }
      await deps.manager.close(parsed.session_id, parsed.signal);
      return textResponse(snapshotYaml(session, deps.config));
    },
  };
}
