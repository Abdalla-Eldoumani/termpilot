# Recipes

End-to-end workflows. Each recipe shows the MCP client config, the agent prompt that drives it, and what the tool sequence looks like in practice.

## Recipe 1: REPL exploration

Goal: let the agent explore an unfamiliar Python library by typing expressions and reading results.

**Setup.** termpilot only.

**Prompt.**

> Use termpilot to start an interactive Python REPL. Import the `pathlib` module and explore what `Path.home()` returns. Then list the contents of that directory using pathlib. Tell me what you find.

**What happens.**

1. Agent calls `terminal_open` with `command: "python3"`, `args: ["-i"]`. Gets back a session id and an initial snapshot showing the Python banner and `>>> ` prompt.
2. `terminal_type` with `text: "from pathlib import Path"`, `submit: true`.
3. `terminal_wait_for` with `predicate: { type: "prompt" }` to wait for the next `>>>`.
4. `terminal_type` with `text: "Path.home()"`, `submit: true`.
5. `terminal_wait_for` for the prompt again, then `terminal_snapshot` to read the result.
6. Continues building up exploration. Closes the session at the end with `terminal_close`.

The agent never parses raw scrollback. Each interaction is a deterministic op-snapshot pair.

## Recipe 2: build verification

Goal: run a Cargo build and report compile errors with line refs the agent can quote back.

**Setup.** termpilot. Optionally `TERMPILOT_AUDIT_LOG` enabled for later review.

**Prompt.**

> Use termpilot to run `cargo build --release` in `/Users/you/project`. If there are compile errors, tell me the line numbers and the error codes.

**What happens.**

1. Agent calls `terminal_run` with `command: "cargo"`, `args: ["build", "--release"]`, `cwd: "/Users/you/project"`, `wait_for: { type: "exit" }`, `timeout_ms: 120000`.
2. termpilot opens a session, writes nothing, waits for exit, closes.
3. Returns a snapshot. If exit code is non-zero, agent looks for lines matching `error\[E\d+\]` in the buffer, reports them with their refs.

For longer builds where you want progress reports, use `terminal_open` instead of `terminal_run`, then poll with `terminal_snapshot(since_last: true)` periodically.

## Recipe 3: OS testing with qemu-mcp-server and bindiff-mcp

Goal: build a custom OS kernel, boot it under QEMU, drive its serial console to verify boot, run a self-test, and on failure use bindiff to localize the regression against a known-good build.

This is the headline use case. Three MCP servers compose, each handling one layer:

- **termpilot** drives the host build pipeline (`make`, `cargo build`, gdb attached to QEMU's gdbserver, host-side test runners).
- **[`qemu-mcp-server`](https://github.com/Abdalla-Eldoumani/qemu-mcp-server)** drives the VM lifecycle and its serial console. It already ships its own console-driving tools, so termpilot doesn't attach to the QEMU console for the standard flow.
- **[`bindiff-mcp`](https://github.com/Abdalla-Eldoumani/bindiff-mcp)** diagnoses regressions at the binary level.

**Setup.** Install the three servers:

```bash
npm install -g termpilot
npm install -g qemu-mcp-server
git clone https://github.com/Abdalla-Eldoumani/bindiff-mcp && cd bindiff-mcp && npm install && npm run build
```

Configure all three in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "termpilot": {
      "command": "termpilot",
      "env": {
        "TERMPILOT_WORKSPACE_ROOT": "/Users/you/projects/my-os",
        "TERMPILOT_POLICY": "warn",
        "TERMPILOT_AUDIT_LOG": "/tmp/termpilot-os.jsonl"
      }
    },
    "qemu": {
      "command": "npx",
      "args": ["-y", "qemu-mcp-server"]
    },
    "bindiff": {
      "command": "node",
      "args": ["/Users/you/projects/bindiff-mcp/dist/index.js"],
      "env": { "BINDIFF_TOOLCHAIN_PREFIX": "" }
    }
  }
}
```

For ARM64 kernels analyzed on an x86 host, set `BINDIFF_TOOLCHAIN_PREFIX=aarch64-linux-gnu-`. For Windows hosts, qemu-mcp-server runs through WSL only.

**Prompt.**

> My OS kernel project is at `/Users/you/projects/my-os`. Do this end to end. First, use termpilot to run `make kernel ARCH=x86_64` and wait for exit. If the build fails, report errors and stop. Otherwise, use qemu-mcp-server to create an x86_64 VM with 256MB memory, kernel `./build/kernel.elf`, kernel args `console=ttyS0`. Wait for `READY` on the console within 30 seconds, then send `selftest` and report the result. If anything goes wrong (build error, no READY, non-zero selftest), use bindiff-mcp to compare `./build/kernel.elf` against `./build/kernel.elf.last-good` with `compare_binaries` first, then `diff_symbols` if size or function counts changed meaningfully. Always destroy the VM when done.

**What happens (happy path).**

1. `terminal_run` (termpilot): build the kernel on the host, verify exit code 0.
2. `create_vm` (qemu-mcp-server): `architecture: "x86_64"`, `memory: 256`, `kernel: "./build/kernel.elf"`, `kernel_args: "console=ttyS0"`.
3. `wait_for_console_output` (qemu-mcp-server): match `READY` within 30s.
4. `send_console_input` (qemu-mcp-server): `selftest\n`.
5. `read_console` (qemu-mcp-server): read the result.
6. `destroy_vm` (qemu-mcp-server): clean up.

**What happens (regression path).**

If READY doesn't appear or selftest fails:

1. `compare_binaries` (bindiff-mcp) for the high-level diff (size, function counts).
2. `diff_symbols` (bindiff-mcp) with `symbol_type: "function"` to localize.
3. `disassemble_function` (bindiff-mcp) on suspicious symbols for instruction-level investigation.
4. Agent correlates with recent commits and reports.

**Why each server earns its place.** qemu-mcp-server already has `send_console_input`, `wait_for_console_output`, and `read_console`, it drives the VM console itself. bindiff-mcp wraps GNU binutils with structured outputs the agent can reason over. termpilot covers the host side: kernel builds, host test runners, gdb attached to QEMU's gdbserver via `gdb-multiarch -ex 'target remote :1234'`, screenshots of TUI tools, and any other CLI step that isn't inside the VM. Each server's tools map cleanly onto the part of the workflow it owns.

If you want termpilot to drive the QEMU console directly (for richer features: line refs, regex predicates, idle detection, PNG screenshots), wire `terminal_open` to a `socat` against the QEMU console socket. That's an advanced setup; the standard path uses qemu-mcp-server's own console tools.

## Recipe 4: gdb debugger session

Goal: drive an interactive gdb session, set a breakpoint, run, inspect register state, continue.

**Setup.** termpilot only. Workspace root pointing at the project containing the binary.

**Prompt.**

> Use termpilot to debug `./target/release/myapp` with gdb. Set a breakpoint at `main`, run with the argument `--config=test.toml`, and when the breakpoint hits, dump all registers and tell me what's in them.

**What happens.**

1. `terminal_open` with `command: "gdb"`, `args: ["--quiet", "./target/release/myapp"]`.
2. `terminal_wait_for` predicate `prompt` with the gdb-specific regex (configurable via the session's `prompt_regex`, e.g., `^\(gdb\)\s*$`).
3. `terminal_type` with `text: "break main"`, `submit: true`.
4. Wait for prompt.
5. `terminal_type` with `text: "run --config=test.toml"`, `submit: true`.
6. `terminal_wait_for` predicate `text: "Breakpoint 1"`.
7. `terminal_type` with `text: "info registers"`, `submit: true`.
8. Wait for prompt, snapshot, report.

For the prompt regex, set it on the session at open time:

```json
{
  "command": "gdb",
  "args": ["--quiet", "./target/release/myapp"],
  "name": "gdb-session",
  "prompt_regex": "^\\(gdb\\)\\s*$"
}
```

## Recipe 5: TUI verification with screenshots

Goal: launch a TUI application and verify its visual layout.

**Setup.** termpilot with screenshot support (default; needs Cairo).

**Prompt.**

> Use termpilot to launch `htop`. Wait for the UI to render, then take a screenshot and tell me what processes are using the most CPU. Send F10 to quit.

**What happens.**

1. `terminal_open` with `command: "htop"`, `cols: 132`, `rows: 40`.
2. `terminal_wait_for` with `predicate: { type: "idle", ms: 500 }` to wait for the initial render.
3. `terminal_screenshot` to capture the UI.
4. Agent reasons over the image (the MCP client passes it in vision context).
5. `terminal_press` with `keys: ["F10"]`.
6. `terminal_close` if the process didn't exit.

Screenshots are useful for any TUI where structure (boxes, columns, colors) matters more than text. vim, htop, ncurses installers, gdb's TUI mode, k9s, lazygit.

## Recipe 6: regression test for a CLI tool

Goal: smoke-test a CLI across a matrix of inputs, capture each result.

**Setup.** termpilot with `TERMPILOT_POLICY=allowlist` and only the CLI under test on the allowlist.

**Prompt.**

> Run `mycli --version`, `mycli --help`, `mycli build --target=x86_64`, and `mycli build --target=aarch64` in `/Users/you/myproject`. For each, report the exit code and the last 5 lines of output.

**What happens.** Agent makes four `terminal_run` calls in a loop (or in parallel; the MCP SDK supports concurrent calls). Each returns a snapshot. Agent compiles a structured report from the four results.

This is the workflow that scales to autograding: replace the four hand-listed inputs with a programmatic matrix and you have an autograder loop that runs in a single Claude Code session.

## Recipe 7: long-running services

Goal: start a backend server in the background, run a smoke test against it, stop it.

**Setup.** termpilot, plus optionally a separate `curl` or HTTP-test MCP for the smoke test.

**Prompt.**

> Start the API server in `./apps/api` with `npm run start`. Wait for it to print "listening on 3000". Then in a different session, run `curl http://localhost:3000/health` and tell me the response. Then stop the server.

**What happens.**

1. `terminal_open` with `command: "npm"`, `args: ["run", "start"]`, `cwd: "./apps/api"`, `name: "api"`. Returns a session id.
2. `terminal_wait_for` with `predicate: { type: "text", match: "listening on 3000" }`, `timeout_ms: 30000`.
3. `terminal_run` with `command: "curl"`, `args: ["http://localhost:3000/health"]`. Returns the response.
4. `terminal_close` with `session_id: "api"`.

Two sessions, one persistent and one ephemeral. The persistent one stays open for as long as the agent needs.

## Composing your own

The recipes above all follow the same pattern: the agent thinks in terms of "open, interact, observe, close" and termpilot maps that onto PTY operations. When you write a new recipe:

1. Decide whether you need persistent state across multiple inputs (use `terminal_open` + granular tools) or a single fire-and-forget (use `terminal_run`).
2. For interactive flows, always pair `terminal_type` / `terminal_press` with `terminal_wait_for` rather than `setTimeout`. The waitFor model is what makes the flow deterministic.
3. Use `terminal_screenshot` only when the visual layout matters. For text reasoning, snapshots are cheaper.
4. Close sessions you opened. Idle sessions auto-close after 30 minutes, but explicit close is faster and more polite.
