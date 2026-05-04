export type SessionStatus = "running" | "exited";

export interface SessionMeta {
  id: string;
  command: string;
  args: string[];
  pid: number;
  cwd: string;
  cols: number;
  rows: number;
  status: SessionStatus;
  startedAt: string;
}

export interface ExitInfo {
  code: number;
  signal: string | null;
}

export interface SessionState {
  lastInputAt: string | null;
  lastDataAt: string | null;
  exit: ExitInfo | null;
}

export interface Cursor {
  row: number;
  col: number;
  visible: boolean;
}

export type RgbTriple = readonly [number, number, number];

export interface StyleRun {
  start: number;
  length: number;
  fg?: number | RgbTriple;
  bg?: number | RgbTriple;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  reverse?: boolean;
}

export interface Line {
  ref: string;
  text: string;
  prompt?: boolean;
  styles?: StyleRun[];
}

export interface SinceLast {
  newLines: number;
  lastInputAt: string | null;
}

export interface Snapshot {
  session: SessionMeta;
  exit: ExitInfo | null;
  cursor: Cursor;
  buffer: Line[];
  prompts: string[];
  sinceLast: SinceLast;
}

export type Predicate =
  | { type: "text"; match: string }
  | { type: "regex"; pattern: string; flags?: string }
  | { type: "prompt" }
  | { type: "idle"; ms: number }
  | { type: "exit" }
  | { type: "any_of"; predicates: Predicate[] }
  | { type: "all_of"; predicates: Predicate[] };

export type PolicyMode = "unrestricted" | "warn" | "allowlist" | "denylist";

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
}

export type AuditDecision = "allowed" | "refused";

export interface AuditEntry {
  ts: string;
  sessionId: string;
  command: string;
  args: string[];
  cwd: string;
  policy: PolicyMode;
  decision: AuditDecision;
  reason: string | null;
  exitCode: number | null;
  durationMs: number | null;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
