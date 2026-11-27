# Contributing

Thanks for helping make **YouTube for AI Agents** better.

## Contributor License Agreement

By submitting a pull request, you agree to the [Contributor License Agreement](CLA.md), which lets the project owner relicense contributions and use them commercially. Please read it first.

## Ways to contribute

- **Fix a bug** — browse the [open issues](https://github.com/JCodesMore/youtube-for-ai-agents/issues)
- **Add or improve a tool** in `src/tools/`
- **Improve agent support** for Claude Code, Codex, Cursor, OpenCode or Gemini CLI
- **Improve the skill or docs** — `skills/youtube/SKILL.md`, the README, or `docs/`

For bigger or breaking changes, open an issue first so we can agree on the approach.

## Development setup

Needs [Node.js](https://nodejs.org/) 22+.

```bash
git clone https://github.com/YOUR-USERNAME/youtube-for-ai-agents.git
cd youtube-for-ai-agents
npm install
npm run check
```

Try your change in a real agent:

```bash
claude --plugin-dir .
```

[AGENTS.md](AGENTS.md) explains how the code fits together and the constraints that aren't obvious, among them why `dist/` is committed and why there's no lockfile.

## Submitting a pull request

1. Branch off `main` (for example `fix/transcript-language` or `feat/chapters-tool`).
2. Make one focused change.
3. Run `npm run check` and commit the rebuilt `dist/` with your source change.
4. Add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) for anything users will notice.
5. Open a PR against `main` and fill in the template. Prefixes like `fix:`, `feat:` or `docs:` in commit messages are welcome.

## Questions

Ask in the [Discord community](https://discord.gg/babcVNJBet).
