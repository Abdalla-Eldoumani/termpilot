# Changelog

All notable changes to termpilot are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows semantic versioning.

## [0.1.0-alpha.0] - 2026-05-04

The first public alpha. Stdio-only MCP server with the ten core tools, default-conservative security posture, and platform coverage for Linux, macOS, and Windows on Node 20 and 22.

### Added

- Ten MCP tools, each with a Zod-validated input schema and a JSON Schema generated for the protocol surface.
  - `terminal_open`: spawn a session with optional `args`, `cwd`, `env`, `cols`, `rows`, `name`, `prompt_regex`. Returns the initial snapshot with the session id.
  - `terminal_close`: terminate a session. SIGTERM with a two-second SIGKILL escalation. Returns the final snapshot.
  - `terminal_list`: enumerate active and recently-exited sessions. Returns YAML metadata only, never buffer contents.
  - `terminal_resize`: change `cols` and `rows`. Returns an updated snapshot.
  - `terminal_type`: send literal text to a session. Optional `submit: true` appends a carriage return.
  - `terminal_press`: send named keys (Enter, Tab, Esc, Backspace, Delete, arrows, Home, End, PageUp, PageDown, F1-F12, Shift-Tab, Ctrl-X, Alt-X).
  - `terminal_snapshot`: capture screen state as YAML with stable line refs. Optional `include_styles`, `max_lines`, `since_last`.
  - `terminal_wait_for`: block until a predicate matches (`text`, `regex`, `prompt`, `idle`, `exit`, `any_of`, `all_of`). Returns the snapshot at fire time; throws on timeout with the snapshot in the error.
  - `terminal_screenshot`: render the current buffer to PNG. Themes `dark` and `light`, optional `font_size` and `font_family`. Honors 256-color and truecolor cells plus bold/italic/underline/inverse.
  - `terminal_run`: open + optional input + wait + close in one call. Default predicate is `exit`, default timeout 60 seconds.
- Security posture, documented in `SECURITY.md` and `docs/security.md`.
  - Policy modes: `unrestricted`, `warn` (default), `denylist`, `allowlist`.
  - Workspace containment via realpath comparison (symlink-resistant).
  - Privileged-command refusal on `sudo`, `doas`, `su`, `pkexec`, `runuser`, even in `unrestricted` mode unless `TERMPILOT_ALLOW_PRIVILEGED=true`.
  - Dangerous-pattern detector: `rm -rf` (combined- and split-flag), fork bombs, `dd` to/from block devices, `mkfs` on `/dev/`, `chmod -R 000 /`, pipe-to-shell from network, redirects to block devices, system power-off commands.
  - Resource caps: `TERMPILOT_MAX_SESSIONS` (default 16), `TERMPILOT_MAX_OUTPUT_BYTES` (default 1 MiB), `TERMPILOT_SESSION_TIMEOUT_MS` (default 30 minutes).
  - Environment allowlist: only `PATH`, `HOME`, `USER`, `LANG`, `LC_ALL`, `TERM`, `SHELL` inherit by default; user-provided env always overrides.
  - Append-only JSONL audit log when `TERMPILOT_AUDIT_LOG` is set; one entry per refused attempt and one entry per session exit with `exit_code` and `duration_ms`.
- Cross-platform support: macOS (arm64, x64), Linux (x64, arm64), Windows (ConPTY).
- Public docs: `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, plus `docs/getting-started.md`, `docs/tool-reference.md`, `docs/security.md`, `docs/recipes.md`, `docs/architecture.md`, `docs/faq.md`.
- CI matrix on GitHub Actions: Linux, macOS, Windows × Node 20 and 22.
- Release workflow that publishes to npm with `--provenance` on tag push.

### Known limitations

- No per-process CPU or memory rlimits; deferred to v0.2.
- No network-egress block; document network-namespace and container recipes instead.
- Stdio only; Streamable HTTP transport deferred to v0.2.
- No daemon mode; one MCP client owns one termpilot process.
- Snapshot cursor visibility always reports `true`; runtime visibility detection deferred.

[0.1.0-alpha.0]: https://github.com/your-username/termpilot/releases/tag/v0.1.0-alpha.0
[Unreleased]: https://github.com/your-username/termpilot/compare/v0.1.0-alpha.0...HEAD
