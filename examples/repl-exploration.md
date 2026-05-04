# Recipe: REPL exploration

**Goal**: Let an agent explore an unfamiliar Python library by typing expressions and reading results.

**MCP servers needed**: termpilot only.

**MCP client config**:

```json
{
  "mcpServers": {
    "termpilot": {
      "command": "termpilot",
      "env": {
        "TERMPILOT_WORKSPACE_ROOT": "/Users/you/sandbox",
        "TERMPILOT_POLICY": "warn"
      }
    }
  }
}
```

**Agent prompt**:

> Use termpilot to start an interactive Python REPL. Import the `pathlib` module and explore what `Path.home()` returns. Then list the contents of that directory using pathlib (skipping hidden files). Tell me what you find. Close the session when done.

**Expected tool sequence**:

1. `terminal_open`, `command: "python3"`, `args: ["-i"]`. Returns session id and initial snapshot showing the Python banner.
2. `terminal_type`, `text: "from pathlib import Path"`, `submit: true`.
3. `terminal_wait_for`, `predicate: { type: "prompt" }`.
4. `terminal_type`, `text: "Path.home()"`, `submit: true`.
5. `terminal_wait_for`, `predicate: { type: "prompt" }`.
6. `terminal_snapshot`, `since_last: true`. Reads the result.
7. Repeat steps 4 through 6 with `[p.name for p in Path.home().iterdir() if not p.name.startswith('.')]`.
8. `terminal_close`.

**What this teaches**: deterministic interactive flows. Each input is paired with a `wait_for(prompt)` so the agent never reads stale output. `since_last: true` keeps each snapshot small.
