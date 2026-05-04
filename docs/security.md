# Security model

termpilot runs commands on your machine on behalf of an LLM. The threats are real, the defaults are conservative, and serious deployments should go further than the defaults. This document describes what termpilot defends against, how the defenses compose, and what to do when the built-in protections aren't enough.

For the disclosure process, see [SECURITY.md](../SECURITY.md) at the repo root.

## The threat model in one paragraph

The dominant threat is **prompt injection delivered through terminal output**. A spawned process (or anything it reads, files on disk, network responses, terminal-pasted content, even man pages with crafted examples) can write text into the terminal that, when surfaced to the agent in a snapshot, instructs the agent to run dangerous commands. The agent, behaving as designed, calls back into termpilot to do exactly that. Every subsequent tool call rides on the same trust assumption that's already broken.

Secondary threats: malicious or compromised MCP clients, resource exhaustion, path traversal, privilege escalation, and audit-log tampering.

## Defense layers

termpilot uses defense in depth. No single layer is sufficient on its own.

### Layer 1: command-level policy

Every spawn passes through a policy decision before any process is created. The policy is one of:

- **`unrestricted`**: no filtering. Useful for trusted local development. Never use with untrusted input.
- **`warn`** (default): runs the dangerous-pattern detector and refuses obvious bad cases (`rm -rf /`, fork bombs, `dd if=/dev/zero of=/dev/sd*`, raw pipe-to-shell from network). Logs near-misses.
- **`denylist`**: refuses anything whose first argument matches a configured list. Use to block specific tools that have no place in agent workflows (`shutdown`, `reboot`, `mkfs`, vendor-specific dangerous wrappers).
- **`allowlist`**: refuses anything whose first argument is not in a configured list. Fail-closed mode. Highly recommended for production agent workflows.

Set the policy with `TERMPILOT_POLICY`. Configure the lists with `TERMPILOT_ALLOWED_COMMANDS` and `TERMPILOT_DENIED_COMMANDS` (comma-separated).

The dangerous-pattern detector is not a security boundary on its own, adversaries can wrap commands in `sh -c "..."` or use base64 to hide intent. Treat it as a tripwire that catches honest mistakes, not a wall.

### Layer 2: workspace restriction

Every session's `cwd` must resolve under `TERMPILOT_WORKSPACE_ROOT`. The check happens after symlink resolution, so an agent can't escape with a symlink pointing outside the root. The default is the directory `termpilot` was launched from.

This does not restrict where spawned processes can read or write files. It restricts only where they start. A process that does `cat /etc/passwd` once spawned still works, because that's the operating system's job to authorize, not termpilot's.

### Layer 3: privilege gating

Commands starting with `sudo`, `doas`, `su`, `pkexec`, or `runuser` are refused unless `TERMPILOT_ALLOW_PRIVILEGED=true`. This catches the case where prompt-injected output convinces the agent to escalate. The check is a regex on the first non-whitespace token, so `sudo ls`, `  sudo ls`, and `sudo  ls` all match. `cmd && sudo ls` does not match because the first token is `cmd`, but in that case, the dangerous-pattern detector catches the `&&` chained shell command.

Set `TERMPILOT_ALLOW_PRIVILEGED=true` only when there's a specific reason. There almost never is.

### Layer 4: environment allowlisting

Spawned sessions inherit only the environment variables in `TERMPILOT_ENV_ALLOWLIST`. The default is `PATH,HOME,USER,LANG,LC_ALL,TERM,SHELL`. Add to the allowlist for tools that need specific vars (e.g., `CARGO_HOME`, `PYTHONPATH`).

This prevents `AWS_*`, `GITHUB_TOKEN`, `OPENAI_API_KEY`, and similar secrets in the host environment from being inherited by spawned processes. If a process needs a secret, the user must pass it explicitly via the `env` field on `terminal_open`.

### Layer 5: resource caps

- `TERMPILOT_MAX_SESSIONS` (default 16): hard cap on concurrent sessions. Prevents an agent from spawning hundreds.
- `TERMPILOT_MAX_OUTPUT_BYTES` (default 1 MiB): per-session scrollback cap. Older bytes are dropped, not buffered to disk.
- `TERMPILOT_SESSION_TIMEOUT_MS` (default 30 min): idle sessions are auto-closed.
- (Future, post-v0.1) per-process CPU and memory limits via `setrlimit`. Tracked in the issue tracker.

### Layer 6: audit log

Set `TERMPILOT_AUDIT_LOG=/path/to/log.jsonl` to record every command attempt as an append-only JSONL entry. Each line is a JSON object:

```json
{
  "ts": "2026-05-03T10:30:00.123Z",
  "session_id": "s_a3b8c2",
  "command": "cargo",
  "args": ["build", "--release"],
  "cwd": "/Users/you/project",
  "policy": "warn",
  "decision": "allowed",
  "exit_code": 0,
  "duration_ms": 4823
}
```

Refused commands are logged with `decision: "refused"` and a `reason` field.

The log file is opened with `O_APPEND`, so concurrent writes are atomic per line on POSIX systems. Rotation is the operator's responsibility, point the env var at a fresh file periodically and archive the old one.

## Sandboxing recipes

The built-in defenses are conservative but bounded. For higher-stakes work, run termpilot inside a sandbox.

### Recipe 1: dedicated user account

Run termpilot as a non-privileged user with no access to your home directory:

```bash
sudo useradd -m -s /bin/bash agent
sudo -u agent npm install -g @termpilot/server
# Configure your MCP client to launch termpilot as the agent user
```

The agent now has access only to the agent user's files. Catastrophic agent mistakes can't trash your real data.

### Recipe 2: container

Run termpilot inside a container with a tmpfs workspace:

```bash
docker run -it --rm \
  -v $(pwd):/workspace:ro \
  -v termpilot-runtime:/runtime \
  -e TERMPILOT_WORKSPACE_ROOT=/runtime \
  -e TERMPILOT_POLICY=allowlist \
  -e TERMPILOT_ALLOWED_COMMANDS=cargo,rustc,gdb,ls,cat,grep \
  --network none \
  node:22 \
  npx @termpilot/server
```

Caveats: the MCP transport is stdio, so this only works if the MCP client launches the container directly. For Claude Desktop, the easier path is mounting termpilot's stdio across a `docker exec`.

### Recipe 3: VM via QEMU MCP

Pair termpilot with the QEMU MCP server. The QEMU MCP launches a guest VM; termpilot runs inside the guest, driving the guest's shell. The agent's tool calls hit the guest, not the host. Catastrophic mistakes are contained to the VM, which can be reverted to a snapshot.

This is the recommended setup for autonomous agent loops (Ralph Wiggum style). See [recipes.md](recipes.md) for the full configuration.

### Recipe 4: network namespace (Linux)

Run termpilot inside a network namespace with no internet access:

```bash
sudo ip netns add termpilot-ns
sudo ip netns exec termpilot-ns sudo -u $USER termpilot
```

Spawned processes inherit the namespace. They can resolve loopback but not the public internet. Useful when the agent's job is local-only and you want to make sure prompt injection can't exfiltrate data.

## What termpilot does not protect against

- **Side channels.** Timing, power, electromagnetic. Not a hardened sandbox.
- **A fully-compromised guest in recipe 3.** The VM is the boundary; the host is on its own if the guest escapes QEMU.
- **A malicious operator with shell access.** Anyone with shell access can replace `termpilot` itself.
- **Cryptographic guarantees.** Audit log entries are not signed.
- **MCP client compromise.** If your editor is compromised, termpilot is too.

## Things to do today

If you're using termpilot for anything that matters:

1. Set `TERMPILOT_WORKSPACE_ROOT` to a project directory, not your home.
2. Set `TERMPILOT_AUDIT_LOG` to a file you can review later.
3. Keep `TERMPILOT_POLICY=warn` at minimum. Move to `allowlist` for autonomous loops.
4. Keep `TERMPILOT_ALLOW_PRIVILEGED=false`.
5. Use the QEMU MCP recipe for OS work or anything that touches kernel-level code.

Most prompt-injection attacks rely on the agent being one tool call away from disaster. The defenses above add multiple steps in the way. None of them is bulletproof. All of them together raise the bar enough that the realistic attacks shift to "convince the user to disable the defenses," which is a problem outside termpilot's scope.
