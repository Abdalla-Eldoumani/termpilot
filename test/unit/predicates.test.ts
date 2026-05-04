import { describe, expect, it } from "vitest";

import { evaluate } from "../../src/predicates/matchers.js";
import type { Line, Predicate, SessionState, Snapshot } from "../../src/types.js";

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  const buffer: Line[] = overrides.buffer ?? [];
  return {
    session: {
      id: "s_test",
      command: "bash",
      args: [],
      pid: 1,
      cwd: "/",
      cols: 80,
      rows: 24,
      status: "running",
      startedAt: "2026-05-04T10:00:00Z",
    },
    exit: null,
    cursor: { row: 0, col: 0, visible: true },
    buffer,
    prompts: [],
    sinceLast: { newLines: 0, lastInputAt: null },
    ...overrides,
  };
}

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    lastInputAt: null,
    lastDataAt: null,
    exit: null,
    ...overrides,
  };
}

const NOW = Date.parse("2026-05-04T10:00:00Z");

describe("evaluate", () => {
  describe("text predicate", () => {
    it("returns true when match is present", () => {
      const snapshot = makeSnapshot({ buffer: [{ ref: "l1", text: "READY" }] });
      const predicate: Predicate = { type: "text", match: "READY" };
      expect(evaluate(snapshot, predicate, makeState(), NOW)).toBe(true);
    });

    it("returns false when match is absent", () => {
      const snapshot = makeSnapshot({ buffer: [{ ref: "l1", text: "WAITING" }] });
      const predicate: Predicate = { type: "text", match: "READY" };
      expect(evaluate(snapshot, predicate, makeState(), NOW)).toBe(false);
    });

    it("matches across line boundaries via the joined buffer", () => {
      const snapshot = makeSnapshot({
        buffer: [
          { ref: "l1", text: "first" },
          { ref: "l2", text: "second" },
        ],
      });
      const predicate: Predicate = { type: "text", match: "first\nsecond" };
      expect(evaluate(snapshot, predicate, makeState(), NOW)).toBe(true);
    });
  });

  describe("regex predicate", () => {
    it("matches a pattern", () => {
      const snapshot = makeSnapshot({ buffer: [{ ref: "l1", text: "error[E0282]" }] });
      const predicate: Predicate = { type: "regex", pattern: "error\\[E\\d+\\]" };
      expect(evaluate(snapshot, predicate, makeState(), NOW)).toBe(true);
    });

    it("respects regex flags", () => {
      const snapshot = makeSnapshot({ buffer: [{ ref: "l1", text: "ERROR" }] });
      const predicate: Predicate = { type: "regex", pattern: "error", flags: "i" };
      expect(evaluate(snapshot, predicate, makeState(), NOW)).toBe(true);
    });

    it("throws on invalid pattern", () => {
      const predicate: Predicate = { type: "regex", pattern: "(unclosed" };
      expect(() => evaluate(makeSnapshot(), predicate, makeState(), NOW)).toThrow(/invalid regex/);
    });
  });

  describe("prompt predicate", () => {
    it("returns false when no prompts on the snapshot", () => {
      expect(evaluate(makeSnapshot(), { type: "prompt" }, makeState(), NOW)).toBe(false);
    });

    it("returns true when prompts exist and no input has been sent yet", () => {
      const snapshot = makeSnapshot({ prompts: ["l1"] });
      expect(evaluate(snapshot, { type: "prompt" }, makeState(), NOW)).toBe(true);
    });

    it("returns false when data has not arrived since the last input", () => {
      const snapshot = makeSnapshot({ prompts: ["l1"] });
      const state = makeState({
        lastInputAt: "2026-05-04T10:00:01Z",
        lastDataAt: "2026-05-04T10:00:00Z",
      });
      expect(evaluate(snapshot, { type: "prompt" }, state, NOW)).toBe(false);
    });

    it("returns true when data arrived after the last input", () => {
      const snapshot = makeSnapshot({ prompts: ["l1"] });
      const state = makeState({
        lastInputAt: "2026-05-04T10:00:00Z",
        lastDataAt: "2026-05-04T10:00:01Z",
      });
      expect(evaluate(snapshot, { type: "prompt" }, state, NOW)).toBe(true);
    });
  });

  describe("idle predicate", () => {
    it("returns true when no data has ever arrived", () => {
      expect(evaluate(makeSnapshot(), { type: "idle", ms: 500 }, makeState(), NOW)).toBe(true);
    });

    it("returns true when data is older than ms", () => {
      const state = makeState({ lastDataAt: "2026-05-04T09:59:55Z" });
      expect(evaluate(makeSnapshot(), { type: "idle", ms: 500 }, state, NOW)).toBe(true);
    });

    it("returns false when data is more recent than ms", () => {
      const state = makeState({ lastDataAt: "2026-05-04T09:59:59.900Z" });
      expect(evaluate(makeSnapshot(), { type: "idle", ms: 500 }, state, NOW)).toBe(false);
    });
  });

  describe("exit predicate", () => {
    it("returns true when state has exit info", () => {
      const state = makeState({ exit: { code: 0, signal: null } });
      expect(evaluate(makeSnapshot(), { type: "exit" }, state, NOW)).toBe(true);
    });

    it("returns false when state has no exit info", () => {
      expect(evaluate(makeSnapshot(), { type: "exit" }, makeState(), NOW)).toBe(false);
    });
  });

  describe("any_of", () => {
    it("returns true if at least one inner predicate matches", () => {
      const snapshot = makeSnapshot({ buffer: [{ ref: "l1", text: "READY" }] });
      const predicate: Predicate = {
        type: "any_of",
        predicates: [
          { type: "text", match: "MISSING" },
          { type: "text", match: "READY" },
        ],
      };
      expect(evaluate(snapshot, predicate, makeState(), NOW)).toBe(true);
    });

    it("returns false when no inner predicate matches", () => {
      const snapshot = makeSnapshot({ buffer: [{ ref: "l1", text: "OTHER" }] });
      const predicate: Predicate = {
        type: "any_of",
        predicates: [
          { type: "text", match: "MISSING" },
          { type: "text", match: "READY" },
        ],
      };
      expect(evaluate(snapshot, predicate, makeState(), NOW)).toBe(false);
    });
  });

  describe("all_of", () => {
    it("returns true when every inner predicate matches", () => {
      const snapshot = makeSnapshot({ buffer: [{ ref: "l1", text: "BUILD READY" }] });
      const predicate: Predicate = {
        type: "all_of",
        predicates: [
          { type: "text", match: "BUILD" },
          { type: "text", match: "READY" },
        ],
      };
      expect(evaluate(snapshot, predicate, makeState(), NOW)).toBe(true);
    });

    it("returns false when one inner predicate fails", () => {
      const snapshot = makeSnapshot({ buffer: [{ ref: "l1", text: "BUILD PENDING" }] });
      const predicate: Predicate = {
        type: "all_of",
        predicates: [
          { type: "text", match: "BUILD" },
          { type: "text", match: "READY" },
        ],
      };
      expect(evaluate(snapshot, predicate, makeState(), NOW)).toBe(false);
    });
  });
});
