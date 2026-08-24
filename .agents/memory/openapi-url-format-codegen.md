---
name: OpenAPI URL format codegen
description: Compatibility rule for URL fields in the OpenAPI-to-Zod generation pipeline.
---

Do not use OpenAPI `format: uri` for a new URL field in this project’s shared API spec until the generator’s Zod output is compatible with the installed Zod version.

**Why:** The current generator emits `zod.url()` for that format, while the installed Zod runtime exposes URL validation through a different API. This makes the generated library fail TypeScript compilation.

**How to apply:** Model the field as a nullable string in the contract and validate acceptable `http`/`https` URLs in the API route. Keep client-side link rendering defensive as well.