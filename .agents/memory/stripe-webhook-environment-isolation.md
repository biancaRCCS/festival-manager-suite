---
name: Stripe webhook environment isolation
description: Prevent development restarts from changing production Stripe webhook delivery.
---

Development and production must use isolated Stripe webhook registrations when they share a Stripe account. A development process must never reconcile or delete the production webhook endpoint.

An existing enabled managed Stripe webhook may keep its old event subscription list. Do not assume a library upgrade or application restart refreshed `enabled_events`; verify newly required events in Stripe.

**Why:** Managed webhook reconciliation is endpoint-aware and can treat the other environment's endpoint as stale. Restarting development can therefore remove the production endpoint and replace it with a development URL. The managed webhook helper returns an already-enabled endpoint without updating its subscribed events.

**How to apply:** Make webhook setup environment-aware before starting it outside production; use separate Stripe accounts, explicitly scoped managed-webhook metadata, or a configuration switch that disables managed webhook reconciliation in development. When adding a handler, verify the production endpoint subscribes to that event; update it manually or recreate it through the production-only manager.