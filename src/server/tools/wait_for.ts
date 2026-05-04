import { z } from "zod";

import type { Config } from "../../config/env.js";
import { evaluate, PredicateSchema } from "../../predicates/matchers.js";
import type { Session } from "../../pty/session.js";
import { buildSnapshot, serializeSnapshotYaml } from "../../render/snapshot.js";
import type { Predicate, SessionState } from "../../types.js";
import type { Tool, ToolDeps } from "../registry.js";
import { getSessionOrThrow, jsonSchemaFor, textResponse } from "./helpers.js";

const InputSchema = z.object({
  session_id: z.string(),
  predicate: PredicateSchema,
  timeout_ms: z.number().int().positive().optional(),
});

const DEFAULT_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 50;

export function makeWaitForTool(deps: ToolDeps): Tool {
  return {
    name: "terminal_wait_for",
    description:
      "Block until a predicate matches the session state. Predicates: text/regex match in the buffer, prompt detection, idle (no new data for N ms), exit, or any_of/all_of compositions. Returns the snapshot at the moment the predicate fires; throws on timeout with the snapshot at timeout in the error.",
    inputSchema: jsonSchemaFor(InputSchema),
    handler: async (input) => {
      const parsed = InputSchema.parse(input);
      const session = getSessionOrThrow(deps.manager, parsed.session_id);
      const timeoutMs = parsed.timeout_ms ?? DEFAULT_TIMEOUT_MS;
      const yaml = await waitForPredicate(session, parsed.predicate, timeoutMs, deps.config);
      return textResponse(yaml);
    },
  };
}

function readState(session: Session): SessionState {
  return {
    lastInputAt: session.lastInputAt,
    lastDataAt: session.lastDataAt,
    exit: session.exit,
  };
}

export function waitForPredicate(
  session: Session,
  predicate: Predicate,
  timeoutMs: number,
  config: Config,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let settled = false;

    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      action();
    };

    const tick = (): void => {
      if (settled) return;
      const snapshot = buildSnapshot(session, { defaultPromptRegex: config.defaultPromptRegex });
      const state = readState(session);
      try {
        if (evaluate(snapshot, predicate, state)) {
          finish(() => resolve(serializeSnapshotYaml(snapshot)));
          return;
        }
      } catch (err) {
        finish(() => reject(err));
        return;
      }
      if (Date.now() - startTime >= timeoutMs) {
        const yaml = serializeSnapshotYaml(snapshot);
        finish(() => reject(new Error(`wait_for timeout after ${timeoutMs}ms\n\n${yaml}`)));
      }
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    interval.unref();

    session.onData(() => {
      tick();
    });
    session.onExit(() => {
      tick();
    });

    tick();
  });
}
