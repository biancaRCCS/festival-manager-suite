---
name: Annual festival rollover
description: Preserve historical festival records, avoid inventing deadlines, and retain guide links during festival-year changes.
---

Create a separate active festival year rather than changing the year or event date on the previous year's record. Leave prior-year applications and payment history associated with their original year. Do not silently transplant prior-year application, document, or artwork deadlines. Keep existing PDF guide links accessible until the user is ready to update the PDFs, even though their printed dates are still from the previous year.

**Why:** The user explicitly chose activating 2027 while preserving 2026 records. The user then explicitly confirmed the guide information is otherwise unchanged and asked to leave its links up while they change the dates later.

**How to apply:** For future rollovers, configure the new year's event date independently and leave unspecified deadlines unset. Do not remove the existing guide links merely because the year changes; let the user control when to replace those files. Verify the active year separately in development and the published app, as publishing code does not copy development data to production.

**Mobile guide exception:** The user confirmed that the 2027 mobile guide does not exist yet and asked to hide only its link while retaining the component and desktop guide link.

**Why:** The unavailable mobile guide must not be offered to visitors; the desktop guide should remain accessible.

**How to apply:** Restore the mobile link only when its replacement file is available, not merely because the desktop guide or festival year changes.