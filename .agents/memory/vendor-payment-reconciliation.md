---
name: Vendor payment reconciliation
description: Rules for keeping vendor price changes financially safe around Stripe Checkout.
---

Vendor category and discount changes must use one cents-based calculation and be tied to the currently tracked Checkout and a persisted settled amount. Expire or detach an open Checkout before changing an unpaid vendor's price; fulfillment must only apply while that exact Checkout is still the active payment-pending state. Reusing an open Checkout requires its actual currency and total—not only metadata—to match current pricing. A 100% discount completes as a zero-dollar obligation when Stripe reports `no_payment_required`. After a paid category correction, staff must record the manual collection or refund before another paid correction uses a new settled baseline.

**Why:** Stripe can complete or retry delivery after staff has changed a category. Treating every later event as current can restore an obsolete price or overwrite a manually reconciled amount.

**How to apply:** Any future vendor pricing change must increment the pricing revision, invalidate an attached outdated Checkout, calculate and round in cents, and preserve the settled baseline until an explicit manual adjustment settlement is recorded.