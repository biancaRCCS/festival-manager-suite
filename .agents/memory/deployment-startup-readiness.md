---
name: Deployment startup readiness
description: Keep API health endpoints available promptly during deployment restarts.
---

The API must bind its HTTP listener before starting non-fatal external-service setup such as Stripe migrations, webhook configuration, and backfills.

**Why:** Deployment startup health checks treat an unopened API port as unavailable. Waiting for external setup before listening turned a normal rollout restart into a recorded outage even though the application later recovered.

**How to apply:** Keep lightweight liveness/readiness endpoints independent of optional background initialization. If a capability truly needs initialization before serving a request, gate that capability specifically rather than the entire HTTP server.