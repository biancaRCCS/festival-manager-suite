---
name: Overlapping payment ledgers
description: Financial-state rules when staff-recorded payments and Stripe settlements can coexist.
---

Keep manual and Stripe settlement evidence in separate fields. Recording an offline payment must not overwrite Stripe amounts, dates, or identifiers, and reporting must total actual received amounts rather than configured prices.

**Why:** A pending Stripe checkout can settle before, during, or after a staff member records or removes an offline payment. Treating either source as the single payment state can lose evidence, move an applicant backward, or under/overstate revenue.

**How to apply:** Use conditional transactional updates for staff payment actions, store the exact prior workflow status, and restore it only when no later Stripe settlement requires the record to remain paid. Show both sources when both exist.