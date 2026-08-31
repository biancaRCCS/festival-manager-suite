---
name: In-kind sponsor accounting
description: Durable rules for keeping donated goods and services separate from sponsor cash payments.
---

An in-kind sponsorship fulfills the sponsor workflow while preserving the chosen tier and declared value, but it must not create payment evidence or enter cash revenue.

**Why:** Staff need the operational workflow to treat the sponsorship as fulfilled without overstating cash received or leaving an old pay-first Stripe link usable.

**How to apply:** Before marking an unpaid sponsor in-kind, safely invalidate any open checkout. Block later checkout, payment-link, manual-payment, and stale webhook paths. Show the contribution clearly and report its value separately from cash totals.