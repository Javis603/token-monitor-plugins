<p align="right">
  <strong>EN</strong> | <a href="./README.zh-CN.md">简</a> | <a href="./README.zh-TW.md">繁</a> | <a href="./README.ko.md">KO</a> | <a href="./README.ja.md">JA</a> | <a href="./README.pt-BR.md">PT</a>
</p>

<div align="center">
  <img src=".github/assets/app.png" alt="Token Monitor Community Plugins" width="120">
  <h1>Token Monitor Community Plugins</h1>
  <p><em>Optional extensions, released independently of the app.</em></p>
</div>

## About

Community-maintained plugins for [Token Monitor](https://github.com/Javis603/token-monitor). Each plugin has its own version, README, compatibility requirements and license notices.

| Plugin | Description | Version |
| --- | --- | --- |
| [Magpie Routes](plugins/magpie-routes/README.md) | Live local routing and context views. | `0.1.0` |
| [Antigravity Account Ledger](plugins/antigravity-account-ledger/README.md) | Per-Google-account token usage, USD cost breakdown and custom date ranges for Antigravity. | `0.1.0` |

## Installation

Import a complete plugin folder or `.tmplugin` through **Settings → Plugins → Install from file**, review it and enable it. Check the plugin’s README for supported app versions, platforms and setup. Users do not need a separate Node.js installation.

## Development

Development tools require Node 22.15+. There are no npm runtime dependencies. Build commands reuse a Token Monitor checkout’s package validator; `--local-only` outputs test packages without publishing.

```sh
npm ci --ignore-scripts
npm test
npm run check -- --host /path/to/token-monitor
npm run build -- --host /path/to/token-monitor --local-only
```

## Documentation

- [Maintenance and publishing](docs/releasing.md)
- [Verification scope](docs/verification.md)
- [Changelog](plugins/magpie-routes/CHANGELOG.md)

## License

Original code and documentation use [MIT](LICENSE). Third-party licenses and attribution are listed in [NOTICE](NOTICE.md).
