---
name: Stripe webhook environment isolation
description: Prevent development restarts from changing production Stripe webhook delivery.
---

Development and production must use isolated Stripe webhook registrations when they share a Stripe account. A development process must never reconcile or delete the production webhook endpoint.

**Why:** Managed webhook reconciliation is endpoint-aware and can treat the other environment's endpoint as stale. Restarting development can therefore remove the production endpoint and replace it with a development URL.

**How to apply:** Make webhook setup environment-aware before starting it outside production; use separate Stripe accounts, explicitly scoped managed-webhook metadata, or a configuration switch that disables managed webhook reconciliation in development.