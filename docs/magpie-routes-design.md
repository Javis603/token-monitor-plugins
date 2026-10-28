# Magpie Routes surface design

One shared loopback backend supplies the page, Notch, Dock card and compact rail. Views subscribe to projected trace metadata; they do not request model responses or persist route history.

## Host boundaries

The host owns headings, materials, padding and header action outlets. Page, Notch and Dock card require `context.headerActions`; the compact rail does not. A missing outlet reports the host requirement instead of adding a second toolbar or modifying the host.

The Notch body uses a bounded route stage and outcome/statistics footer. The Dock card reports intrinsic content size through the host's bubble sizing service. The rail has a separate compact presentation. Each view cleans up its controls, observers and subscriptions when disposed.

## State and motion

Stable keyed route nodes retain concurrent flights across unrelated trace updates. Selecting a historical request stops following live data; expired selections return to live. Account masking is shared across surfaces, but affects display only.

The original Magpie carrier animation follows request, hold, reply and failover states. Completed historical requests do not manufacture flights; visibility, connectivity and reduced motion stop animation.

SVG viewBoxes use untransformed layout dimensions. Node screen coordinates are mapped back through the SVG screen matrix. This keeps birds at their intended size and wires aligned while Notch animates its parent scale or uses CSS zoom; sampling transformed bounds as the viewBox would retain the opening scale after the shell expands.

Upstream source and artwork attribution remains in [SOURCE-NOTICE.md](../plugins/magpie-routes/SOURCE-NOTICE.md). Validation scope and outstanding native acceptance checks are in [verification.md](verification.md).
