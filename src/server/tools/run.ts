import { z } from "zod";

import { PredicateSchema } from "../../predicates/matchers.js";
import type { Tool, ToolDeps } from "../registry.js";
import { jsonSchemaFor, textResponse } from "./helpers.js";
import { waitForPredicate } from "./wait_for.js";

const InputSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
  input: z.string().optional(),
  wait_for: PredicateSchema.optional(),
  timeout_ms: z.number().int().positive().optional(),
});

const DEFAULT_TIMEOUT_MS = 60_000;

export function makeRunTool(deps: ToolDeps): Tool {
  return {
    name: "terminal_run",
    description:
      "Open a session, optionally type input, wait for a predicate, then close. Default predicate is exit; default timeout is 60 seconds. Use this for fire-and-forget commands; for interactive multi-step flows use terminal_open with the granular tools instead.",
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
      });
      try {
        if (parsed.input !== undefined && parsed.input !== "") {
          session.write(`${parsed.input}\r`);
        }
        const predicate = parsed.wait_for ?? { type: "exit" };
        const timeoutMs = parsed.timeout_ms ?? DEFAULT_TIMEOUT_MS;
        const yaml = await waitForPredicate(session, predicate, timeoutMs, deps.config);
        return textResponse(yaml);
      } finally {
        await deps.manager.close(session.id);
      }
    },
  };
}
