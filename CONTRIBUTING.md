# Contributing

Thanks for your interest in contributing to youtube-for-ai-agents!

## Contributor License Agreement

By submitting a pull request, you agree to the terms of the [Contributor License Agreement](CLA.md). This CLA grants the project owner the right to relicense contributions and use them commercially. Please read it before contributing.

## Getting Started

1. Fork and clone the repo
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Test locally: `claude --plugin-dir .`

## Development

The source code is in `src/` and compiles to `dist/`. Always run `npm run build` after making changes. Use `npm run dev` for watch mode during development.

The `dist/` directory is gitignored — don't commit build artifacts.

## Pull Requests

- Keep changes focused. One feature or fix per PR.
- Describe what you changed and why.
- Make sure `npm run build` passes before submitting.
- Test your changes manually with Claude Code.
- By submitting a PR, you agree to the [CLA](CLA.md).

## Adding a Tool

1. Create a new file in `src/tools/` with a zod input schema and handler function
2. Register the tool in `src/index.ts`
3. Update the tools table in `README.md`
4. Run `npm run build` and test

## Reporting Issues

Use the GitHub issue templates for bug reports and feature requests.
