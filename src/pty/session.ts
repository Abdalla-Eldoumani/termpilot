import { Terminal } from "@xterm/headless";
import { type IPty, spawn } from "node-pty";

import { scrollbackLines } from "../security/limits.js";
import type { ExitInfo } from "../types.js";

export interface SessionOptions {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
  maxOutputBytes: number;
  promptRegex?: string | undefined;
}

export type ExitListener = (info: ExitInfo) => void;
export type DataListener = (data: string) => void;

export class Session {
  readonly id: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly cols: number;
  readonly rows: number;
  readonly startedAt: string;
  readonly promptRegex: string | undefined;

  private readonly ptyProcess: IPty;
  private readonly terminal: Terminal;
  private exitInfo: ExitInfo | null = null;
  private lastInputAtTime: Date | null = null;
  private snapshotMark = 0;
  private bytesEmitted = 0;
  private readonly exitListeners: ExitListener[] = [];
  private readonly dataListeners: DataListener[] = [];

  constructor(opts: SessionOptions) {
    this.id = opts.id;
    this.command = opts.command;
    this.args = [...opts.args];
    this.cwd = opts.cwd;
    this.cols = opts.cols;
    this.rows = opts.rows;
    this.startedAt = new Date().toISOString();
    this.promptRegex = opts.promptRegex;

    this.terminal = new Terminal({
      cols: opts.cols,
      rows: opts.rows,
      scrollback: scrollbackLines(opts.maxOutputBytes),
      allowProposedApi: true,
    });

    this.ptyProcess = spawn(opts.command, [...opts.args], {
      name: "xterm-256color",
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env: opts.env,
    });

    this.ptyProcess.onData((data) => {
      this.bytesEmitted += data.length;
      this.terminal.write(data);
      for (const listener of this.dataListeners) {
        listener(data);
      }
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      this.exitInfo = {
        code: exitCode,
        signal: signal !== undefined ? String(signal) : null,
      };
      for (const listener of this.exitListeners) {
        listener(this.exitInfo);
      }
    });
  }

  get pid(): number {
    return this.ptyProcess.pid;
  }

  get exit(): ExitInfo | null {
    return this.exitInfo;
  }

  get hasExited(): boolean {
    return this.exitInfo !== null;
  }

  get lastInputAt(): string | null {
    return this.lastInputAtTime ? this.lastInputAtTime.toISOString() : null;
  }

  get bytesSinceMark(): number {
    return this.bytesEmitted - this.snapshotMark;
  }

  get buffer(): Terminal["buffer"] {
    return this.terminal.buffer;
  }

  get terminalState(): Terminal {
    return this.terminal;
  }

  write(data: string): void {
    if (this.exitInfo !== null) {
      throw new Error(`session ${this.id} exited; cannot write`);
    }
    this.lastInputAtTime = new Date();
    this.ptyProcess.write(data);
  }

  resize(cols: number, rows: number): void {
    if (this.exitInfo !== null) return;
    this.ptyProcess.resize(cols, rows);
    this.terminal.resize(cols, rows);
  }

  kill(signal?: string): void {
    if (this.exitInfo !== null) return;
    this.ptyProcess.kill(signal);
  }

  onExit(callback: ExitListener): void {
    if (this.exitInfo !== null) {
      callback(this.exitInfo);
      return;
    }
    this.exitListeners.push(callback);
  }

  onData(callback: DataListener): void {
    this.dataListeners.push(callback);
  }

  markSnapshot(): number {
    const previous = this.snapshotMark;
    this.snapshotMark = this.bytesEmitted;
    return previous;
  }
}
