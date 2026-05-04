# Tool reference

Every tool termpilot exposes, with input schemas and return shapes. Tools accept JSON input and return MCP-standard `content` arrays. Errors are thrown as MCP protocol errors with a descriptive message.

## terminal_open

Spawn a new terminal session.

**Input:**

```json
{
  "command": "bash",
  "args": ["-l"],
  "cwd": "/Users/you/project",
  "env": { "FOO": "bar" },
  "cols": 80,
  "rows": 24,
  "name": "build-server"
}
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `command` | yes |, | The executable. Resolved against PATH unless absolute. Subject to policy. |
| `args` | no | `[]` | Argv. Each element is passed verbatim. |
| `cwd` | no | `TERMPILOT_WORKSPACE_ROOT` | Must resolve under the workspace root. |
| `env` | no | `{}` | Merged on top of the inherited env allowlist. |
| `cols` | no | `80` | Terminal width in columns. |
| `rows` | no | `24` | Terminal height in rows. |
| `name` | no | random `s_xxxxxx` | Optional friendly id. Must be unique. |

**Returns:** YAML snapshot of the new session, including `session.id` to use in subsequent calls.

**Errors:** policy refusal, duplicate name, unresolvable cwd, max-sessions exceeded.

## terminal_snapshot

Capture the current screen state.

**Input:**

```json
{
  "session_id": "s_a3b8c2",
  "include_styles": false,
  "max_lines": 200,
  "since_last": false
}
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `session_id` | yes |, | The id from `terminal_open` or `terminal_list`. |
| `include_styles` | no | `false` | When true, include color/bold runs per line. Costs tokens. |
| `max_lines` | no | `200` | Truncate buffer to the last N lines. |
| `since_last` | no | `false` | When true, return only lines added since the last snapshot of this session. |

**Returns:** YAML matching this shape:

```yaml
session:
  id: s_a3b8c2
  command: python3
  args: [-i]
  pid: 12345
  cwd: /Users/you/project
  cols: 80
  rows: 24
  status: running
  started_at: "2026-05-03T10:30:00Z"
exit: null
cursor: { row: 5, col: 4, visible: true }
buffer:
  - { ref: l1, text: "Python 3.13.0 (main, ...) on darwin" }
  - { ref: l2, text: "Type \"help\", ... for more information." }
  - { ref: l3, text: ">>> import numpy" }
  - { ref: l4, text: ">>> numpy.array([1,2,3]).sum()" }
  - { ref: l5, text: "6" }
  - { ref: l6, text: ">>> ", prompt: true }
prompts: [l6]
since_last: { new_lines: 3, last_input_at: "2026-05-03T10:30:01Z" }
```

Line refs (`l1`, `l2`, ...) are stable within a snapshot. They invalidate when the buffer scrolls or is cleared. Use them in test assertions; don't store them across sessions.

## terminal_type

Send text to a session.

**Input:**

```json
{
  "session_id": "s_a3b8c2",
  "text": "ls -la",
  "submit": true
}
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `session_id` | yes |, | |
| `text` | yes |, | Literal text to type. No CR appended unless `submit: true`. |
| `submit` | no | `false` | When true, append `\r`. Equivalent to pressing Enter at the end. |

**Returns:** brief confirmation. Does not snapshot. Call `terminal_snapshot` after to see the result.

**Errors:** session not found, session exited.

## terminal_press

Send named keys.

**Input:**

```json
{
  "session_id": "s_a3b8c2",
  "keys": ["Ctrl-C"]
}
```

| Field | Required | Notes |
|---|---|---|
| `session_id` | yes | |
| `keys` | yes | Array of key names from the dictionary below. |

**Key dictionary:**

`Enter`, `Tab`, `Esc`, `Backspace`, `Delete`, `Up`, `Down`, `Left`, `Right`, `Home`, `End`, `PageUp`, `PageDown`, `F1` through `F12`, `Ctrl-<char>` (e.g. `Ctrl-C`, `Ctrl-D`, `Ctrl-Z`), `Alt-<char>`, `Shift-Tab`.

Multiple keys in one call are sent in order with no delay. To insert a delay, call `terminal_press` twice.

**Returns:** brief confirmation.

## terminal_wait_for

Block until a predicate becomes true on the session.

**Input:**

```json
{
  "session_id": "s_a3b8c2",
  "predicate": { "type": "text", "match": "READY" },
  "timeout_ms": 5000
}
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `session_id` | yes |, | |
| `predicate` | yes |, | One of the predicate shapes below. |
| `timeout_ms` | no | `5000` | Max wait. Throws on timeout. |

**Predicate shapes:**

```json
{ "type": "text", "match": "READY" }
{ "type": "regex", "pattern": "error\\[E\\d+\\]" }
{ "type": "prompt" }
{ "type": "idle", "ms": 500 }
{ "type": "exit" }
{ "type": "any_of", "predicates": [ ... ] }
{ "type": "all_of", "predicates": [ ... ] }
```

`idle` matches when no new bytes have arrived for the given duration. `prompt` matches the next time the bottom non-empty line looks like a shell prompt (configurable per session via the `prompt_regex` env or runtime override).

**Returns:** YAML snapshot at the moment the predicate fired.

**Errors:** timeout (returns the snapshot at timeout for diagnostic purposes), session not found.

## terminal_screenshot

Render the current buffer to PNG.

**Input:**

```json
{
  "session_id": "s_a3b8c2",
  "font_size": 14,
  "font_family": "Menlo, Consolas, monospace",
  "theme": "dark"
}
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `session_id` | yes |, | |
| `font_size` | no | `14` | Pixels. |
| `font_family` | no | `Menlo, Consolas, monospace` | First-available wins. |
| `theme` | no | `dark` | `dark` or `light`. |

**Returns:** MCP `image` content with base64-encoded PNG, `mimeType: "image/png"`. Dimensions are roughly `cols * font_size * 0.6` wide, `rows * font_size * 1.4` tall.

For pixel-perfect TUI verification (vim, htop, ncurses apps), the screenshot includes ANSI colors, bold, italic, and reverse-video.

## terminal_run

Convenience: open + type + wait_for + close in one call.

**Input:**

```json
{
  "command": "cargo",
  "args": ["build", "--release"],
  "cwd": "/Users/you/project",
  "input": null,
  "wait_for": { "type": "exit" },
  "timeout_ms": 60000
}
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `command`, `args`, `cwd`, `env`, `cols`, `rows` |, | (same as `terminal_open`) | |
| `input` | no | `null` | If non-null, typed (with submit) before waiting. |
| `wait_for` | no | `{type: "exit"}` | Predicate to wait on. Default: process exit. |
| `timeout_ms` | no | `60000` | |

**Returns:** YAML snapshot at the wait_for moment, with the session already closed.

Use this for fire-and-forget commands. For interactive multi-step flows, use `terminal_open` + the granular tools.

## terminal_close

Terminate a session.

**Input:**

```json
{
  "session_id": "s_a3b8c2",
  "signal": "SIGTERM"
}
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `session_id` | yes |, | |
| `signal` | no | `SIGTERM` | One of `SIGTERM`, `SIGKILL`, `SIGINT`, `SIGHUP`. |

If the process doesn't exit within 2 seconds of `SIGTERM`, termpilot escalates to `SIGKILL`.

**Returns:** final YAML snapshot with exit info.

## terminal_list

List active sessions.

**Input:** `{}`

**Returns:** YAML array of session metadata (id, command, pid, started_at, status, cols, rows). No buffer contents.

## terminal_resize

Change session dimensions.

**Input:**

```json
{ "session_id": "s_a3b8c2", "cols": 132, "rows": 50 }
```

The PTY sends `SIGWINCH` to the foreground process, which most TUIs handle gracefully.

**Returns:** updated snapshot.

## Errors

All tool errors come back as MCP protocol errors with a descriptive `message`. Common categories:

| Error message contains | Meaning |
|---|---|
| `policy: refused` | A built-in or configured policy refused the command. See `TERMPILOT_AUDIT_LOG` for the reason. |
| `cwd: outside workspace` | The cwd resolved outside `TERMPILOT_WORKSPACE_ROOT`. |
| `session not found: <id>` | The session_id is wrong, or the session was reaped (timeout or close). |
| `wait_for timeout after <N>ms` | The predicate didn't fire in time. The error includes the final snapshot. |
| `max sessions exceeded (<N>)` | `TERMPILOT_MAX_SESSIONS` reached. Close idle sessions or raise the cap. |

For schema validation errors, the message includes the Zod error path so the agent can correct itself on retry.
