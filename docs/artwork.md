# Artwork sources

| Asset | Source | Treatment |
| --- | --- | --- |
| `.github/assets/app.png` | Token Monitor app identity from its main repository | Root README header. |
| `plugins/magpie-routes/assets/magpie-identity.png` | Magpie identity from the source below | Shared by the plugin and its README header; no duplicate in a root artwork folder. |
| Magpie bird and adapted vendor marks | [yetone/magpie](https://github.com/yetone/magpie/tree/f2b4b98948d0aeb7f1baa3929aeb6ead0d679437), MIT | Original notices retained; SVG/PNG bytes preserved. |

Detailed per-module and asset attribution is in [SOURCE-NOTICE.md](../plugins/magpie-routes/SOURCE-NOTICE.md); the upstream license is in [MAGPIE-LICENSE.txt](../plugins/magpie-routes/MAGPIE-LICENSE.txt). Keep both in every package. Vendor marks are identifiers, not endorsements or newly authored artwork.

Plugin README screenshots in `plugins/magpie-routes/docs/images/` are real app captures supplied by the maintainer, with account identifiers already blurred. They illustrate the main window, Notch and Edge Dock. Synthetic Chromium fixture screenshots are kept separately under ignored `_local/verification/` and never overwrite these images. No third-party pet sprites are included.
