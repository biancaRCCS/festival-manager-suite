---
name: Workspace dependency verification
description: Distinguish incomplete workspace linking from actual source errors after filtered dependency updates.
---

After filtered dependency updates, ensure the full workspace is installed from its lockfile before interpreting sibling-package typecheck failures.

**Why:** A filtered update left an untouched sibling unable to resolve Vite's client types; a full frozen-lockfile install restored linking without source changes.

**How to apply:** Preserve the resolved lockfile and complete workspace installation before changing an otherwise untouched package's code or type configuration.
