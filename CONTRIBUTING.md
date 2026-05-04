# Contributing to termpilot

Thanks for your interest. termpilot is a small project with a focused scope, so the contribution bar is "make the tool better for the people who already use it" rather than "add new things."

## Before you open a PR

1. **For non-trivial changes, open an issue first.** A short discussion saves both of us time. Trivial means: typos, broken links, comment fixes, single-line bug fixes with an obvious regression test. Everything else benefits from a paragraph of "here's what I want to do and why."
2. **Run the test suite.** `npm test` should pass on your machine. If it doesn't, mention that in the PR.
3. **Run the type checker.** `npm run check` must be clean.
4. **Match the voice.** termpilot's docs and code comments are written in plain prose. No marketing words, no "delightful" or "seamless" or "unleash," no em dashes, no AI-tell phrases. Read a few existing files before contributing your first one.

## Commit discipline

We commit atomically. One file or one logically inseparable change per commit. A commit message is a brief, lowercase, present-tense description of what the commit does. Examples:

```
add wait_for predicate evaluator
fix prompt detection for zsh starship themes
document workspace_root resolution under symlinks
```

No emojis in commit messages. No "feat:" / "fix:" prefixes; the message itself describes what the commit does. If your change spans multiple files because the change is genuinely indivisible (renaming a function and updating its callers), one commit is fine. If it spans multiple files because you batched two changes together, split them.

## Code style

- TypeScript. ESM (`"type": "module"`). `strict: true` in tsconfig.
- Two spaces for indentation. No tabs.
- Use Biome for formatting and linting. `npm run format` writes; `npm run lint` checks.
- Comments explain why, not what. The code says what.
- No emojis in source code or comments.
- Function names describe behavior, not implementation. `closeIdleSessions` not `runCleanupTimer`.
- Prefer small, named functions over inline lambdas in hot paths.

## Testing

Two test layers:

- **Unit tests** in `test/unit/`. Pure functions, no IO. Mock the PTY layer.
- **Integration tests** in `test/integration/`. Spawn real PTYs, drive real shells. Skip on platforms where the dependencies aren't installed (use `describe.skipIf(...)`).

Add tests for every behavior change. Bug fixes need a regression test that fails before the fix and passes after.

## Documentation

If you change behavior, update the corresponding doc in `docs/`. If you add a new tool, add it to `docs/tool-reference.md` with the input schema and an example. If you change a default, update `README.md`.

Documentation is part of the change, not a follow-up.

## What gets rejected

- Changes that broaden the threat surface without an opt-in flag (e.g., adding a network listener, relaxing a default policy).
- New tools that duplicate something the agent can already do by composing existing tools.
- Dependencies added without a clear reason. Every `npm install` increases the supply-chain attack surface.
- AI-generated PRs that haven't been reviewed by a human author. Use AI to draft; ship with intent.
- Style-only refactors of code you didn't otherwise touch.

## What gets fast-tracked

- Security fixes
- Test coverage improvements
- Cross-platform fixes (Windows, in particular, is under-tested)
- Performance regressions caught with benchmarks
- Documentation that fixes confusion users have actually reported

## Code of conduct

Be respectful. No personal attacks, no harassment, no bigotry. Disagreements about code are normal and welcome. Disagreements about people are not. Maintainers reserve the right to remove comments and ban users who can't follow this.

## License

By contributing, you agree your contributions are licensed under the MIT License (the same as the project).
