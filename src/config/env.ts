import { z } from "zod";
import type { LogLevel, PolicyMode } from "../types.js";

const POLICY_MODES = [
  "unrestricted",
  "warn",
  "allowlist",
  "denylist",
] as const satisfies readonly PolicyMode[];

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const satisfies readonly LogLevel[];

const TRUTHY = new Set(["true", "1", "yes"]);
const FALSY = new Set(["false", "0", "no"]);

const DEFAULT_ENV_ALLOWLIST = "PATH,HOME,USER,LANG,LC_ALL,TERM,SHELL";
const DEFAULT_PROMPT_REGEX = "[$%>#]\\s*$";
const DEFAULT_MAX_SESSIONS = 16;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const ListSchema = z.string().transform(splitList);

const BoolSchema = z.string().transform((value, ctx) => {
  const lower = value.trim().toLowerCase();
  if (TRUTHY.has(lower)) return true;
  if (FALSY.has(lower)) return false;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `expected one of true/false/1/0/yes/no, got ${JSON.stringify(value)}`,
  });
  return z.NEVER;
});

const PositiveIntSchema = z.string().transform((value, ctx) => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `expected a positive integer, got ${JSON.stringify(value)}`,
    });
    return z.NEVER;
  }
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `expected a positive integer, got ${JSON.stringify(value)}`,
    });
    return z.NEVER;
  }
  return n;
});

const RawConfigSchema = z.object({
  TERMPILOT_WORKSPACE_ROOT: z.string().optional(),
  TERMPILOT_POLICY: z.enum(POLICY_MODES).default("warn"),
  TERMPILOT_ALLOWED_COMMANDS: ListSchema.default(""),
  TERMPILOT_DENIED_COMMANDS: ListSchema.default(""),
  TERMPILOT_MAX_SESSIONS: PositiveIntSchema.default(String(DEFAULT_MAX_SESSIONS)),
  TERMPILOT_MAX_OUTPUT_BYTES: PositiveIntSchema.default(String(DEFAULT_MAX_OUTPUT_BYTES)),
  TERMPILOT_SESSION_TIMEOUT_MS: PositiveIntSchema.default(String(DEFAULT_SESSION_TIMEOUT_MS)),
  TERMPILOT_AUDIT_LOG: z.string().optional(),
  TERMPILOT_LOG_LEVEL: z.enum(LOG_LEVELS).default("warn"),
  TERMPILOT_ALLOW_PRIVILEGED: BoolSchema.default("false"),
  TERMPILOT_ENV_ALLOWLIST: ListSchema.default(DEFAULT_ENV_ALLOWLIST),
  TERMPILOT_DEFAULT_PROMPT_REGEX: z.string().default(DEFAULT_PROMPT_REGEX),
});

export interface Config {
  workspaceRoot: string;
  policy: PolicyMode;
  allowedCommands: string[];
  deniedCommands: string[];
  maxSessions: number;
  maxOutputBytes: number;
  sessionTimeoutMs: number;
  auditLog: string | undefined;
  logLevel: LogLevel;
  allowPrivileged: boolean;
  envAllowlist: string[];
  defaultPromptRegex: string;
}

const TERMPILOT_KEYS = [
  "TERMPILOT_WORKSPACE_ROOT",
  "TERMPILOT_POLICY",
  "TERMPILOT_ALLOWED_COMMANDS",
  "TERMPILOT_DENIED_COMMANDS",
  "TERMPILOT_MAX_SESSIONS",
  "TERMPILOT_MAX_OUTPUT_BYTES",
  "TERMPILOT_SESSION_TIMEOUT_MS",
  "TERMPILOT_AUDIT_LOG",
  "TERMPILOT_LOG_LEVEL",
  "TERMPILOT_ALLOW_PRIVILEGED",
  "TERMPILOT_ENV_ALLOWLIST",
  "TERMPILOT_DEFAULT_PROMPT_REGEX",
] as const;

function selectInputs(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of TERMPILOT_KEYS) {
    const value = env[key];
    if (value !== undefined && value !== "") {
      out[key] = value;
    }
  }
  return out;
}

export function parseConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = RawConfigSchema.safeParse(selectInputs(env));
  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return `  ${path}: ${issue.message}`;
    });
    throw new Error(`invalid termpilot configuration:\n${lines.join("\n")}`);
  }

  const raw = result.data;
  return {
    workspaceRoot: raw.TERMPILOT_WORKSPACE_ROOT ?? process.cwd(),
    policy: raw.TERMPILOT_POLICY,
    allowedCommands: raw.TERMPILOT_ALLOWED_COMMANDS,
    deniedCommands: raw.TERMPILOT_DENIED_COMMANDS,
    maxSessions: raw.TERMPILOT_MAX_SESSIONS,
    maxOutputBytes: raw.TERMPILOT_MAX_OUTPUT_BYTES,
    sessionTimeoutMs: raw.TERMPILOT_SESSION_TIMEOUT_MS,
    auditLog: raw.TERMPILOT_AUDIT_LOG,
    logLevel: raw.TERMPILOT_LOG_LEVEL,
    allowPrivileged: raw.TERMPILOT_ALLOW_PRIVILEGED,
    envAllowlist: raw.TERMPILOT_ENV_ALLOWLIST,
    defaultPromptRegex: raw.TERMPILOT_DEFAULT_PROMPT_REGEX,
  };
}
