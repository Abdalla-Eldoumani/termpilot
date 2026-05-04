import type { Config } from "../config/env.js";
import { checkSessionCap } from "../security/limits.js";
import { decide } from "../security/policy.js";
import * as logger from "../util/logger.js";
import { Session } from "./session.js";

export interface OpenOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  name?: string;
  promptRegex?: string;
}

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const IDLE_CHECK_MS = 60_000;
const KILL_ESCALATION_MS = 2_000;

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: Config,
    private readonly newId: () => string,
  ) {}

  start(): void {
    if (this.idleTimer !== null) return;
    this.idleTimer = setInterval(() => this.closeIdleSessions(), IDLE_CHECK_MS);
    this.idleTimer.unref();
  }

  stop(): void {
    if (this.idleTimer === null) return;
    clearInterval(this.idleTimer);
    this.idleTimer = null;
  }

  async open(opts: OpenOptions): Promise<Session> {
    const cwd = opts.cwd ?? this.config.workspaceRoot;
    const args = opts.args ?? [];
    const cols = opts.cols ?? DEFAULT_COLS;
    const rows = opts.rows ?? DEFAULT_ROWS;
    const userEnv = opts.env ?? {};

    const decision = await decide({
      command: opts.command,
      args,
      cwd,
      config: this.config,
    });
    if (!decision.allowed) {
      throw new Error(decision.reason);
    }

    const cap = checkSessionCap(this.sessions.size, this.config.maxSessions);
    if (!cap.ok) {
      throw new Error(cap.reason);
    }

    const id = opts.name ?? this.newId();
    if (this.sessions.has(id)) {
      throw new Error(`session id already in use: ${id}`);
    }

    const env = this.mergeEnv(userEnv);

    const session = new Session({
      id,
      command: opts.command,
      args,
      cwd,
      env,
      cols,
      rows,
      maxOutputBytes: this.config.maxOutputBytes,
      promptRegex: opts.promptRegex,
    });

    this.sessions.set(id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  list(): Session[] {
    return [...this.sessions.values()];
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  size(): number {
    return this.sessions.size;
  }

  async close(id: string, signal?: string): Promise<Session | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    await this.killWithEscalation(session, signal);
    this.sessions.delete(id);
    return session;
  }

  async closeAll(): Promise<void> {
    const ids = [...this.sessions.keys()];
    await Promise.all(ids.map((id) => this.close(id)));
  }

  private async killWithEscalation(session: Session, signal: string | undefined): Promise<void> {
    if (session.hasExited) return;
    return new Promise((resolve) => {
      let resolved = false;
      const escalation = setTimeout(() => {
        if (!session.hasExited) {
          try {
            session.kill("SIGKILL");
          } catch {
            // Ignore: process may have died between checks
          }
        }
      }, KILL_ESCALATION_MS);
      escalation.unref();

      session.onExit(() => {
        if (resolved) return;
        resolved = true;
        clearTimeout(escalation);
        resolve();
      });

      try {
        session.kill(signal ?? "SIGTERM");
      } catch (err) {
        clearTimeout(escalation);
        const message = err instanceof Error ? err.message : String(err);
        logger.warn("session kill failed", { id: session.id, message });
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }
    });
  }

  private closeIdleSessions(): void {
    const now = Date.now();
    const timeoutMs = this.config.sessionTimeoutMs;
    for (const [id, session] of this.sessions) {
      const lastInput = session.lastInputAt;
      if (lastInput === null) continue;
      const lastTime = Date.parse(lastInput);
      if (lastTime + timeoutMs < now) {
        logger.info("closing idle session", { id, lastInput });
        void this.close(id);
      }
    }
  }

  private mergeEnv(userEnv: Record<string, string>): Record<string, string> {
    const allowlist = new Set(this.config.envAllowlist);
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (allowlist.has(key) && value !== undefined) {
        filtered[key] = value;
      }
    }
    return { ...filtered, ...userEnv };
  }
}
