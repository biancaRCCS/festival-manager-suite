---
name: DB schema rebuild after new tables
description: Required step after adding new Drizzle schema files to lib/db
---

After writing new schema files to lib/db/src/schema/ and exporting them from lib/db/src/schema/index.ts, the TypeScript declarations for @workspace/db are stale. The api-server's typecheck will fail with "Module '@workspace/db' has no exported member 'vendorsTable'" (etc).

**Rule:** After any change to lib/db/src/schema/ or lib/db/src/index.ts, run `pnpm run typecheck:libs` (which runs `tsc --build`) from workspace root before typechecking any consumer package.

**Why:** The monorepo uses TypeScript project references. The built declarations in lib/db/dist/ must be regenerated for downstream packages to see the new exports. Without this, tsc in api-server resolves @workspace/db to stale .d.ts files.

**How to apply:** Immediately after schema file changes: `pnpm run typecheck:libs && pnpm --filter @workspace/api-server run typecheck`.
