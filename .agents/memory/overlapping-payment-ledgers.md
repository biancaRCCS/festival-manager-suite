---
name: Overlapping payment ledgers
description: Financial-state rules when staff-recorded payments and Stripe settlements can coexist.
---

Keep manual and Stripe settlement evidence in separate fields. Recording an offline payment must not overwrite Stripe amounts, dates, or identifiers, and reporting must total actual received amounts rather than configured prices.

**Why:** A pending Stripe checkout can settle before, during, or after a staff member records or removes an offline payment. Treating either source as the single payment state can lose evidence, move an applicant backward, or under/overstate revenue.

**How to apply:** Use conditional transactional updates for staff payment actions, store the exact prior workflow status, and restore it only when no later Stripe settlement requires the record to remain paid. Show both sources when both exist.

Application-flow completion must be evidence-driven, never inferred from status order. A payment step is complete only when Stripe settlement evidence or an active manual-payment record exists, and its displayed date must come from that payment evidence.

**Why:** Workflow statuses can advance independently or contain legacy inconsistencies; position-based steppers can falsely claim that money was received.

**How to apply:** Give each flow step its own timestamp/evidence field. Missing evidence always renders an incomplete, dateless step even when later steps have evidence.

Stripe webhook events must treat payment state and application workflow state as separate dimensions. Synchronous settlement, ACH success, and ACH failure may record payment evidence, amounts, or failure details, but may only change status while the record is still in a payment-stage status.

**Why:** Legacy applicants can finish later workflow stages before a delayed Stripe or ACH event arrives; letting that event set a payment status sends completed applicants backwards and can re-enable applicant-facing email actions.

**How to apply:** Preserve every non-payment-stage status during webhook handling, including completed and rejected states. Gate email-triggering review actions on stage timestamps as well as status.