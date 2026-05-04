# Getting started

This page gets termpilot running and connected to your MCP client. By the end, your agent will be able to open a terminal session, type a command, and read the result.

## Requirements

- Node.js 20 or newer. We test on 20 LTS and 22 LTS.
- A C++ toolchain. `node-pty` builds a native module on install.
  - macOS: `xcode-select --install`
  - Debian/Ubuntu: `sudo apt-get install build-essential python3`
  - Fedora/RHEL: `sudo dnf install gcc-c++ make python3`
  - Windows: install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) with the "Desktop development with C++" workload.
- For PNG screenshots, the `canvas` native module also needs Cairo. On Linux: `sudo apt-get install libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`. On macOS, Homebrew installs Cairo as a dependency of `pkg-config`. Windows ships prebuilt binaries via the canvas package.

## Install

```bash
npm install -g @termpilot/server
```

Verify the install:

```bash
termpilot --version
```

The first run takes a few seconds because Node compiles the native modules.

## Configure your MCP client

### Claude Code

```bash
claude mcp add termpilot termpilot
```

That adds termpilot to the project-local config. Use `--scope user` to make it available everywhere.

To pass environment variables (recommended for security policy):

```bash
claude mcp add termpilot \
  -e TERMPILOT_WORKSPACE_ROOT=/Users/you/projects/myapp \
  -e TERMPILOT_POLICY=warn \
  -e TERMPILOT_AUDIT_LOG=/tmp/termpilot-audit.jsonl \
  -- termpilot
```

### Claude Desktop

Open `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add:

```json
{
  "mcpServers": {
    "termpilot": {
      "command": "termpilot",
      "env": {
        "TERMPILOT_WORKSPACE_ROOT": "/Users/you/projects",
        "TERMPILOT_POLICY": "warn"
      }
    }
  }
}
```

Restart Claude Desktop.

### Cursor

Settings → MCP → Add new MCP Server. Name: `termpilot`. Command: `termpilot`. Add env vars in the UI.

### VS Code (Copilot or extension that supports MCP)

```bash
code --add-mcp '{"name":"termpilot","command":"termpilot"}'
```

### Generic MCP client

Use the standard config:

```json
{
  "mcpServers": {
    "termpilot": {
      "command": "termpilot"
    }
  }
}
```

## First session

In your MCP client, ask:

> Use termpilot to run `echo hello` in a fresh bash session and tell me what came back.

The agent should call `terminal_run`, get a snapshot back, and report `hello`. If it doesn't, something is wrong with the install, see [Troubleshooting](#troubleshooting).

## A more interesting session

> Use termpilot to start an interactive Python REPL. Then evaluate `import numpy; numpy.array([1,2,3]).sum()`. Tell me what you see.

The agent should call `terminal_open` with `python3 -i`, then `terminal_type` to send the expression with submit, then `terminal_wait_for` with a `prompt` predicate, then `terminal_snapshot` to read the result.

## Configuration

All configuration is via environment variables. See the table in the [main README](../README.md#configuration) for the full list. The two most useful for getting started:

- `TERMPILOT_WORKSPACE_ROOT`: confine all sessions to a single project directory. Defaults to the directory where `termpilot` is launched.
- `TERMPILOT_POLICY`: `warn` (default) detects dangerous patterns and refuses obvious bad ones, `allowlist` only permits commands you list, `denylist` blocks commands you list, `unrestricted` does no filtering. See [security.md](security.md).

## Troubleshooting

**`node-pty` install fails with a compilation error.** You're missing a build toolchain. Re-read the Requirements section above and install the right one for your platform.

**`canvas` install fails with a missing Cairo / Pango error.** You're missing native graphics libraries. On Linux, the `apt-get` line above installs them. If you don't need screenshots, you can `npm install --omit=optional` and the screenshot tool will return an error explaining the situation.

**The agent says "I don't have access to a terminal tool."** The MCP server isn't connected. In Claude Code, run `claude mcp list` and confirm `termpilot` shows up. In Claude Desktop, check the developer console for connection errors.

**Tools take 30 seconds to respond on the first call.** The first PTY spawn loads native modules. Subsequent calls are fast. If it's still slow after that, file an issue with your platform details.

**Commands silently fail.** Check the audit log if you've enabled it (`TERMPILOT_AUDIT_LOG`). Otherwise, set `TERMPILOT_LOG_LEVEL=debug` and rerun, termpilot logs every refused command to stderr.

For anything else, file an issue with the platform, Node version, the exact command that failed, and what you expected.
