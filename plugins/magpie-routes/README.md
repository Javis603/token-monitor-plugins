# Magpie Routes

Live local Magpie routing, context summaries and recent requests in Token Monitor.

### Main window

![Main window](docs/images/page.png)

### Notch

![Notch](docs/images/notch.png)

### Edge Dock

![Edge Dock](docs/images/edge-dock.png)

## Compatibility and installation

Requires Token Monitor **0.81.0 or later**. Install Token Monitor and run Magpie on the same computer. Import the complete plugin folder or `.tmplugin` through **Settings → Plugins → Install from file**, review it and enable it. No separate Node.js installation is needed. Notch is available on supported Macs.

## Views

**Main page**: route graph, decision narrative, timing, context and recent requests. Select a request to pin it, then return to live.

**Notch**: live routing, agent filter, account masking and statistics using the host header controls; requires a supported macOS host.

**Edge Dock**: compact icon and request count, with a route/account view in the expanded card.

These three locations are suggested on first install and can be changed or cleared in the installation review. Updates preserve existing locations and do not turn on Notch, Dock or background execution automatically.

## Settings

Use the plugin settings to choose a port. Leave it at `0` to use the port from Magpie’s configuration, or `3425` when none is configured.

Account names are masked by default, with the same setting shared across views. You can select a recent request to pin it or return to the live view. When Magpie is offline, the plugin keeps the last data and reconnects automatically.

The interface supports English, Traditional Chinese and Simplified Chinese; other app languages use English.

## Data and execution

The plugin reads routing, concurrency and context metadata from local Magpie. It does not send model requests, read request/response bodies, change Magpie accounts or routing settings, or save route history to disk.

Account masking affects display only. Metadata may include tool names or file paths. The plugin runs with the local user’s permissions.

## License and maintenance

A Token Monitor community integration, **not an official Magpie product**. Some code and artwork are adapted from [yetone/magpie](https://github.com/yetone/magpie). Original code uses [MIT](LICENSE); upstream attribution and license details are in [SOURCE-NOTICE.md](SOURCE-NOTICE.md) and [MAGPIE-LICENSE.txt](MAGPIE-LICENSE.txt).

[Changelog](CHANGELOG.md) · [All plugins](../../README.md)
