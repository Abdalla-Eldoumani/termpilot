import { z } from "zod";

import type { Tool, ToolDeps } from "../registry.js";
import { jsonSchemaFor, snapshotYaml, textResponse } from "./helpers.js";

const InputSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
  name: z.string().optional(),
  prompt_regex: z.string().optional(),
});

export function makeOpenTool(deps: ToolDeps): Tool {
  return {
    name: "terminal_open",
    description:
      "Spawn a new terminal session. Use this to start an interactive program (shell, REPL, debugger) when you will send multiple inputs and observe results between them. Returns the session id and an initial snapshot.",
    inputSchema: jsonSchemaFor(InputSchema),
    handler: async (input) => {
      const parsed = InputSchema.parse(input);
      const session = await deps.manager.open({
        command: parsed.command,
        args: parsed.args,
        cwd: parsed.cwd,
        env: parsed.env,
        cols: parsed.cols,
        rows: parsed.rows,
        name: parsed.name,
        promptRegex: parsed.prompt_regex,
      });
      return textResponse(snapshotYaml(session, deps.config));
    },
  };
}
