# Security policy

termpilot executes arbitrary commands on the user's machine on behalf of a language model. That makes security the central design concern, not an afterthought. This document describes the threat model, what termpilot defends against by default, what it does not, and how to report a vulnerability.

## Reporting a vulnerability

Email security reports to <security@termpilot.dev> (placeholder, replace with the real address before publishing). Please include:

- A description of the issue and the impact
- Steps to reproduce, ideally with a minimal example
- The version of termpilot and the version of Node.js you tested against
- Your name and how you'd like to be credited (optional)

We aim to acknowledge reports within 48 hours and ship a fix within 14 days for high-severity issues. We will coordinate disclosure with you.

Please do not open public issues for vulnerabilities.

## Threat model

termpilot's primary attacker is **prompt injection delivered via terminal output**. A spawned process (or anything it reads from disk or the network) can write content into the terminal that, when surfaced to the agent in a snapshot, instructs the agent to run dangerous commands. The agent then calls back into termpilot to do exactly that.

Other threats considered:

- A malicious or compromised MCP client sending commands the user did not approve
- Resource exhaustion (fork bombs, runaway processes, unbounded scrollback)
- Path traversal: agents trying to operate outside the workspace
- Privilege escalation via `sudo`, `doas`, `su`
- Cross-session leakage (one session reading another's state through env vars or shared files)
- Audit-log evasion (commands that disable logging mid-stream)

Threats explicitly out of scope:

- Side channels (timing, power, electromagnetic). termpilot is not a hardened sandbox.
- Defending the host against a fully-compromised guest VM. Use real VM isolation for that.
- Defending against a malicious operator with shell access to the machine running termpilot.
- Cryptographic guarantees of any kind. Audit log entries are not signed.

## Defenses in v0.1

**Default-on**:

- **Workspace restriction**. Every session's `cwd` must resolve under `TERMPILOT_WORKSPACE_ROOT`. Symlink escapes are blocked: the resolved real path is checked.
- **Dangerous pattern detection**. Commands matching a curated denylist are refused with a structured error. The list covers obvious cases: `rm -rf /`, `:(){:|:&};:`, `dd if=/dev/zero of=/dev/sd[a-z]`, `mkfs` against block devices, `chmod -R 000 /`, `> /dev/sd*`, `curl … | sh`, `wget … | bash`. Refusal can be tightened or relaxed via policy.
- **Privileged-command block**. Commands starting with `sudo`, `doas`, or `su` are refused unless `TERMPILOT_ALLOW_PRIVILEGED=true`.
- **Resource caps**. Concurrent session limit (default 16), per-session scrollback cap (default 1 MiB, oldest bytes dropped), idle session timeout (default 30 min, auto-closed).
- **Environment allowlisting**. Spawned sessions inherit only `PATH`, `HOME`, `USER`, `LANG`, `LC_ALL`, `TERM`, `SHELL` by default. Add to the allowlist via `TERMPILOT_ENV_ALLOWLIST`.
- **Stdout-channel discipline**. The MCP protocol uses stdout. Logging only goes to stderr. We use a wrapper that throws if anything tries to write to stdout outside the JSON-RPC framing.

**Opt-in**:

- **Allowlist policy**. Set `TERMPILOT_POLICY=allowlist` and provide `TERMPILOT_ALLOWED_COMMANDS=…` to whitelist exact commands. Anything else fails closed.
- **Audit log**. Set `TERMPILOT_AUDIT_LOG=/path/to/log.jsonl` to record every command attempt, the arguments, the resolved cwd, the policy decision, the exit code, and the wall-clock duration. The log file is opened with `O_APPEND` so concurrent writes are atomic per line; rotation is the operator's responsibility.

## What termpilot does not do

- It does not sandbox the spawned process at the kernel level. A command that runs successfully has all the privileges of the user running termpilot.
- It does not encrypt audit logs. They are plaintext JSONL.
- It does not prevent network egress from spawned processes. If you need that, run inside a network namespace, an isolated VM, or a container with no network.
- It does not authenticate MCP clients. The stdio transport assumes the client is the user.
- It does not validate that screenshot output goes to a trusted destination. The MCP client (Claude Code, Claude Desktop) handles that.

## Recommended operator practices

- Run termpilot inside a VM or container when working with untrusted input. The QEMU MCP server pairs cleanly: spawn a guest VM, point termpilot at the guest's serial console, give the agent zero access to the host shell.
- Set `TERMPILOT_WORKSPACE_ROOT` to a project-specific directory, not your home directory.
- Enable the audit log when running unattended (Ralph Wiggum style autonomous loops).
- Keep `TERMPILOT_ALLOW_PRIVILEGED=false` unless there's a specific reason otherwise. There almost never is.
- Review the recipes in [docs/security.md](docs/security.md) for stronger sandboxing setups.

## Versioning of security guarantees

Pre-1.0, security defenses may shift between minor versions as we learn from real-world use. Major version bumps are reserved for changes that break the protocol surface. Before deploying termpilot in a setting that matters, pin to an exact version and read the changelog.
