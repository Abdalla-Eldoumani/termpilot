import { z } from "zod";

import type { Predicate, SessionState, Snapshot } from "../types.js";

export const PredicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), match: z.string() }),
    z.object({
      type: z.literal("regex"),
      pattern: z.string(),
      flags: z.string().optional(),
    }),
    z.object({ type: z.literal("prompt") }),
    z.object({ type: z.literal("idle"), ms: z.number().int().positive() }),
    z.object({ type: z.literal("exit") }),
    z.object({ type: z.literal("any_of"), predicates: z.array(PredicateSchema) }),
    z.object({ type: z.literal("all_of"), predicates: z.array(PredicateSchema) }),
  ]),
);

function bufferText(snapshot: Snapshot): string {
  return snapshot.buffer.map((line) => line.text).join("\n");
}

function compileRegex(pattern: string, flags: string | undefined): RegExp {
  try {
    return new RegExp(pattern, flags);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid regex predicate: ${message}`);
  }
}

function evaluatePrompt(snapshot: Snapshot, state: SessionState): boolean {
  if (snapshot.prompts.length === 0) return false;
  // The "after lastInputAt" rule: a prompt only counts if data has arrived
  // since the last input, so the next prompt is the result of the new command,
  // not the one already on screen at the moment we typed.
  if (state.lastInputAt === null) return true;
  if (state.lastDataAt === null) return false;
  return Date.parse(state.lastDataAt) > Date.parse(state.lastInputAt);
}

function evaluateIdle(predicate: { ms: number }, state: SessionState, now: number): boolean {
  if (state.lastDataAt === null) return true;
  return now - Date.parse(state.lastDataAt) >= predicate.ms;
}

export function evaluate(
  snapshot: Snapshot,
  predicate: Predicate,
  state: SessionState,
  now: number = Date.now(),
): boolean {
  switch (predicate.type) {
    case "text":
      return bufferText(snapshot).includes(predicate.match);
    case "regex": {
      const regex = compileRegex(predicate.pattern, predicate.flags);
      return regex.test(bufferText(snapshot));
    }
    case "prompt":
      return evaluatePrompt(snapshot, state);
    case "idle":
      return evaluateIdle(predicate, state, now);
    case "exit":
      return state.exit !== null;
    case "any_of":
      return predicate.predicates.some((p) => evaluate(snapshot, p, state, now));
    case "all_of":
      return predicate.predicates.every((p) => evaluate(snapshot, p, state, now));
    default: {
      const exhaustive: never = predicate;
      throw new Error(`unhandled predicate: ${JSON.stringify(exhaustive)}`);
    }
  }
}
