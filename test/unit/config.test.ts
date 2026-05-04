import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/config/env.js";

describe("parseConfig", () => {
  describe("defaults", () => {
    it("applies every default when env is empty", () => {
      const cfg = parseConfig({});
      expect(cfg.policy).toBe("warn");
      expect(cfg.allowedCommands).toEqual([]);
      expect(cfg.deniedCommands).toEqual([]);
      expect(cfg.maxSessions).toBe(16);
      expect(cfg.maxOutputBytes).toBe(1024 * 1024);
      expect(cfg.sessionTimeoutMs).toBe(30 * 60 * 1000);
      expect(cfg.auditLog).toBeUndefined();
      expect(cfg.logLevel).toBe("warn");
      expect(cfg.allowPrivileged).toBe(false);
      expect(cfg.envAllowlist).toEqual(["PATH", "HOME", "USER", "LANG", "LC_ALL", "TERM", "SHELL"]);
      expect(cfg.defaultPromptRegex).toBe("[$%>#]\\s*$");
      expect(cfg.workspaceRoot).toBe(process.cwd());
    });

    it("treats empty-string env values as missing", () => {
      const cfg = parseConfig({ TERMPILOT_POLICY: "", TERMPILOT_MAX_SESSIONS: "" });
      expect(cfg.policy).toBe("warn");
      expect(cfg.maxSessions).toBe(16);
    });
  });

  describe("policy", () => {
    it.each(["unrestricted", "warn", "allowlist", "denylist"] as const)("accepts %s", (mode) => {
      expect(parseConfig({ TERMPILOT_POLICY: mode }).policy).toBe(mode);
    });

    it("rejects an unknown mode", () => {
      expect(() => parseConfig({ TERMPILOT_POLICY: "loose" })).toThrow(
        /invalid termpilot configuration/,
      );
    });
  });

  describe("lists", () => {
    it("splits comma-separated values and trims whitespace", () => {
      const cfg = parseConfig({ TERMPILOT_ALLOWED_COMMANDS: "ls, cat ,grep" });
      expect(cfg.allowedCommands).toEqual(["ls", "cat", "grep"]);
    });

    it("filters empty entries", () => {
      const cfg = parseConfig({ TERMPILOT_ENV_ALLOWLIST: "PATH,,HOME" });
      expect(cfg.envAllowlist).toEqual(["PATH", "HOME"]);
    });

    it("treats whitespace-only entries as empty", () => {
      const cfg = parseConfig({ TERMPILOT_DENIED_COMMANDS: "rm,   ,shutdown" });
      expect(cfg.deniedCommands).toEqual(["rm", "shutdown"]);
    });
  });

  describe("booleans", () => {
    it.each<[string, boolean]>([
      ["true", true],
      ["TRUE", true],
      ["1", true],
      ["yes", true],
      ["YES", true],
      ["false", false],
      ["FALSE", false],
      ["0", false],
      ["no", false],
    ])("parses %s as %s", (input, expected) => {
      expect(parseConfig({ TERMPILOT_ALLOW_PRIVILEGED: input }).allowPrivileged).toBe(expected);
    });

    it("rejects unparseable values", () => {
      expect(() => parseConfig({ TERMPILOT_ALLOW_PRIVILEGED: "maybe" })).toThrow(
        /expected one of true\/false\/1\/0\/yes\/no/,
      );
    });
  });

  describe("positive integers", () => {
    it("accepts a valid integer", () => {
      expect(parseConfig({ TERMPILOT_MAX_SESSIONS: "32" }).maxSessions).toBe(32);
    });

    it.each(["0", "-1", "1.5", "abc", "  ", "1e9"])("rejects %s", (input) => {
      expect(() => parseConfig({ TERMPILOT_MAX_SESSIONS: input })).toThrow(
        /expected a positive integer/,
      );
    });
  });

  describe("log level", () => {
    it.each(["debug", "info", "warn", "error"] as const)("accepts %s", (level) => {
      expect(parseConfig({ TERMPILOT_LOG_LEVEL: level }).logLevel).toBe(level);
    });

    it("rejects an unknown level", () => {
      expect(() => parseConfig({ TERMPILOT_LOG_LEVEL: "trace" })).toThrow(
        /invalid termpilot configuration/,
      );
    });
  });

  describe("optional and path-like values", () => {
    it("audit log is undefined by default", () => {
      expect(parseConfig({}).auditLog).toBeUndefined();
    });

    it("audit log uses the env value when set", () => {
      const cfg = parseConfig({ TERMPILOT_AUDIT_LOG: "/tmp/audit.jsonl" });
      expect(cfg.auditLog).toBe("/tmp/audit.jsonl");
    });

    it("workspace root uses the env value when set", () => {
      const cfg = parseConfig({ TERMPILOT_WORKSPACE_ROOT: "/Users/me/proj" });
      expect(cfg.workspaceRoot).toBe("/Users/me/proj");
    });

    it("default prompt regex is overridable", () => {
      const cfg = parseConfig({ TERMPILOT_DEFAULT_PROMPT_REGEX: "^>>>\\s*$" });
      expect(cfg.defaultPromptRegex).toBe("^>>>\\s*$");
    });
  });

  describe("error aggregation", () => {
    it("reports every invalid field in a single error", () => {
      let caught: Error | null = null;
      try {
        parseConfig({
          TERMPILOT_POLICY: "loose",
          TERMPILOT_MAX_SESSIONS: "-1",
          TERMPILOT_ALLOW_PRIVILEGED: "maybe",
        });
      } catch (err) {
        caught = err as Error;
      }
      expect(caught).not.toBeNull();
      const message = (caught as Error).message;
      expect(message).toContain("TERMPILOT_POLICY");
      expect(message).toContain("TERMPILOT_MAX_SESSIONS");
      expect(message).toContain("TERMPILOT_ALLOW_PRIVILEGED");
    });
  });
});
