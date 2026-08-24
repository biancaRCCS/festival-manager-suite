---
name: OpenAPI format codegen
description: Compatibility rule for URL and email fields in the OpenAPI-to-Zod generation pipeline.
---

Do not use OpenAPI `format: uri` or `format: email` for new URL or email fields in this project’s shared API spec until the generator’s Zod output is compatible with the installed Zod version.

**Why:** The current generator emits `zod.url()` and `zod.email()` for those formats, while the installed Zod runtime exposes validation through different APIs. This makes the generated library fail TypeScript compilation.

**How to apply:** Model the field as a string (or nullable string) in the contract, then validate accepted URL or email values explicitly in the API route. Keep client-side link rendering defensive as well.