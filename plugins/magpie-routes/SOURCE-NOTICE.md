# Upstream source and artwork

This plugin adapts the routing stage proportions, account-row anatomy, flight-layer approach, play/fly/pose/home choreography and beating-wing carrier artwork from `yetone/magpie`, Copyright (c) 2026 yetone, MIT License. The complete license is included in MAGPIE-LICENSE.txt.

Reference revision: f2b4b98948d0aeb7f1baa3929aeb6ead0d679437

- `internal/gui/assets/plugins/routing/client.js`: route graph, multi-route staging and account/model seat identity; FLIER artwork, flight geometry and timings (request → held packet → reply / failover); logoed/renderSteps story anatomy and source wording helpers (affinity/rules/rest/failover/subagents/auxiliary purposes); timeParts/timeSaid/timeElement and original timing DOM.
- `internal/gui/assets/plugins/routing/routing.css`: stage, account rows, wire layers, flap animation, original narrative hierarchy, 400ms caption fade/rise and inline stacked timing bar/phase legend.
- `internal/gui/assets/context.js`: context map/grid, largest-remainder cells, squarify and item grouping, cache, contents filters, folded state and session trend. Adapted for plugin lifecycle cleanup and gateway metadata-only interactions.
- `internal/gui/assets/context.css`: scoped context card geometry and data colors; fills adapted to Token Monitor material.
- `internal/gui/assets/i18n.js`: Traditional Chinese routing, timing and context labels.
- `internal/gui/assets/purposes.js`: auxiliary request purpose names used by routing explanations.
- `internal/gui/assets/icons/`: the vendor mark set at the reference revision, minus the app icons (`app-*`, `icon-512.png`, `apple-touch-icon.png`). Colour slugs and the raster set render as images; every other slug is a mono mask. `rtk.png` is treated as a raster even though Magpie's `pngIcons` omits it, because masking a PNG draws nothing. User pictures served as `file:` icons are not bundled. `magpie.svg` and `magpie-identity.png` retain the Magpie bird artwork; `t3code.svg` retains its upstream attribution comment. Bundling a mark does not transfer its ownership to this plugin.

The shared trace backend is this plugin's implementation. Notch and Edge Dock are independent layouts designed for Token Monitor's native containers; they are not copies of Magpie's desktop page. This is a Token Monitor community integration maintained by Javis, not an official Magpie plugin.

Localization: English keys and available zh/zh-TW wording are derived from the same upstream i18n source. Additional plugin labels are translated locally; missing Simplified entries are adapted from Traditional Chinese using system ICU with regional terminology reviewed. No translation service is called at runtime.
