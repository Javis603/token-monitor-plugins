# Magpie Routes

Read-only view of Magpie's routing page for the page, Notch, Dock and rail. Repository-wide rules are in the root `AGENTS.md`; the surface design is in `docs/magpie-routes-design.md`.

## Where things live

- `gateway.cjs`: the only way data enters. It projects Magpie's trace and allowance cards onto an allowlist.
- `backend.cjs`, `history.cjs`: loopback reader; retained-day history and the day's account tallies.
- `ui.mjs`: state and actions. `views.mjs`: page, Notch, Dock and rail layouts.
- `request-list.mjs` and `request-list.css`: the Requests and Accounts-and-keys blocks, built from Magpie's own DOM and class names (`rt-*`).
- `model.mjs`, `story.mjs`, `routing-words.mjs`, `flight.mjs`, `context.mjs`: seat state, Magpie's wording, wires and flights, the context card.
- `locales.mjs`: `en`, `zh-TW`, `zh-CN`.

## Tripwires

- **Parity is behaviour, not only layout.** Before changing the UI, read Magpie's `internal/gui/assets/plugins/routing/client.js` and `routing.css` at the revision named in `SOURCE-NOTICE.md`, and port the state rules too. Past gaps were all semantic: a rest belongs to the account or to one model (`restModel`), a rest lifted by hand ends at once (`lifted`), and day tallies carry the latest answer and sign-in refusal. The request list, accounts and masking badge follow a newer revision than the stage, caption and context; `SOURCE-NOTICE.md` says which.
- **Read-only and metadata-only.** Nothing writes to Magpie. A new field in `gateway.cjs` must be display metadata (a count, a name, a time); never a prompt body, session text, masked value or credential. The projection tests in `tests/magpie-routes.test.mjs` pin this.
- **Account masking holds everywhere a name or id can appear.** Text, `title` tooltips, in-flight rows and `w.id` included. Use the `.rr-pii` blur, or leave the name out. The smoke test checks in-flight rows and tooltips.
- **A request is its id and its time.** Ids repeat after a gateway restart: use `requestKey`, never the id alone, for selection, history points, rows and replay flights. History keeps the latest 2,000 by recorded time, not file order.
- **One account key.** `accountKey` in `request-list.mjs` and `key` in `history.cjs` (provider, who and plan) must stay identical, or a day tally and its live rows count one account twice.
- **The request list caches its repaint.** A new input that rows or accounts depend on (the clock, `lifted`, tallies, cards) must be part of the cache key in `render()`, or the list shows stale data until something else changes.
- **The list wakes itself when it must.** The backend only repaints on a gateway push, so a rest that ends, and its countdown, would freeze on an idle gateway. `renderActs()` schedules `restTimer` for the earliest rest end, at most 30 seconds out, and `dispose()` clears it; a replay has its own clock and schedules none.
- **Pausing a replay freezes every loop.** The replay clock and the wire layer run separate animation frames; both must stop, and resuming must not jump ahead.
- **Interactive marks need the keyboard.** Context-history points and similar SVG targets keep their role, `tabindex`, label and Enter/Space handling.
- **New wording goes into all three dictionaries.** Add the key to `en` (value equal to the key), `zh-TW` and `zh-CN`; a test requires the same keys everywhere. Use Magpie's own English wording.
- **Base CSS must not outrank copied Magpie rules.** Glue rules in `request-list.css` are wrapped in `:where()`; Magpie's copied rules keep their selectors and take Token Monitor's theme through the `--rt-*` variables.
- **Decided look (keep unless asked):** the stage, caption and context sit flat on the page; the context card, request list and account list are the only cards. The request list is bounded to 216–420px by the window and draws 100 more rows as it scrolls; it has no sorting or paging. The page has no agent filter (Magpie has none); the Notch keeps its own. Numbers use K, M and B.
- **The Electron smoke test stops at the first failing check.** Fix them one at a time. A new regression check should fail on the code before the fix: confirm that by running it against the old file.
