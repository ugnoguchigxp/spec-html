# Contributing

English | [日本語](./CONTRIBUTING.ja.md)

Spec HTML turns LLM-generated design documents and specifications into structured HTML that can be read comfortably in a local browser. Contributions should preserve that focused, local-viewer model and the security assumptions described in the README.

## Development environment

- Node.js 20.19+, 22.16+, or 24+
- Bun 1.3+ for compatibility checks
- npm
- Chromium, Firefox, and WebKit for browser tests

```bash
npm ci
npx playwright install chromium firefox webkit
npm run check
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Lint source, tests, and scripts |
| `npm test` | Run unit and server integration tests |
| `npm run test:coverage` | Run Node-side tests with enforced coverage thresholds |
| `npm run build` | Build the CLI and browser assets in `dist` |
| `npm run fix:check` | Check repository HTML for unambiguous fixable typos |
| `npm run test:browser` | Run all viewer tests in Chromium and smoke tests in Firefox/WebKit |
| `npm run test:pack` | Install the tarball in a separate project and test the CLI |
| `npm run check` | Run the complete local quality suite |

CI additionally runs the typecheck and tests with `bun --bun`, then builds and
executes the packed viewer directly with Bun.

## Project layout

```text
src/                 TypeScript source
tests/unit/          Pure unit tests
tests/server/        Local HTTP server tests
tests/browser/       Playwright tests
scripts/             Build and test scripts
docs/                User guides, showcases, and internal notes
examples/            Example specifications
dist/                Generated package files
```

Do not edit `dist` directly; generate it with `npm run build`. Keep Chart.js and Mermaid as optional peer dependencies, and do not bundle them into the package.

## Change checklist

1. Update the README or authoring guide for user-visible behavior.
2. Add a regression test.
3. Run `npm run check`.
4. Run `npm run test:pack` when the package contents or consumer behavior changes.
5. Add user-visible changes to `CHANGELOG.md`.
6. Keep English and Japanese counterparts in sync when editing bilingual documentation. The changelog is English-only.

Publishing is a maintainer operation. Follow [RELEASING.md](./RELEASING.md); do not bypass its validation or publish from an unreviewed working tree.

## Security

The viewer is intended for trusted local HTML and permits inline scripts. Changes to this assumption require a compatibility and security review. Add regression coverage for changes involving path resolution, iframes, script execution, or network binding.
