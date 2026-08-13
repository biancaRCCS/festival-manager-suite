# Festival Manager Suite — Build Specification

**Version 13 · 14 August 2026**
Source: Bia (RCCS) · Sponsor & Vendor Guide 2026, pages 2–3 · working session decisions

This document is the single source of truth for the vendor and sponsor application
rebuild. Read it top to bottom, correct anything wrong, then hand sections to Replit
one at a time.

---

## 1. Open items — resolve before building

These are unresolved or unknown. Nothing below invents an answer for them.

| # | Item | Status |
|---|------|--------|
| 1 | ~~Booth size conflict~~ | **Resolved** — only 10×10 pop-up tents; Major Food Vendors receive a 10′×20′ footprint |
| 2 | ~~Alcohol handling~~ | **Resolved** — separate invited-vendor flow, outside the public application (section 5A) |
| 3 | ~~Sponsor payment timing~~ | **Resolved** — payment after stage 2 approval |
| 4 | ~~Festival date~~ | **Resolved** — Saturday 26 September 2026, 12:00–21:00, Vernon Street Town Square, Downtown Roseville. Applications due 10 September 2026 |
| 5 | ~~Additional insured names~~ | **Resolved** — RCCS Inc. and the City of Roseville (section 4.7A) |
| 6 | ~~Liquor liability requirement~~ | **Resolved** — $1M per occurrence / $2M aggregate, primary and non-contributory (City of Roseville permit application) |
| 9 | ~~Document deadline~~ | **Resolved** — 18 September 2026 |
| 10 | ~~Spot limits per category~~ | **Resolved** — 5 / 15 / 30 / 20, as soft targets (section 3) |
| 11 | **Printed guide correction** — pages 1 and 3 state applications are due 31 August; the deadline is now 10 September. | Needs updating and re-issuing |
| 12 | **Printed guide correction** — the Nonprofit category wording should state that food sales are not permitted in that category. *(The food-truck correction is withdrawn — trucks are no longer excluded.)* | Bia to update guide |
| 13 | **Email sending not working.** Notification and confirmation emails are built and wired into all three forms, but a test submission produced no email. Config is present (SMTP_FROM=vendors@romaniancenter.org, host smtp.gmail.com:587) and SMTP_USER/SMTP_PASS are Boris's. Most likely cause: SMTP_PASS is not a valid Gmail App Password, or Gmail is not authorised to send as vendors@. **Needs Boris.** Diagnose by checking the API server log for "Failed to send email". | Blocked on Boris |
| 14 | **Stripe is in live mode** (`pk_live_…`). Any checkout is a real charge. Switch to test keys before testing payment flows in September. | Before Stripe work |
| 7 | **Font web licensing** for Zamolxis I and Arhaic Romanesc. Neither file carries an embedded license. | Confirm before launch |
| 8 | Legal review of all acknowledgement and agreement language. | Bia confirmed someone will review |

---

## 1A. Timeline — this is the constraint

| Date | Days from 12 Aug 2026 | Event |
|---|---|---|
| Mon 31 Aug 2026 | 19 days | **Sponsor production deadline** — payment and approved logo files required for inclusion in printed materials |
| Thu 10 Sep 2026 | **29 days** | Applications due *(moved from 31 August)* |
| Fri 18 Sep 2026 | 37 days | **Document deadline** — emailed permits, certificates, licenses |
| Sat 26 Sep 2026 | 45 days | **Festival** — 12:00–21:00, Vernon Street Town Square, Downtown Roseville |

Two consequences of moving the application deadline to 10 September:

**The printed guide says 31 August.** Pages 1 and 3 of the 2026 Sponsor & Vendor Guide
both state "Applications due Monday, August 31, 2026." If that guide has already been
distributed, anyone holding a copy has the old date. The guide needs updating, and anyone
already contacted should be told directly.

**The sponsor production deadline does not move.** Payment and approved logo files are
still required by 31 August for inclusion in printed materials — that is a print
production constraint, not an application constraint. A sponsor applying on 10 September
can still sponsor; they receive remaining digital and on-site benefits, as the guide
already states.

**The back end of the schedule tightens.** Only 16 days remain between applications
closing and the festival — the window for assigning spots, collecting permits, and
building the map. That is workable but leaves little slack, so the map work should begin
before applications close rather than after.

The build order in section 7 is superseded by the priorities below.

**Must be live before applications open (target: within one week)**

1. Settings restructure — correct categories, prices, tier ranges, spot limits
2. Vendor form rebuild — fields, conditional logic, acknowledgements, signature
3. Sponsor stage 1 short form — including the variable sponsorship amount
4. Notification emails to vendors@romaniancenter.org
5. Branding fixes — already specified and ready to apply

**Deferred to September — confirmed**

- **File uploads** — replaced this year by the email interim below
- **Sponsor stage 2 detailed form** — only needed once stage 1 applications arrive
- **Variable-amount Stripe checkout** — needed at payment, not at application
- **Special Agreement Vendor flow** — two alcohol vendors, both already known; a signed
  PDF by email covers 2026. Build the flow afterwards for future years.
- **Festival map** — start before applications close, given the 16-day back end
- **Ticket sales** — **out of scope for 2026.** The festival is free this year. Ticketing
  is planned for 2027 and should be specified separately.

### Interim for file uploads — 2026 only

File uploads are the largest technical item in this specification and sit directly on the
critical path. For 2026, replace every upload field with:

- Instructions to email documents to **vendors@romaniancenter.org**
- The document deadline, stated plainly
- A required checkbox acknowledging the requirement and the deadline

All other fields stay on the form, including the **seller's permit number** as text, so
records remain searchable without opening attachments.

This removes the biggest build item from the critical path at the cost of some manual
filing. Uploads get built properly in September, well before permits are needed.

---

## 2. Decisions locked in this session

- Acknowledgements and digital signature move to the **application** stage. Payment stays in the post-approval portal.
- Vendor categories and prices replaced (section 4).
- Sponsor tiers replaced, and tier price becomes a **minimum**, not a fixed amount (section 5).
- General liability requirement: **$1,000,000 per occurrence / $2,000,000 aggregate**,
  with RCCS Inc. and the City of Roseville named as additional insured (section 4.7A).
- Document deadline: **18 September 2026** — one week before the festival, leaving time to
  chase missing paperwork.
- **No spot counts shown to applicants.** Availability is admin-only (section 3).
- Payment deadline: **7 days after approval** this year, 14 days next year — stored as an editable setting, not hardcoded.
- Health permits: each vendor obtains their own. Placer County TFF link shown at the upload field.
- Notification emails to **vendors@romaniancenter.org** on every new application — vendors, sponsors, and volunteers.
- Worker/staff count collected now, unused until next year.
- **Sponsors pay after stage 2 approval**, not after stage 1.
- Alcohol vendors are called **Special Agreement Vendors**.
- Revenue share settlement **is tracked in the app** (section 5A).
- File uploads are deferred for 2026; documents are emailed instead (section 1A).
- The festival is **free to attend in 2026**. Ticketing is a 2027 goal and out of scope.
- **Booth sizes.** Only 10′×10′ pop-up tents are permitted. Major Food Vendors receive a 10′×20′ footprint — either two 10′×10′ tents, or one tent within the larger footprint. All other categories receive a single 10′×10′.
- **Trucks and trailers are not excluded.** Standard booths are 10′×10′ pop-up tents and trucks are not listed as an option, but applicants describe them under "Other" and RCCS decides case by case. *(Changed 14 Aug.)*
- **Tents larger than 10′×10′ require Roseville Fire Marshal approval**, obtained by the vendor.
- **Alcohol vendors are excluded from the public application.** They are managed under individual agreements (revenue share, not a booth fee) via the invited-vendor flow in section 5A.
- No vehicles remain on site. Assigned load-in time, 30 minutes to unload, then move to the free parking structure.
- Water and refrigeration are not provided and are not asked about.
- Zamolxis and Arhaic Romanesc are used **only** for the word "Romanian" in the wordmark.
- Headings use Cormorant Garamond; body text, forms, and tables use Inter. *(Applied 12 Aug.)*
- **Buttons have square corners**, not rounded. Applies to all buttons app-wide.
- Spot limits are **soft targets** that never block an application (section 3).

---

## 3. Settings — replace existing values

The settings table currently holds five vendor types and five sponsor tiers at
placeholder prices. (Those low test prices exist because Stripe was being tested with
a real credit card — they are not real.) Replace as follows.

### Vendor categories

| Category | Fee | Booth | Spots available |
|---|---|---|---|
| Major Food Vendor | $2,000 | 10′ × 20′ footprint | 5 |
| Specialty Food & Beverage Vendor | $600 | 10′ × 10′ | 15 |
| Retail, Artisan & Business Vendor | $300 | 10′ × 10′ | 30 |
| Verified Nonprofit Organization | $150 | 10′ × 10′ | 20 |

### Spot limits are soft, not hard

These are planning targets, not caps. RCCS will accept a 16th specialty vendor if the
festival has room — particularly when other categories are under-subscribed.

**Required behaviour:**

- A full category **never blocks** an application. The form always accepts submissions.
- The admin shows the count per category — applications received against the target — so
  RCCS can see which categories are filling and which have room.
- **Do not display remaining-spot counts to applicants at all** — no "2 spots left",
  no per-category availability, no progress bars. Counts are visible in the admin only.
- Urgency comes from what is already true and already stated: "Space is limited. Apply
  early," the published application deadline, and the plain statement that submission does
  not guarantee acceptance.

### Sponsor tiers — minimum and maximum

| Tier | Range | Availability |
|---|---|---|
| Diamond | $10,000 and above (no maximum) | 3 |
| Platinum | $5,000 – $9,999 | 5 |
| Gold | $3,000 – $4,999 | 10 |
| Silver | $1,500 – $2,999 | 10 |
| Bronze | $750 – $1,499 | 10 |

### Other settings

- Festival date — **Saturday 26 September 2026**, 12:00–21:00
- Location — Vernon Street Town Square, Downtown Roseville, California
- Application deadline — **Thursday 10 September 2026**
- Document deadline — **18 September 2026**
- Sponsor production deadline — **Monday 31 August 2026** (print materials only)
- Payment window after approval — **7 days** (editable)
- Permit upload deadline — not enforced this year; **14 days before the festival** next year
- Notification recipient — vendors@romaniancenter.org
- Insurance requirement text — $1,000,000 / $2,000,000, plus additional insured names once known

---

## 4. Vendor application

Single form. Sections in order. Conditional questions are marked.

### 4.1 Basic Information

- Contact Name — **required**
- Business / Organization Name — **required**
- Email Address — **required**
- Phone Number — **required**
- Website — optional
- Facebook / Instagram — optional

### 4.2 Vendor Category

Dropdown, **required**. Selecting a category reveals its full description, examples,
typical characteristics, and what is not typically included (section 8 holds the text).

Directly beneath the category selector, always visible:

> **Vendor Category Review**
>
> Please select the category that best matches your primary products or services.
>
> All applications are reviewed by the Romanian Community Center of Sacramento (RCCS).
> RCCS reserves the right to assign or adjust your final vendor category based on your
> proposed menu or products, booth footprint, equipment, operational requirements, and
> the overall balance of the festival. If your category is adjusted, we will notify you
> before any fees are due.
>
> Submission of an application does not guarantee acceptance. Applications are reviewed
> for product quality, cultural fit, menu duplication, operating capacity, safety, space
> requirements, and the overall balance of the festival.

### 4.3 Space

- Number of spaces requested — **required** — single or double. Double is priced at 2× the category fee.

Each option must state the physical space included, which differs by category:

| Category | Single | Double |
|---|---|---|
| Major Food Vendor | 10′ × 20′ | 20′ × 20′ |
| Specialty Food & Beverage | 10′ × 10′ | 10′ × 20′ |
| Retail, Artisan & Business | 10′ × 10′ | 10′ × 20′ |
| Verified Nonprofit | 10′ × 10′ | 10′ × 20′ |

### 4.4 Products & Business Information

- **Describe the products or services you plan to offer** — **required** — long text
  *Helper: "Please provide as much detail as possible. Food vendors should include their proposed menu items."*
- **Brief Business Description** — optional — long text
  *Helper: "Tell us about your business. This information may be used for festival marketing if your application is approved."*

### 4.5 Booth & Operational Information

- **What type of setup will you have?** — **required** — Standard 10′×10′ Tent · Other (describe)
  - Options are **Standard 10′×10′ Tent** and **Other (describe)**. Trucks and trailers are not listed as options, but are no longer refused — an applicant with one selects "Other" and describes it, and RCCS decides case by case. *(Changed 14 Aug, per Bia and Boris: better to hear from a vendor than exclude them at the form.)*
  - Standing note: *"Only 10′×10′ pop-up tents are permitted. Major Food Vendors receive a 10′×20′ footprint, which may be used as two 10′×10′ tents or a single tent within the larger space. Any tent larger than 10′×10′ must be approved by the Roseville Fire Marshal, and it is the vendor's responsibility to obtain that approval."*
- **Will you be preparing food on-site?** — Yes / No — *cooking categories only*
- **Will you be using propane?** — Yes / No — *cooking categories only*
  - If Yes: number of tanks, and tank size — *conditional*
- **Will you require electricity?** — Yes / No
  - If Yes: equipment requiring electricity, and total amps needed — *conditional*
  - Standing note beside this question: *"Electrical outlets are available in prime and VIP sponsor locations only. Power is not provided to standard vendor locations. Vendors requiring power should plan to supply their own generator."*
- **Cooking equipment** — checkboxes — **None** · Grill · Flat Top · Fryer · Smoker · Generator · Other — *cooking categories only*
  - Selecting **None** clears and disables the others; selecting any other option clears None.
  - Without a None option, an empty set is ambiguous — no equipment, or question skipped?

> **"Cooking categories"** means **Major Food Vendor and Specialty Food & Beverage Vendor
> only.**
>
> Neither Verified Nonprofit Organizations nor Retail, Artisan & Business vendors may sell
> or prepare food, so they see none of these questions and are not asked for a health
> permit. A nonprofit wishing to sell food must apply under Major Food Vendor or Specialty
> Food & Beverage and pay that category's fee — consistent with the Nonprofit category
> description, which already states that vendors selling prepared food may be reclassified.
- **Number of staff/workers in your booth** — number *(collected for next year's badge planning; not used this year)*
- **Special placement requests** — optional short text
- **Accessibility needs** — optional short text

### 4.6 Contacts

- **Day-of on-site contact** — name and mobile — **required**
- **Backup contact** — name and mobile — **required**

### 4.7 Required Documents — 2026 email version

**For 2026, no files are uploaded through the form.** Section header text:

> **Required Documents**
>
> Please email the documents below to **vendors@romaniancenter.org** by
> **18 September 2026**. Include your business name in the subject line.
> Document uploads will be available directly in this form in future years.

- **Seller's Permit** — required where applicable
  - **Permit number** — text field *(stays on the form; keeps records searchable)*
- **Health Permit** — *cooking categories only* (Major Food and Specialty Food)
  - Link shown here: [Placer County TFF Authorization Form](https://www.placer.ca.gov/DocumentCenter/View/9479/Application-for-TFF-Food-Vendor-Authorization-PDF-Fillable-Form?bidId=)
  - Note: *"Each vendor is responsible for obtaining their own Placer County health permit."*
- **Certificate of Insurance** — see section 4.7A for the full requirement text to display
- **Nonprofit** — *Verified Nonprofit category only*
  - Employer Identification Number (EIN) — **required**
  - IRS Determination Letter — email with the other documents

**Required checkbox:**

- ☐ I understand I must email my required documents to vendors@romaniancenter.org by **18 September 2026**, and that my space may be released if they are not received.

### 4.7A Insurance requirement — text to display on the form

Derived from the City of Roseville Special Event Permit Application, which governs the
event itself. Vendor certificates should satisfy the same standard the City imposes on RCCS.

> **Certificate of Insurance**
>
> All vendors must carry commercial general liability insurance of at least
> **$1,000,000 per occurrence** and **$2,000,000 general aggregate**.
>
> Your certificate must name as additional insured:
>
> - **Romanian Community Center of Sacramento Inc.**
> - **The City of Roseville, its officers, agents, employees and volunteers**
>
> The certificate must be accompanied by an **Additional Insured Endorsement**
> (form CG 20 12 07 98 or equivalent — a blanket endorsement or the relevant section of
> your policy is acceptable). A statement on the certificate alone is **not** sufficient;
> the City does not accept certificate statements in place of the endorsement document.
>
> Also required: a **Waiver of Subrogation Endorsement**, a **Primary and Non-Contributory
> Coverage Endorsement**, and a policy providing **30 days' notice of cancellation**.
>
> Vendors serving or selling alcohol must additionally carry **liquor liability coverage**
> of $1,000,000 per occurrence and $2,000,000 aggregate, primary and non-contributory.

**Note for RCCS:** these requirements come from the City's permit application for the event.
Requiring the same of vendors is prudent and standard, but it is RCCS's decision — worth one
confirming call to the City or to RCCS's broker, particularly on whether vendors must name
the City directly or are covered under RCCS's own policy.

*When uploads are built in September, these fields become upload controls with an
"I will provide prior to the deadline" option, and the email instructions are removed.*

### 4.8 Additional Information

- Have you participated in the Romanian Festival before? — Yes / No
  - If Yes: approximate year(s) — *conditional*
- How did you hear about us? — dropdown or short text
- Additional comments or special requests — optional

### 4.9 Marketing Consent

- ☐ I consent to RCCS using my business name, logo, and description in festival marketing materials.

### 4.10 Vendor Agreement — acknowledgements

Each is a separate required checkbox.

- ☐ I understand that submission of an application does not guarantee acceptance.
- ☐ I understand vendor fees are due only after my application has been approved.
- ☐ I understand payment is due within 7 days of approval, and that my space may be released if payment is not received.
- ☐ I understand booth fees are non-refundable after payment unless otherwise stated by RCCS.
- ☐ I understand I am responsible for providing my own tent, tables, chairs, signage, and all other booth equipment unless otherwise approved by RCCS.
- ☐ I understand that any tent larger than 10′×10′ requires approval from the Roseville Fire Marshal, which I am responsible for obtaining.
- ☐ I understand running water is not provided.
- ☐ I understand electrical outlets are available in prime and VIP sponsor locations only, and that I am responsible for my own power if required.
- ☐ I understand I am responsible for obtaining all permits, licenses, insurance, and approvals required to operate at this event.
- ☐ I understand food vendors must comply with all applicable Placer County Health Department requirements. *(cooking categories only)*
- ☐ I understand I will be assigned a load-in time, that I will have 30 minutes to unload, and that no vehicles may remain on the festival grounds. Vehicles must be moved to the free parking structure.
- ☐ I understand I am responsible for maintaining a clean booth space and removing all trash before leaving the event.
- ☐ I understand RCCS is not responsible for lost, stolen, or damaged property.
- ☐ I understand RCCS reserves the right to approve, deny, or reclassify any application based on the overall needs of the festival.

### 4.11 Signature

- Typed full name — **required**
- Date — auto-filled, displayed
- Submit

### 4.12 After submission

Confirmation page and confirmation email to the applicant.
Notification email to vendors@romaniancenter.org.

---

## 5. Sponsor application — two stages

### 5.0 Sponsor tier benefits — exact text for the form

Transcribed from page 2 of the 2026 Sponsor & Vendor Guide. Display this table on the
sponsor application so applicants can compare tiers. Do not paraphrase, reorder, or invent
benefits. "–" means the tier does not include that benefit.

**Why sponsor** (intro text above the table):

> Sponsors are featured across all of our outreach and marketing: our website, email
> campaigns, social media, printed materials, and on-site signage before, during, and
> after the festival. Vendor booths, by comparison, are not included in any outreach or
> marketing materials. If visibility for your brand matters to you, sponsorship is where
> it happens.

| Benefit | Diamond $10,000+ | Platinum $5,000+ | Gold $3,000+ | Silver $1,500+ | Bronze $750+ |
|---|---|---|---|---|---|
| Availability | 3 | 5 | 10 | 10 | 10 |
| Booth space | VIP location | Prime location | Prime location | Standard location | Standard location |
| Recognition on RCCS & Festival websites | Premier logo & link | Prominent logo & link | Logo & link | Logo & link | Name listing |
| Complimentary 10′×10′ promo booth space | Included | Included | Included | Included | Included |
| Logo on stage LED screen * | Premier display | Prominent display | Standard display | Logo listing | – |
| Recognition in email campaigns | Premier placement | Prominent placement | Grouped logo | Logo listing | – |
| Acknowledgment during the event | Throughout event | Multiple mentions | One mention | – | – |
| Social-media recognition (pre & post) | Dedicated feature | Dedicated post | Individual mention | – | – |
| Company-provided banner near main stage | Included | Included | – | – | – |
| Additional on-site signage at key locations | Premier logo | Prominent logo | – | – | – |
| Post-event thank-you email & social post | Premier mention | Prominent mention | – | – | – |
| Company logo on official event flyer * | Premier logo | Prominent logo | – | – | – |
| Reserved sponsor VIP area seating | 6 Seats | 4 Seats | – | – | – |
| Additional company-provided banner | Included | – | – | – | – |

**Sponsor VIP seating** (note below the table):

> Diamond includes six reserved seats and Platinum sponsorship includes four reserved seats
> in a designated 10′ × 10′ sponsor viewing area. Seating is separate from the sponsor booth
> and does not include food, beverages, parking, or other hospitality unless confirmed by RCCS.

**\* Production deadline** (note below the table):

> Inclusion in printed or finalized promotional materials is subject to receipt of payment
> and approved logo files by Monday, August 31, 2026. Sponsorships confirmed after this
> deadline will receive remaining digital and on-site benefits where feasible.

---

### Stage 1 — short application (public)

- Contact Name — **required**
- Organization / Business Name — **required**
- Email Address — **required** *(the detailed-form link is sent here)*
- Phone Number — **required**
- **Sponsorship tier** — **required** — benefits for each tier displayed on the page
- **Sponsorship amount** — **required** — must be at or above the selected tier's minimum and below the next tier's minimum; Diamond has no maximum
- Have you sponsored the Romanian Festival before? — Yes / No
- Describe your organization or business — long text
- **Do you want a booth at the festival, or sponsorship in name only?** — Booth / Name only
- Submit

**Confirmation message shown after submitting:**

> Thank you for your interest in sponsoring the Romanian Festival. Someone from the
> Romanian Community Center of Sacramento will be in touch within one to two business
> days. If you have any questions in the meantime, please email us at
> vendors@romaniancenter.org.

Notification email to vendors@romaniancenter.org.

### Stage 2 — detailed form (link emailed after acceptance)

Sent to the email address provided in stage 1. Contains the booth and operational
detail plus acknowledgements. For sponsors who requested a booth, this mirrors the
vendor form's sections 4.5 through 4.11. For name-only sponsors, booth and permit
sections are skipped.

Also collected here: logo file upload, for marketing and signage.

### Sponsor flow end to end

1. Stage 1 submitted → notification email → confirmation shown
2. RCCS reviews and accepts in the admin
3. Detailed-form link emailed to the applicant
4. Applicant completes stage 2 and submits
5. RCCS accepts, or requests changes
6. Applicant uploads permits
7. RCCS assigns a spot — **must be possible both before and after permits are uploaded**
8. **Payment — collected after stage 2 is approved**, not after stage 1

**Why payment comes last.** A sponsor's booth entitlement is determined by the detailed
form, not the tier alone. Collecting payment at stage 1 would let someone pay a $750
Bronze sponsorship and then describe a full hot-food operation on the detailed form —
with money already taken and the conversation much harder. Reviewing the detail first
keeps RCCS able to say no, reclassify, or require a separate vendor application before
any money changes hands.

### Sponsor booths are promotional

Every tier includes a complimentary 10′ × 10′ promo booth. This is for promotion and
visibility — it is not a vendor booth and does not carry the right to operate a food
business. A sponsor wishing to sell prepared food must submit a separate vendor
application and pay the applicable vendor category fee.

Add to the stage 2 acknowledgements:

- ☐ I understand that my complimentary sponsor booth is for promotional purposes, and that selling prepared food requires a separate vendor application and vendor fee.

### Production deadline

Inclusion in printed or finalized promotional materials requires payment and approved
logo files by **Monday, 31 August 2026**. Sponsorships confirmed after that date receive
remaining digital and on-site benefits where feasible. Surface this date in the admin
so it is visible while reviewing.

---

## 5A. Special Agreement Vendors

**Category name: Special Agreement Vendor.** Covers alcohol vendors and any future partner
on individually negotiated terms.

These vendors are **not** part of the public vendor application and are not a selectable
category on the form. They are managed under individual agreements: RCCS receives a
percentage of net profits rather than a booth fee.

*2026 note: the two alcohol vendors are already known. Send them a signed PDF this year;
build this flow in September for future years.*

The public form must not offer alcohol as an option, and no acknowledgement should imply
vendors may sell alcohol.

### How it works

1. RCCS adds the vendor manually in the admin — name, organization, email, agreed revenue
   share percentage
2. System emails a private tokenized link — the same mechanism the payment portal already uses
3. The link opens a page containing: the agreement terms, acknowledgements, permit uploads,
   and a typed signature box
4. Vendor signs and uploads
5. RCCS assigns a spot as with any other vendor

**No public application. No category selection. No fee. No Stripe checkout.**

### Fields

- Contact name, organization, email, phone
- Beverage type — beer / wine / other
- Revenue share percentage — set by RCCS, displayed to the vendor
- Day-of on-site contact and backup contact
- **Uploads:** ABC license · Certificate of Insurance including **liquor liability of
  $1,000,000 per occurrence / $2,000,000 aggregate, primary and non-contributory** ·
  Seller's permit · Health permit if serving food
- Acknowledgements — the standard operational set (own equipment, no water, power,
  load-in and vehicles, clean-up, liability, permits and licensing)
- Typed signature and date

### Notes

- Reuses the existing portal token mechanism, so this is a new page on existing plumbing —
  one of the cheaper items in this specification.
- These vendors appear in the normal vendor list and on the festival map, so spot
  assignment and day-of logistics work identically.
### Revenue share tracking

Tracked in the app. Because settlement happens after the festival, this is not on the
critical path and can be built in late September.

Fields on the Special Agreement Vendor record:

- Agreed revenue share percentage
- Reported gross sales
- Reported costs / deductions
- Net profit — calculated
- Amount owed to RCCS — calculated from net profit × percentage
- Amount received, and date received
- Settlement status — awaiting report · calculated · invoiced · paid
- Notes

Admin view: a settlement summary listing every Special Agreement Vendor with their
percentage, net profit, amount owed, amount received, and outstanding balance.

---

## 6. What this requires technically

Ordered by size.

**File uploads — new capability.** The app has no upload feature anywhere today.
Needs storage, upload controls on both forms, and a view of uploaded documents on each
applicant's admin detail page. Largest item in this specification.

**Conditional questions — new capability.** The current custom-questions system shows
every question to everyone. Needs support for "show this only when that answer is X."

**Variable-amount checkout.** Stripe currently charges a fixed per-tier price. Sponsors
must be charged the amount they entered. Vendor doubles must charge 2× the category fee.

**Category and tier restructure.** The settings table has fixed columns per vendor type
and sponsor tier. The new categories and tiers differ in both name and number, so this
is a schema change, not a value edit.

**Two-stage sponsor flow.** The app has one application stage. Sponsors now need a short
public application and a separate detailed form reached by emailed link — similar to the
existing portal token mechanism, which can likely be reused.

**Notification emails.** On every new application, to vendors@romaniancenter.org.

**Signature moves earlier.** Acknowledgements and typed signature now happen at
application, not in the payment portal.

---

## 7. Build order

**Superseded by the timeline in section 1A** — that ordering reflects the 31 August
application deadline and should be followed. The sequence below is the dependency order,
useful for understanding what rests on what.

1. **Settings restructure** — real categories, tiers, prices, spot limits, payment window. Everything else depends on correct numbers.
2. **Branding fixes** — Cormorant Garamond, the Zamolxis wordmark component. Small, visible, already specified in the font instructions file.
3. **Vendor form rebuild** — new fields, conditional logic, acknowledgements, signature. No uploads yet.
4. **Notification emails** — small, and immediately useful.
5. **File uploads** — permits, certificates, logos, plus admin viewing.
6. **Sponsor two-stage flow** — including the variable amount field.
7. **Variable-amount Stripe checkout.**
7a. **Invited-vendor flow** for alcohol vendors (section 5A). Small — build it any time after uploads exist.
8. **Festival map** — spot assignment for vendors and sponsors together. Not started; specify separately.
9. **Ticket sales** — not started; specify separately.

---

## 8. Vendor category reference text

Displayed when a category is selected on the form, and reproduced in the guide.

### 1 · Major Food Vendor — $2,000

**Description.** Designed for high-volume food vendors serving complete meals or
operating large-scale prepared food service.

**Examples.** Romanian grill (mici / mititei) · Sarmale · Romanian barbecue · Traditional
Romanian entrées · Multiple hot meal items · Full-service food vendors · Large prepared
food operations

*Standard booths are 10′×10′ pop-up tents; Major Food Vendors receive a 10′×20′ footprint.
Vendors operating from a truck or trailer should select "Other" on the application and
describe their setup.*

**Typical characteristics.** Complete meal service · Multiple menu items · High customer
volume · Larger staffing requirements · Expanded equipment (grills, smokers, fryers) ·
Larger booth footprint

**Not typically included.** Coffee or espresso vendors · Ice cream or shaved ice ·
Beverage-only vendors · Dessert-focused vendors · Pastries or baked goods only ·
Packaged food products

### 2 · Specialty Food & Beverage Vendor — $600

**Description.** Designed for vendors offering specialty prepared foods, desserts,
beverages, or limited-menu food items.

**Examples.** Coffee & espresso · Tea · Lemonade · Fresh juices · Smoothies · Boba tea ·
Ice cream · Shaved ice · Papanași · Romanian pastries · Cakes · Cookies · Crepes ·
Waffles · Funnel cakes · Specialty desserts · Langoș (limited-menu operation)

**Typical characteristics.** Limited food menu · Dessert or beverage focused · Specialty
prepared foods · Standard booth footprint · Lower operational complexity than major food
vendors

**Not typically included.** Full Romanian entrée menus · Multiple hot meal stations ·
High-volume meal service · Large grill operations · Vendors serving complete meals as
their primary offering

*The guide notes "no more than 2 items" for this category's menu. Alcoholic beverages are
excluded from this category entirely and are managed separately by RCCS under individual
agreements — see section 5A.*

### 3 · Retail, Artisan & Business Vendor — $300

**Description.** Designed for vendors selling merchandise, handmade goods, packaged food
products, or promoting a business or professional service.

**Examples — retail & artisan.** Handmade crafts · Jewelry · Clothing & apparel ·
Romanian souvenirs · Home décor · Artwork · Pottery · Woodworking · Books · Gifts ·
Specialty imported goods · Packaged Romanian foods · Honey · Jams · Candies · Sealed
baked goods

**Examples — business & professional.** Insurance · Real estate · Financial services ·
Healthcare · Education · Home improvement · Technology · Professional services ·
Promotional businesses

**Typical characteristics.** Merchandise sales · Business promotion · Product
demonstrations · No on-site food preparation or beverage service

**Not typically included.** Food prepared or served on-site · Coffee or beverage service ·
Ice cream or shaved ice · Fresh desserts · Hot food vendors

### 4 · Verified Nonprofit Organization — $150

**Description.** Designed for registered nonprofit organizations participating for
community outreach, education, fundraising, or public service.

**Examples.** 501(c)(3) organizations · Cultural organizations · Churches · Educational
organizations · Museums · Youth organizations · Community service organizations · Public
agencies · Humanitarian organizations

**Requirements.** Must provide a valid Employer Identification Number (EIN). RCCS may
request documentation verifying nonprofit status.

**Not typically included.** For-profit businesses · Commercial vendors · Any sale or
on-site preparation of food

**Food is not permitted in this category.** Nonprofits wishing to sell or prepare food must
apply under Major Food Vendor or Specialty Food & Beverage Vendor and pay that category's fee.

---

## 9. General information — shown on both forms

- Vendors provide their own tent, tables, chairs, and equipment.
- Food vendors must obtain all required Placer County permits.
- Running water is not provided.
- Electrical outlets are available in prime and VIP sponsor locations only.
- Vendors obtain all required permits, licenses, and insurance.
- Space is limited. Apply early.

**Questions & how to apply.** vendors@romaniancenter.org · Call or text Bianca
530-721-7007 · Office (916) 604-8482 · romanianfestival.org
