---
name: Durable code execution limits
description: Notes on test-fixture identifiers in the durable CodeExecution sandbox.
---

When preparing temporary test data in durable CodeExecution, do not rely on global `crypto`, `Math.random()`, or `Date.now()` for a unique identifier.

**Why:** This sandbox may disable those globals despite their availability in ordinary Node.js contexts, causing setup to fail before database callbacks run.

**How to apply:** Prefer a clearly named, fixed development-only fixture with an existence guard and explicit cleanup, or generate an identifier outside the durable sandbox when uniqueness is necessary.