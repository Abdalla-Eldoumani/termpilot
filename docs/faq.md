# FAQ

## Why not just use terminalcp?

terminalcp is excellent and well-engineered. The difference is the abstraction level. terminalcp gives you `spawn / write / read` and you build the test logic on top. termpilot gives you `open / type / wait_for / snapshot / screenshot` and you build the workflow on top. If your agent is happy parsing raw scrollback, terminalcp is fewer moving parts. If you want deterministic test sequences with predicates and structured snapshots, termpilot is built for that.

You can also run both at once. They don't conflict.

## Does this replace the QEMU MCP?

No. [`qemu-mcp-server`](https://github.com/Abdalla-Eldoumani/qemu-mcp-server) launches and manages virtual machines, and it ships its own console-driving tools (`send_console_input`, `wait_for_console_output`, `read_console`). For standard OS testing you use qemu-mcp-server end to end inside the VM, and termpilot covers the host side: kernel builds, host test runners, gdb attached to QEMU's gdbserver. See [recipes.md](recipes.md) Recipe 3 for the full composition.

## Can it screenshot a GUI?

For terminal applications (vim, htop, gdb TUI, ncurses installers), yes, `terminal_screenshot` renders the buffer to PNG with full colors and styling.

For actual graphical applications (a browser, a desktop app, a graphical kernel framebuffer), termpilot can't capture those because they don't draw to the terminal. For QEMU graphical-mode VMs specifically, capturing the framebuffer needs a separate tool, qemu-mcp-server doesn't expose framebuffer capture at the moment. For other graphical apps, compose with a desktop-screenshot MCP server.

## Why pin to zod 3.x instead of zod 4?

The MCP SDK's compatibility with zod 4 has had reported issues (description fields not propagating, internal API changes). zod 3 is what most existing MCP servers use today and it works without surprises. We'll move to zod 4 when the ecosystem has converged.

## Does the server work on Windows?

Yes. node-pty supports Windows via ConPTY (Windows 10 build 18309+). The CI matrix includes Windows. That said, a few things that work on macOS/Linux behave differently on Windows: signal semantics (no `SIGTERM`/`SIGKILL` distinction in the same way), default shell (`cmd.exe` or `powershell.exe`), and the C++ build toolchain (Visual Studio Build Tools, not gcc). If you hit a Windows-specific bug, file an issue with your exact platform details.

## How big are snapshots?

For a typical 80x24 terminal with text content, a snapshot YAML runs 200 to 500 tokens. Sparse content drops to under 100 tokens. Dense content with `include_styles: true` can hit 1000+ tokens. Use `since_last: true` and `max_lines` to keep snapshots minimal during long-running sessions.

## How big are screenshots?

A default 80x24 terminal at 14pt monospace produces a roughly 720x480 PNG, around 30 to 80 KB depending on content density. Larger sessions scale linearly. Vision-capable models accept these without trouble; bandwidth is rarely the bottleneck.

## What happens to running sessions when the MCP client restarts?

They're killed. termpilot is single-process; sessions die with the server. If you need persistent sessions, daemon mode is on the roadmap. Until then, design your workflows assuming the agent might lose its session at any tool call.

## Can I run termpilot remotely?

Not in v0.1. The transport is stdio only. v0.2 may add Streamable HTTP with auth.

## Is there a way to share a session between two agents?

No, not in v0.1. Each MCP client connection has its own session manager. This is intentional, it keeps the security model clean. Cross-agent shared state needs a different design than termpilot is going to ship.

## Will termpilot eat my files?

Not by itself. Spawned processes have whatever filesystem access the user running termpilot has. Workspace restriction confines where sessions start, not what processes can subsequently read or write. For real isolation, run termpilot inside a VM or container, see [security.md](security.md) for recipes.

## How do I stop a runaway process?

`terminal_close` with `signal: "SIGKILL"`. Or wait, the idle timeout (default 30 min) reaps sessions automatically. Or close all sessions with `terminal_list` followed by `terminal_close` per session.

## Why does my prompt detector miss zsh prompts?

The default prompt regex is `[$%>#]\s*$`, which catches plain shell prompts. Themed prompts (oh-my-zsh, starship, powerlevel10k) often render extra characters after the prompt symbol or use Unicode glyphs. Pass a custom `prompt_regex` to `terminal_open` to fix it for that session, or set the `TERMPILOT_DEFAULT_PROMPT_REGEX` env var globally.

## Can I record and replay sessions?

Not in v0.1. The audit log records commands but not byte streams. Recording/replay is a planned feature for v0.3.

## Does termpilot use the network?

No. The server itself makes no network calls. It does run commands the agent gives it, and those commands can do whatever they want, including hit the network. If you need to prevent that, run termpilot inside a network namespace or a no-network container. See [security.md](security.md).

## How do I report a security issue?

Email `security@termpilot.dev` (placeholder, see [SECURITY.md](../SECURITY.md) for the real address). Don't open a public issue.

## Can I contribute?

Yes. See [CONTRIBUTING.md](../CONTRIBUTING.md). The short version: open an issue first for non-trivial changes, run tests before submitting, match the existing voice in docs.
