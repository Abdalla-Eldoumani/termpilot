import { stringify } from "yaml";
import { z } from "zod";

import type { Tool, ToolDeps } from "../registry.js";
import { jsonSchemaFor, textResponse } from "./helpers.js";

const InputSchema = z.object({}).strict();

interface SessionRow {
  id: string;
  command: string;
  args: string[];
  pid: number;
  cwd: string;
  cols: number;
  rows: number;
  status: "running" | "exited";
  started_at: string;
  exit: { code: number; signal: string | null } | null;
}

export function makeListTool(deps: ToolDeps): Tool {
  return {
    name: "terminal_list",
    description:
      "List active and recently-exited sessions. Returns a YAML array of session metadata (no buffer contents). Use this to discover existing session ids.",
    inputSchema: jsonSchemaFor(InputSchema),
    handler: async (input) => {
      InputSchema.parse(input);
      const sessions = deps.manager.list();
      const rows: SessionRow[] = sessions.map((session) => ({
        id: session.id,
        command: session.command,
        args: [...session.args],
        pid: session.pid,
        cwd: session.cwd,
        cols: session.cols,
        rows: session.rows,
        status: session.exit ? "exited" : "running",
        started_at: session.startedAt,
        exit: session.exit,
      }));
      return textResponse(stringify({ sessions: rows }, { lineWidth: 0 }));
    },
  };
}
