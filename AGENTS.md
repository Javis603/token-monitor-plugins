# AGENTS.md

Shared guidance for coding agents working in this repository. Plugin-specific guidance lives in `plugins/<id>/AGENTS.md`: read it before changing that plugin. Process lives in `docs/`; this file only holds commands and the constraints a change elsewhere would break silently.

## Commands

```sh
npm ci --ignore-scripts
npm test
npm run check -- --host /path/to/token-monitor
npm run build -- --host /path/to/token-monitor --local-only
TOKEN_MONITOR_CHECKOUT=/path/to/token-monitor /path/to/token-monitor/node_modules/.bin/electron tests/ui-smoke.cjs
```

CI (`verify.yml`) runs `npm test` and `npm run check` on Node 22 and 24. The Electron smoke test is not in CI: run it for any UI change, and read its screenshots in `_local/verification/` (gitignored). `npm run check` and the build need a Token Monitor checkout as `--host`. → `docs/releasing.md`, `docs/verification.md`

## Tripwires

- **Merging publishes.** `publish.yml` runs on every push to `main`, so merging a version bump releases it to the catalog at once. Never merge, enable auto-merge or push to `main` yourself.
- **Bump the version only in the PR that ships.** Published packages are immutable: the same version with different bytes stops publication. Local test builds never get their own version; `build` refuses to overwrite a file, so use a fresh output directory instead. A Token Monitor host update is no reason to bump: run `npm run check -- --host` first and change the plugin only if it fails. → `docs/releasing.md`
- **A shipped version needs all six changelogs.** `CHANGELOG.md`, `.zh-CN`, `.zh-TW`, `.ko`, `.ja` and `.pt-BR`, each with a `## <version>` section. The catalog reads them from the package bytes. Update the READMEs when behaviour they describe changes.
- **Package every file.** A module, stylesheet or asset the plugin loads must be listed in its manifest (`files`, and `css` for stylesheets). `npm run check` rejects an import that is not packaged.
- **The host contract is a floor.** Magpie Routes needs `context.headerActions` and host 0.81.0 or newer. Keep the manifest, the catalog `--app-range` in `publish.yml` and the docs in step if it changes.
- **This repository is public.** No local paths, accounts, tokens, private screenshots or personal workflow in code, tests, docs, commits or PR text.
- **Keep upstream attribution.** Keep each plugin's `LICENSE`, upstream license file and `SOURCE-NOTICE.md`. Cite an upstream revision by its full 40-character SHA; a mistyped short one stops resolving.
- **Titles are conventional.** `type(scope): subject` with the plugin id as scope, for example `fix(magpie-routes): ...`, as in the history.

Update the narrowest document in the same change when one of these goes stale, and delete a claim rather than append a correction.
