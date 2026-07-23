---
name: Public vs protected API routes
description: Pattern for keeping form question data accessible to unauthenticated public apply pages
---

The festival app has public apply forms (/apply/vendor, /apply/sponsor, /apply/volunteer) that are unauthenticated. These pages need festival settings (form questions) but the /api/settings endpoint uses requireStaff middleware.

**Rule:** Any data needed by unauthenticated pages must be served from /api/public/* routes with no auth middleware.

**Solution used:** Added /api/public/form-questions?type=vendor|sponsor|volunteer endpoint in public.ts that returns questions for the active year without any auth check. Apply pages fetch from this endpoint using useQuery + raw fetch instead of useGetSettings.

**Why:** useGetSettings calls /api/settings which returns 401 for unauthenticated users — the Clerk session isn't set up on public pages. This broke the dynamic question loading on all three apply forms.

**How to apply:** If any future feature needs public-facing data that currently lives behind a staff route, add a parallel /api/public/* endpoint rather than relaxing auth on the existing route.
