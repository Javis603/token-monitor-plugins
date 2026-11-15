# Changelog

## 0.1.3

Rebuild the main page's Requests and Accounts-and-keys blocks from Magpie's own routing page, and follow Magpie's route stage more closely. Requests sit in a bounded, scrolling card with day pills, a By request/session/key bar, purpose and metrics menus and compact rows (time, agent, model, who answered, numbers, service-tier and TUI tags). Accounts and keys follow Magpie's provider groups, status dots, folds and Show-more list, with one line per allowance window and the reason when an allowance cannot be read. The route story shows Magpie's masking badge, failed steps use its cross mark, session blocks use its layout, and an account that Magpie rests is drawn resting, with no live wire. The stage, caption and context stay flat on the page; the context card, request list and account list are the only cards. The page no longer has an agent filter, which Magpie does not have; the Notch keeps its own. Long histories draw as you scroll, and sorting and paging controls are gone with them.

## 0.1.2

Align the main routing graph with Magpie: route and nested-group headings, keyboard-accessible folding, member order, two-line account details and hierarchical wires. Restore live reply counters and quota, wallet and reserve labels while retaining account masking. Add concurrent-session context summaries, request/session/key grouping, purpose filters, metrics, saved allowance windows, retained-day browsing and recorded-event replay. Routing history and allowance reads remain read-only and metadata-only.

## 0.1.1

Fix the blank DeepSeek Harness icon and source name. Sync routing explanations, context cards, agent marks and Chinese translations with Magpie 9c39edb9; preserve canceled-request status and fall back to a generic mark for unknown icons.

## 0.1.0

Initial release: live Magpie routing, context summaries and recent requests in the main page, Notch and Edge Dock. Account masking is shared across views. Supports English, Traditional Chinese and Simplified Chinese.
