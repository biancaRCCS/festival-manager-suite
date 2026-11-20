---
name: PDF title metadata
description: Safely changing browser-tab titles for festival PDF guides without changing their pages.
---

Update both the PDF document title and the XMP title when changing a guide's browser-tab label. Preserve existing XMP namespace declarations.

**Why:** The pypdf 7.1.1 XMP title convenience setter dropped namespace declarations from the PowerPoint-generated guide, producing XML that failed to parse after saving. Editing the existing XML with a namespace-preserving DOM avoided that corruption.

**How to apply:** Reopen any rewritten PDF and check both titles before replacing the public file. Compare page text and rendered-page hashes to ensure a metadata-only edit did not change the guide itself.
