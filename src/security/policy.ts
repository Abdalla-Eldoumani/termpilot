import { realpath } from "node:fs/promises";
import { sep } from "node:path";

import type { Config } from "../config/env.js";
import type { PolicyDecision } from "../types.js";

export interface DecideArgs {
  command: string;
  args: string[];
  cwd: string;
  config: Config;
}

const PRIVILEGED_COMMANDS = new Set(["sudo", "doas", "su", "pkexec", "runuser"]);

const IS_CASE_INSENSITIVE_FS = process.platform === "darwin" || process.platform === "win32";

interface DangerousPattern {
  regex: RegExp;
  reason: string;
}

// Documented per pattern. Catches honest mistakes and casual injection.
// Determined adversaries can encode payloads to evade; that is acknowledged
// in .agent/SECURITY_MODEL.md.
const DANGEROUS_PATTERNS: DangerousPattern[] = [
  // rm -rf, rm -fr, rm -Rf, rm -fR. Single combined-flag form.
  {
    regex: /\brm\s+(?:-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b/i,
    reason: "recursive force-delete (rm -rf)",
  },
  // rm --recursive --force in either order.
  {
    regex: /\brm\s+(?:--recursive\s+--force|--force\s+--recursive)\b/i,
    reason: "recursive force-delete (rm --recursive --force)",
  },
  // Canonical fork bomb: ":(){ :|:& };:".
  {
    regex: /:\s*\(\s*\)\s*\{[^}]*\|\s*:[^}]*\}\s*;\s*:/,
    reason: "fork bomb",
  },
  // dd reading from /dev/(zero|random|urandom) or writing to a block device.
  {
    regex: /\bdd\s+(?:if=\/dev\/(?:zero|random|urandom)|of=\/dev\/(?:sd|hd|nvme|disk))/i,
    reason: "disk-wipe via dd to block device",
  },
  // mkfs against any /dev/* path.
  {
    regex: /\bmkfs(?:\.\w+)?\s+\/dev\//i,
    reason: "format block device with mkfs",
  },
  // Recursive chmod with all-zero modes from root: `chmod -R 000 /`.
  {
    regex: /\bchmod\s+-R\s+0+\s+\/(?:\s|$)/,
    reason: "recursive chmod 000 from root",
  },
  // Pipe-to-shell from network. `curl ... | sh`, `wget ... | bash`, etc.
  {
    regex: /\b(?:curl|wget|fetch)\s+[^|]*\|\s*(?:sh|bash|zsh|fish)\b/i,
    reason: "pipe-to-shell from network",
  },
  // Redirect output to a block device file.
  {
    regex: />\s*\/dev\/(?:sd|hd|nvme|disk)/i,
    reason: "redirect to block device",
  },
  // Power-off and reboot commands.
  {
    regex: /\b(?:shutdown|reboot|halt|poweroff)\b/i,
    reason: "system power off",
  },
];

function stripQuotes(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizeToken(value: string): string {
  let token = value.trim();
  token = token.replace(/^\\+/, "");
  token = stripQuotes(token);
  if (IS_CASE_INSENSITIVE_FS) {
    token = token.toLowerCase();
  }
  return token;
}

function firstToken(command: string): string {
  const trimmed = command.trim();
  if (trimmed === "") return "";
  const match = trimmed.match(/^\S+/);
  return match ? match[0] : "";
}

function commandToken(command: string): string {
  return normalizeToken(firstToken(command));
}

function isPrivilegedCommand(command: string): boolean {
  // PRIVILEGED_COMMANDS are stored lowercase. On case-insensitive platforms the
  // token has already been lowercased; on case-sensitive platforms only an
  // exact lowercase first token matches the privileged binary's real name.
  return PRIVILEGED_COMMANDS.has(commandToken(command));
}

function listIncludesToken(list: readonly string[], token: string): boolean {
  if (IS_CASE_INSENSITIVE_FS) {
    const lower = token.toLowerCase();
    return list.some((entry) => entry.toLowerCase() === lower);
  }
  return list.includes(token);
}

function joinForPatternCheck(command: string, args: readonly string[]): string {
  return [command, ...args].join(" ");
}

function matchDangerousPattern(text: string): DangerousPattern | undefined {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.regex.test(text)) return pattern;
  }
  return undefined;
}

function trimSep(p: string): string {
  return p.endsWith(sep) ? p.slice(0, -1) : p;
}

async function isInWorkspace(cwd: string, workspaceRoot: string): Promise<boolean> {
  let realCwd: string;
  let realRoot: string;
  try {
    realCwd = await realpath(cwd);
    realRoot = await realpath(workspaceRoot);
  } catch {
    return false;
  }
  const a = trimSep(realCwd);
  const b = trimSep(realRoot);
  return a === b || a.startsWith(b + sep);
}

export async function decide(input: DecideArgs): Promise<PolicyDecision> {
  const { command, args, cwd, config } = input;

  if (!(await isInWorkspace(cwd, config.workspaceRoot))) {
    return { allowed: false, reason: "cwd: outside workspace" };
  }

  if (!config.allowPrivileged && isPrivilegedCommand(command)) {
    return { allowed: false, reason: "policy: refused (privileged command)" };
  }

  switch (config.policy) {
    case "unrestricted":
      return { allowed: true, reason: "policy: unrestricted" };
    case "warn": {
      const text = joinForPatternCheck(command, args);
      const danger = matchDangerousPattern(text);
      if (danger) {
        return { allowed: false, reason: `policy: refused (${danger.reason})` };
      }
      return { allowed: true, reason: "policy: warn (no dangerous pattern matched)" };
    }
    case "denylist": {
      const token = commandToken(command);
      if (listIncludesToken(config.deniedCommands, token)) {
        return { allowed: false, reason: "policy: refused (in denylist)" };
      }
      const text = joinForPatternCheck(command, args);
      const danger = matchDangerousPattern(text);
      if (danger) {
        return { allowed: false, reason: `policy: refused (${danger.reason})` };
      }
      return { allowed: true, reason: "policy: denylist (not in list)" };
    }
    case "allowlist": {
      const token = commandToken(command);
      if (!listIncludesToken(config.allowedCommands, token)) {
        return { allowed: false, reason: "policy: refused (not in allowlist)" };
      }
      return { allowed: true, reason: "policy: allowlist (in list)" };
    }
    default: {
      const exhaustive: never = config.policy;
      throw new Error(`unhandled policy mode: ${String(exhaustive)}`);
    }
  }
}
