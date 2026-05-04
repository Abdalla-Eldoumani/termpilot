# Recipe: build verification

**Goal**: Run a build and have the agent report any errors with line refs.

**MCP servers needed**: termpilot only.

**MCP client config**:

```json
{
  "mcpServers": {
    "termpilot": {
      "command": "termpilot",
      "env": {
        "TERMPILOT_WORKSPACE_ROOT": "/Users/you/projects/myproject",
        "TERMPILOT_POLICY": "warn",
        "TERMPILOT_AUDIT_LOG": "/tmp/termpilot-audit.jsonl"
      }
    }
  }
}
```

**Agent prompt**:

> Use termpilot to run `cargo build --release` in `/Users/you/projects/myproject`. If there are compile errors, tell me the line numbers and the error codes. Otherwise, confirm the build succeeded.

**Expected tool sequence**:

1. `terminal_run`, `command: "cargo"`, `args: ["build", "--release"]`, `cwd: "/Users/you/projects/myproject"`, `wait_for: { type: "exit" }`, `timeout_ms: 120000`.
2. Agent inspects the returned snapshot. If `exit.code === 0`, reports success. Otherwise scans the buffer for lines matching `error\[E\d+\]`, reports those with their refs.

**Variant for long builds**: Use `terminal_open` instead of `terminal_run`, then poll with `terminal_snapshot({ since_last: true })` periodically while the build runs. Useful when you want the agent to report progress.

**Variant for incremental builds**: Run twice in a row; second run should be much faster. The agent can verify cache hits by comparing snapshot timings.
