---
name: In-kind sponsor accounting
description: Durable rules for keeping donated goods and services separate from sponsor cash payments.
---

An in-kind sponsorship fulfills the sponsor workflow while preserving the chosen tier. Its cash sponsorship amount is zero, while its estimated value is stored and reported separately; it must not create payment evidence or enter cash revenue.

**Why:** Staff need the operational workflow to treat the sponsorship as fulfilled without overstating cash received or leaving an old pay-first Stripe link usable.

**How to apply:** Before marking an unpaid sponsor in-kind, safely invalidate any open checkout. Set cash amount to zero without revalidating or changing the tier, store the estimate separately, and block all later cash-payment paths.