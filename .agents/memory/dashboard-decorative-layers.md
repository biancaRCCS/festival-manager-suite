---
name: Dashboard decorative layers
description: Layout constraint for decorative overlay elements in dashboard cards.
---

Do not rely on a utility-only positioning class for a decorative dashboard overlay when its layout participation can affect the card’s content. Prefer removing non-essential decoration or explicitly verify that it is out of document flow.

**Why:** A decorative full-height noise layer unexpectedly consumed the countdown card’s full height, pushed its content below the card, and the card’s overflow clipping made the populated countdown appear blank.

**How to apply:** When adding decoration to a card, browser-test the final layout at staff-dashboard width and confirm the card content’s top offset remains within the card bounds.