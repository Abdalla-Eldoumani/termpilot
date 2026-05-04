# Architecture

How termpilot is built and why. This document is for contributors and for users who want to understand the design trade-offs before depending on the project.

## High level

```
MCP client (Claude Code, Claude Desktop, Cursor, ...)
        │   JSON-RPC over stdio
        ▼
┌──────────────────────────────────────────┐
│                                          │
│   src/server/server.ts                   │   tool registry, request dispatch
│   src/server/tools/*                     │   one file per tool
│                                          │
│   src/security/policy.ts                 │   command policy enforcement
│   src/security/audit.ts                  │   append-only JSONL log
│                                          │
│   src/pty/manager.ts                     │   session registry by id
│   src/pty/session.ts                     │   wraps node-pty + @xterm/headless
│                                          │
│   src/render/snapshot.ts                 │   buffer → YAML
│   src/render/screenshot.ts               │   buffer → PNG via canvas
│                                          │
│   src/predicates/matchers.ts             │   wait_for predicate evaluator
│                                          │
└──────────────────────────────────────────┘
        │
        ▼
   spawned PTY processes (one per session)
```

## Why MCP, why stdio

MCP is the protocol AI agents use to call tools. Stdio is the transport the local-development MCP clients use. Combining the two means termpilot is a single-binary, no-network tool that any MCP client can launch as a subprocess.

The alternative, Streamable HTTP, would let multiple clients share a daemon and let one client connect to a remote termpilot. That's useful in some scenarios (CI agents, hosted dev environments) but adds an authentication problem. We're keeping stdio-only for v0.x and revisiting once the security model for HTTP is clear.

## Why node-pty plus @xterm/headless

A pseudoterminal alone gives you a stream of bytes. That's enough for `spawn → write → read`, but the bytes are full of ANSI escape sequences (cursor moves, color changes, alternate-screen toggles, scroll-region commands) that any consumer has to interpret. Doing that interpretation by hand is a year of work and bugs.

`@xterm/headless` is xterm.js's terminal state machine without a renderer. It consumes the same byte stream and maintains a virtual screen buffer: a 2D grid of cells, each with a glyph and styling. We pipe `node-pty` output into `@xterm/headless` and read the buffer to produce snapshots. The VT100/xterm semantics are correct because xterm.js is what VS Code, Hyper, Tabby, and a hundred other projects depend on.

Trade-off: `@xterm/headless` is heavier than a pure ANSI parser. A bare `node-pty` plus a regex stripping ANSI codes would be faster. But the moment the agent runs `vim` or `htop`, the bare approach falls apart because the screen state isn't a function of the bytes, it's a function of the bytes plus terminal state. xterm.js gets that right.

## Why YAML snapshots

Three reasons:

1. Playwright MCP uses YAML for snapshots. Agents that have seen Playwright transfer the mental model directly.
2. Line-by-line buffer content reads naturally as a YAML list. JSON would either nest awkwardly or string-encode the buffer with literal `\n`s, both of which cost tokens.
3. Refs inline as `[ref=l5]` markers are easier to scan in YAML than in JSON.

The downside: agents have to be willing to parse YAML. Modern frontier models do this without difficulty.

## Why a pixel screenshot

Most TUI tools (vim, htop, gdb TUI mode) render with colors, bolds, and box-drawing characters where layout matters more than text. A buffer-as-text snapshot loses all of that. PNG screenshots preserve it.

The implementation walks the xterm-headless buffer cell by cell, drawing each character into a canvas with the cell's foreground/background. Output is base64 PNG returned as MCP `image` content. The MCP client passes the image into the model's vision context, and the agent can reason over it directly.

Trade-off: we picked `canvas` (Cairo bindings) over Puppeteer (headless Chromium with xterm.js DOM). Canvas is roughly 10x lighter and 10x faster, but the rendering is only as accurate as our cell-walker. Real xterm.js handles edge cases (combining characters, Unicode width tables, ligatures) that our walker won't catch. For pixel-perfect screenshots we'd switch to Puppeteer; for "good enough to verify a TUI laid out correctly" the canvas path wins.

## Why Playwright-style API instead of PTY primitives

The existing terminal MCPs (terminalcp, mcp-tui-test, mcp-console-automation, etc.) ship low-level primitives: spawn, write, read, kill. The agent then has to build its own polling loops, parse ANSI by hand, and reason about screen state from raw bytes.

termpilot lifts the abstraction. `terminal_wait_for` is a predicate, not a polling loop. `terminal_snapshot` returns structured data, not bytes. `terminal_press` takes named keys, not raw escape sequences.

The cost: termpilot is opinionated. An agent that wants to send a specific raw escape sequence has to fall through `terminal_type` with a literal string. That's fine, those cases are rare, and when they happen, the literal-string fallback is straightforward.

The benefit: agents write deterministic test sequences without polling loops or escape-sequence libraries. Tool calls map directly to user intent. Errors come back as structured rejections instead of "buffer doesn't contain X yet, retry."

## Why pin exact versions

Ranges (`^1.29.0`, `~1.29.0`) introduce non-determinism: two installs at different times can resolve to different code. For a security-sensitive tool that runs commands on user machines, that's unacceptable. The agent that built and tested termpilot saw exact bytes; the user installing it should see the same bytes.

Trade-off: contributors who want to bump a dependency have to update the exact version manually. That's the right friction; "regenerate the lockfile" should be a deliberate act, not a side effect.

## Why no daemon mode in v0.1

terminalcp uses a daemon so sessions survive MCP-client restarts. That's nice, but it introduces:

- A long-lived process to attack
- Cross-client session sharing (a security boundary)
- Unix socket / named-pipe code that has to work on three operating systems
- Garbage collection of orphaned sessions

For v0.1 we're shipping single-process: sessions die with the server. If the MCP client restarts, sessions are gone. This is the same model Playwright MCP uses by default.

If users complain enough, daemon mode is straightforward to add. Until then, "restart killed my session" is a one-line bug report and "running `kubectl exec` and the daemon got into a weird state" is a thousand lines of investigation.

## Code organization

- `src/index.ts`: entry point. Wires the server to stdio. Handles SIGINT/SIGTERM.
- `src/server/`: the MCP server itself. `server.ts` builds the server and registers handlers; `tools/*.ts` is one file per tool. Each tool exports `{ name, description, inputSchema, handler }`.
- `src/pty/`: `Session` wraps node-pty and an @xterm/headless instance. `SessionManager` is the registry.
- `src/render/`: pure functions that take a `Session` and produce a snapshot or screenshot.
- `src/predicates/`: pure functions that take a snapshot and a predicate, return a boolean.
- `src/security/`: policy engine and audit log. The policy engine is the gate every spawn passes through.
- `src/config/`: env-var parsing with Zod. Single source of truth for what the server is configured to do.
- `src/util/`: shared utilities: key dictionary, logger (stderr-only), session id generator.

The dependency graph runs strictly downward. `server` depends on `pty`, `render`, `predicates`, `security`. `pty` depends on `util`. `render` and `predicates` depend on `pty` types but not on the manager. Nothing depends on `server`.

## Testing strategy

Two layers:

1. **Unit tests** (`test/unit/`): pure functions. Snapshot serialization, predicate evaluation, policy decisions, key-dictionary translation. No PTY, no real processes.
2. **Integration tests** (`test/integration/`): real shells. Spawn `bash -c 'echo hello'`, drive a Python REPL, run a build. Skip on platforms missing the underlying tool.

We deliberately do not test against `node-pty` mocks. The library's surface is small and stable; mocking it tells us nothing useful and hides real cross-platform bugs.

## Stability and versioning

Pre-1.0 is "expect breaking changes between minor versions." From 1.0 forward, the tool surface (names, required input fields, output structure) is stable. New optional fields are non-breaking. Tool removal requires a major version bump.

The internal API (everything in `src/`) has no stability promise. Don't import from termpilot in your own code; talk to it over MCP.
