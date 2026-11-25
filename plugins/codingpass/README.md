# CodingPass

Shows your [CodingPass](https://codingpass.ai) allowance in Token Monitor's Limits views: 5-hour, weekly and monthly usage with reset times, plus the plan name, plan period end, allowance-reset credits and the pay-as-you-go wallet balance.

This is an unofficial integration. CodingPass has no API-key quota endpoint, so the plugin reads the same console API that `codingpass.ai/app` uses, with your browser session Cookie. A site update can break it.

## Compatibility and installation

Requires **Token Monitor 0.88.0 or later**. Tested on Windows 11; macOS and Linux are untested.

Install it from **Settings → Plugins → Discover**, or import the `.tmplugin` file or the complete plugin folder through **Settings → Plugins → Install from file**. Review the package and enable it.

## Setup

1. Open **Settings → AI Tool Limits**, check **CodingPass** and expand it.
2. In your browser, sign in to `https://codingpass.ai/app`, open the developer tools (F12) → **Network**, and refresh the page.
3. Select the `usage` (or `state`) request, then copy the full `Cookie` value under **Request Headers**.
4. Paste it into **Console Cookie header** and save. The plugin verifies it; the status turns **Connected** when it works.

The Limits page then shows the 5-hour, weekly and monthly windows. A window without a cap is listed as a note instead of a bar, and the 5-hour window shows no reset time until a request opens it. If the status turns **Credentials rejected** or **Credentials expired**, your website session has ended: copy a fresh Cookie.

## Data and access

- Network: only `https://codingpass.ai`, when a visible Token Monitor quota surface requests a reading or you verify the Cookie.

  | Request | Purpose |
  | --- | --- |
  | `GET /api/auth/state` | Cookie verification (a `userId` means signed in) |
  | `POST /api/app/usage` | Allowance windows, live counters, subscription |
  | `POST /api/app/wallet` | Pay-as-you-go wallet balance (optional) |

- Credential: the Cookie header you paste. Token Monitor stores it on this computer **without encryption** and the plugin sends it only to codingpass.ai. It is equivalent to your signed-in session; do not share it.
- The plugin reads no local files and sends nothing anywhere else.

## License

[MIT](LICENSE). CodingPass is a third-party service; its name and mark identify the service and do not imply endorsement.
