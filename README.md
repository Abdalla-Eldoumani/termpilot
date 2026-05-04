# termpilot

A Model Context Protocol server that drives terminal sessions the way Playwright drives browsers.

Open a session, type, press keys, snapshot the screen, wait for predicates, screenshot. Built for AI agents that need to test CLIs, debug REPLs, run build pipelines, drive interactive debuggers, and verify operating systems under emulation.

```
$ npm install -g @termpilot/server
$ claude mcp add termpilot termpilot
```

## Why this exists

The MCP ecosystem has plenty of terminal servers that ship PTY primitives, `spawn`, `write`, `read`, `kill`. They give your agent raw scrollback bytes back and ask it to parse ANSI by hand. That works, but it pushes structure-building onto the model and makes deterministic test sequences hard to write.

termpilot lifts the abstraction one level. Snapshots come back as structured data with stable line refs. `wait_for` accepts predicates, not polling loops. Screenshots render the buffer to PNG when colors and alignment matter. The tool surface mirrors Playwright's: same conceptual model, applied to terminals instead of browsers.

If you've used Playwright MCP, the mental model transfers directly:

| Playwright | termpilot |
|---|---|
| `browser_navigate` | `terminal_open` |
| `browser_snapshot` | `terminal_snapshot` |
| `browser_type` | `terminal_type` |
| `browser_press_key` | `terminal_press` |
| `browser_wait_for` | `terminal_wait_for` |
| `browser_screenshot` | `terminal_screenshot` |
| `browser_close` | `terminal_close` |

## What you can do with it

- Drive a Python or Node REPL: type expressions, read structured results back, build up state across turns.
- Run a build and detect failures with `wait_for(regex: "error\\[E\\d+\\]")` instead of grepping stdout.
- Step through a `gdb` session: set breakpoints, continue, snapshot register dumps as text the agent can reason about.
- Boot a kernel under QEMU and verify the boot sequence with `wait_for(text: "login:")` plus a screenshot of the framebuffer.
- Run an autograder against student submissions and capture per-test snapshots.
- Smoke test a CLI tool across versions and diff the structured output.

For OS work specifically, termpilot composes cleanly with [`qemu-mcp-server`](https://github.com/Abdalla-Eldoumani/qemu-mcp-server) (VM lifecycle and console driving) and [`bindiff-mcp`](https://github.com/Abdalla-Eldoumani/bindiff-mcp) (ELF analysis and build comparison). termpilot drives the host-side build pipeline, qemu-mcp drives the guest VM, bindiff diagnoses regressions at the binary level. Recipe in [docs/recipes.md](docs/recipes.md).

## Install

Requirements: Node.js 20 or newer. A C++ toolchain (Xcode CLI tools on macOS, `build-essential` + `python3` on Linux, Visual Studio Build Tools on Windows) is needed at install time because [`node-pty`](https://github.com/microsoft/node-pty) builds a native module.

```bash
npm install -g @termpilot/server
```

Add it to Claude Code:

```bash
claude mcp add termpilot termpilot
```

Or to Claude Desktop, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "termpilot": {
      "command": "termpilot"
    }
  }
}
```

For Cursor, VS Code, and other clients, see [docs/getting-started.md](docs/getting-started.md).

## Configuration

termpilot reads configuration from environment variables. Sensible defaults apply if you set nothing.

| Variable | Default | What it does |
|---|---|---|
| `TERMPILOT_WORKSPACE_ROOT` | `process.cwd()` | All sessions must `cwd` within this directory. Path traversal is blocked. |
| `TERMPILOT_POLICY` | `warn` | One of `unrestricted`, `warn`, `allowlist`, `denylist`. See security docs. |
| `TERMPILOT_ALLOWED_COMMANDS` | (empty) | Comma-separated allowlist. Only used when `TERMPILOT_POLICY=allowlist`. |
| `TERMPILOT_DENIED_COMMANDS` | (built-in dangerous list) | Comma-separated denylist. Used when `TERMPILOT_POLICY=denylist` or `warn`. |
| `TERMPILOT_MAX_SESSIONS` | `16` | Hard cap on concurrent sessions. |
| `TERMPILOT_MAX_OUTPUT_BYTES` | `1048576` (1 MiB) | Per-session scrollback limit. Older bytes drop. |
| `TERMPILOT_SESSION_TIMEOUT_MS` | `1800000` (30 min) | Idle sessions auto-close after this. |
| `TERMPILOT_AUDIT_LOG` | (disabled) | Path to an append-only JSONL audit log. |
| `TERMPILOT_LOG_LEVEL` | `warn` | One of `debug`, `info`, `warn`, `error`. Logs go to stderr only. |
| `TERMPILOT_ALLOW_PRIVILEGED` | `false` | When false, refuses commands starting with `sudo`, `doas`, `su`, `pkexec`, `runuser`. |
| `TERMPILOT_ENV_ALLOWLIST` | `PATH,HOME,USER,LANG,LC_ALL,TERM,SHELL` | Which host env vars get inherited by spawned sessions. |

Full details and security trade-offs in [docs/security.md](docs/security.md).

## Security model

termpilot runs commands on your machine on behalf of an LLM. That's intrinsically dangerous, and the project takes the threat seriously.

- **Default policy is `warn`**: dangerous-pattern detection runs on every command, and obviously bad inputs (`rm -rf /`, fork bombs, `dd if=/dev/zero of=/dev/sd*`) are refused outright.
- **Workspace restriction**: every spawn must `cwd` within `TERMPILOT_WORKSPACE_ROOT`. Path traversal attempts fail.
- **No automatic privilege escalation**: `sudo`, `doas`, `su`, `pkexec`, and `runuser` are blocked unless `TERMPILOT_ALLOW_PRIVILEGED=true`.
- **Resource caps**: concurrent sessions, scrollback bytes, idle timeout, all bounded by config.
- **Audit log**: optional append-only JSONL log of every command, args, cwd, exit code, duration.
- **Stdio only**: no network listener in v0.1, so the server isn't exposed to anything off the local machine.

For untrusted input handling and prompt-injection resistance, run termpilot inside an isolated VM (QEMU MCP composes well for this) or a container. Recipes in [docs/security.md](docs/security.md).

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Documentation

- [Getting started](docs/getting-started.md), install, client setup, first session
- [Tool reference](docs/tool-reference.md), every tool, every parameter, every return shape
- [Security model](docs/security.md), threat model, sandboxing, audit log
- [Recipes](docs/recipes.md), REPLs, build verification, OS testing, debugger sessions
- [Architecture](docs/architecture.md), how it works under the hood
- [FAQ](docs/faq.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: open an issue first for non-trivial changes, run `npm test` before submitting, follow the existing voice in docs (plain prose, no AI tells, no marketing words).

## License

MIT. See [LICENSE](LICENSE).
