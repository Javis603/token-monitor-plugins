# Publishing plugins

Each plugin belongs in `plugins/<id>/`, with its own manifest, README, localized changelogs and license notices.

Run `npm test` and `npm run check -- --host /path/to/token-monitor` before packaging. `npm run build -- --host /path/to/token-monitor --local-only` creates local test packages. Catalog generation requires actual repository/package URLs and a tested app compatibility range. No automatic publication is configured.
