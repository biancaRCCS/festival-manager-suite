import { Router, type IRouter } from "express";
import { db, vendorsTable, sponsorsTable, festivalYearsTable, festivalSettingsTable, activityLogTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { SignPortalAgreementBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { sendSponsorDetailsSubmittedNotification } from "../lib/email";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Shared helper — build the PortalInfo JSON for a sponsor row
// ---------------------------------------------------------------------------
function buildSponsorPortalInfo(
  sponsor: typeof sponsorsTable.$inferSelect,
  year: { eventName: string; eventDate: string } | undefined,
  s: typeof festivalSettingsTable.$inferSelect | undefined,
) {
  return {
    type: "sponsor" as const,
    id: sponsor.id,
    name: sponsor.name,
    businessName: null,
    orgName: sponsor.orgName,
    status: sponsor.status,
    agreementSigned: sponsor.agreementSigned,
    spotNumber: sponsor.spotNumber ?? null,
    location: sponsor.location ?? null,
    festivalYear: year?.eventName ?? "",
    eventDate: year?.eventDate ?? "",
    tier: sponsor.tier,
    vendorType: null,
    spacesRequested: null,
    sponsorshipAmount: sponsor.sponsorshipAmount != null ? parseFloat(sponsor.sponsorshipAmount) : null,
    boothOrNameOnly: ((sponsor.applicationData ?? {}) as Record<string, unknown>).boothOrNameOnly as string | null ?? null,
    paymentDeadline: s?.documentDeadline ?? null,
    vendorPriceMajorFood: null,
    vendorPriceSpecialtyFood: null,
    vendorPriceRetail: null,
    vendorPriceNonprofit: null,
    sponsorPriceBronze: s ? parseFloat(s.sponsorPriceBronze) : null,
    sponsorPriceSilver: s ? parseFloat(s.sponsorPriceSilver) : null,
    sponsorPriceGold: s ? parseFloat(s.sponsorPriceGold) : null,
    sponsorPricePlatinum: s ? parseFloat(s.sponsorPricePlatinum) : null,
    sponsorPriceDiamond: s ? parseFloat(s.sponsorPriceDiamond) : null,
  };
}

// ---------------------------------------------------------------------------
// GET /portal/:token
// ---------------------------------------------------------------------------
router.get("/portal/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const vendors = await db.select().from(vendorsTable).where(eq(vendorsTable.portalToken, token)).limit(1);
  if (vendors.length > 0) {
    const vendor = vendors[0];
    const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, vendor.yearId)).limit(1);
    const settingsRows = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, vendor.yearId)).limit(1);
    const appData = (vendor.applicationData ?? {}) as Record<string, unknown>;
    const spacesRequested = typeof appData.spacesRequested === "string" ? appData.spacesRequested : null;
    res.json({
      type: "vendor",
      id: vendor.id,
      name: vendor.name,
      businessName: vendor.businessName,
      orgName: null,
      status: vendor.status,
      agreementSigned: vendor.agreementSigned,
      spotNumber: vendor.spotNumber ?? null,
      location: vendor.location ?? null,
      festivalYear: years[0]?.eventName ?? "",
      eventDate: years[0]?.eventDate ?? "",
      tier: null,
      vendorType: vendor.vendorType,
      spacesRequested,
      boothOrNameOnly: null,
      paymentDeadline: settingsRows[0]?.documentDeadline ?? null,
      vendorPriceMajorFood:    settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceMajorFood)    : null,
      vendorPriceSpecialtyFood: settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceSpecialtyFood) : null,
      vendorPriceRetail:       settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceRetail)       : null,
      vendorPriceNonprofit:    settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceNonprofit)    : null,
      sponsorPriceBronze: null,
      sponsorPriceSilver: null,
      sponsorPriceGold: null,
      sponsorPricePlatinum: null,
      sponsorPriceDiamond: null,
    });
    return;
  }

  const sponsors = await db.select().from(sponsorsTable).where(eq(sponsorsTable.portalToken, token)).limit(1);
  if (sponsors.length > 0) {
    const sponsor = sponsors[0];
    const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, sponsor.yearId)).limit(1);
    const settingsRows = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, sponsor.yearId)).limit(1);
    res.json(buildSponsorPortalInfo(sponsor, years[0], settingsRows[0]));
    return;
  }

  res.status(404).json({ error: "Portal not found" });
});

// ---------------------------------------------------------------------------
// POST /portal/:token/submit-details
// Sponsor stage 2: save details, move to details_submitted, notify RCCS.
// ---------------------------------------------------------------------------
router.post("/portal/:token/submit-details", async (req, res): Promise<void> => {
  const { token } = req.params;

  const sponsors = await db.select().from(sponsorsTable).where(eq(sponsorsTable.portalToken, token)).limit(1);
  if (sponsors.length === 0) {
    res.status(404).json({ error: "Portal not found" });
    return;
  }
  const sponsor = sponsors[0];

  if (sponsor.status !== "approved") {
    res.status(409).json({
      error: `Details can only be submitted when status is 'approved'. Current status: '${sponsor.status}'`,
    });
    return;
  }

  // Merge submitted stage-2 fields into applicationData
  const existing = (sponsor.applicationData ?? {}) as Record<string, unknown>;
  const submitted = (req.body ?? {}) as Record<string, unknown>;
  const merged = { ...existing, ...submitted, stage2SubmittedAt: new Date().toISOString() };

  const [updated] = await db.update(sponsorsTable)
    .set({
      applicationData: merged,
      status: "details_submitted",
      detailsSubmittedAt: new Date(),
    })
    .where(eq(sponsorsTable.id, sponsor.id))
    .returning();

  if (!updated) {
    res.status(500).json({ error: "Failed to update sponsor record" });
    return;
  }

  await db.insert(activityLogTable).values({
    type: "submitted",
    message: `Sponsor ${updated.name} (${updated.orgName}) submitted stage 2 details`,
    entityType: "sponsor",
    entityId: updated.id,
  });

  // Notify RCCS staff
  const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, updated.yearId)).limit(1);
  const settingsRows = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, updated.yearId)).limit(1);
  const notificationEmail = settingsRows[0]?.notificationEmail;
  if (notificationEmail) {
    sendSponsorDetailsSubmittedNotification({
      notificationEmail,
      applicantName: updated.name,
      orgName: updated.orgName,
      tier: updated.tier,
      sponsorshipAmount: updated.sponsorshipAmount != null ? parseFloat(updated.sponsorshipAmount) : null,
      adminPath: `/sponsors/${updated.id}`,
    });
  }

  res.json(buildSponsorPortalInfo(updated, years[0], settingsRows[0]));
});

// ---------------------------------------------------------------------------
// POST /portal/:token/sign-agreement
// ---------------------------------------------------------------------------
router.post("/portal/:token/sign-agreement", async (req, res): Promise<void> => {
  const { token } = req.params;
  const parsed = SignPortalAgreementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // --- Vendors ---
  const updatedVendors = await db.update(vendorsTable)
    .set({ agreementSigned: true, agreementSignedName: parsed.data.signedName })
    .where(and(eq(vendorsTable.portalToken, token), eq(vendorsTable.agreementSigned, false)))
    .returning();

  if (updatedVendors.length > 0) {
    const updated = updatedVendors[0];
    const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, updated.yearId)).limit(1);
    const settingsRows = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, updated.yearId)).limit(1);
    const updatedAppData = (updated.applicationData ?? {}) as Record<string, unknown>;
    const updatedSpacesRequested = typeof updatedAppData.spacesRequested === "string" ? updatedAppData.spacesRequested : null;
    res.json({
      type: "vendor",
      id: updated.id,
      name: updated.name,
      businessName: updated.businessName,
      orgName: null,
      status: updated.status,
      agreementSigned: updated.agreementSigned,
      spotNumber: updated.spotNumber ?? null,
      location: updated.location ?? null,
      festivalYear: years[0]?.eventName ?? "",
      eventDate: years[0]?.eventDate ?? "",
      tier: null,
      vendorType: updated.vendorType,
      spacesRequested: updatedSpacesRequested,
      boothOrNameOnly: null,
      paymentDeadline: settingsRows[0]?.documentDeadline ?? null,
      vendorPriceMajorFood:    settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceMajorFood)    : null,
      vendorPriceSpecialtyFood: settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceSpecialtyFood) : null,
      vendorPriceRetail:       settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceRetail)       : null,
      vendorPriceNonprofit:    settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceNonprofit)    : null,
      sponsorPriceBronze: null,
      sponsorPriceSilver: null,
      sponsorPriceGold: null,
      sponsorPricePlatinum: null,
      sponsorPriceDiamond: null,
    });
    return;
  }

  // Check if vendor token exists but already signed
  const existingVendors = await db.select({ agreementSigned: vendorsTable.agreementSigned })
    .from(vendorsTable).where(eq(vendorsTable.portalToken, token)).limit(1);
  if (existingVendors.length > 0) {
    res.status(409).json({ error: "Agreement already signed" });
    return;
  }

  // --- Sponsors: only allowed at details_approved or payment_pending ---
  const sponsorRows = await db.select().from(sponsorsTable).where(eq(sponsorsTable.portalToken, token)).limit(1);
  if (sponsorRows.length > 0) {
    const sponsor = sponsorRows[0];
    const allowedStatuses = ["details_approved", "payment_pending"];
    if (!allowedStatuses.includes(sponsor.status)) {
      res.status(409).json({
        error: `Agreement signing is not available yet. Current status: '${sponsor.status}'. Please complete your sponsorship details first.`,
      });
      return;
    }
    if (sponsor.agreementSigned) {
      res.status(409).json({ error: "Agreement already signed" });
      return;
    }

    const updatedSponsors = await db.update(sponsorsTable)
      .set({ agreementSigned: true, agreementSignedName: parsed.data.signedName })
      .where(and(eq(sponsorsTable.portalToken, token), eq(sponsorsTable.agreementSigned, false)))
      .returning();

    if (updatedSponsors.length > 0) {
      const updated = updatedSponsors[0];
      const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, updated.yearId)).limit(1);
      const settingsRows = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, updated.yearId)).limit(1);
      res.json(buildSponsorPortalInfo(updated, years[0], settingsRows[0]));
      return;
    }
  }

  res.status(404).json({ error: "Portal not found" });
});

// ---------------------------------------------------------------------------
// POST /portal/:token/checkout
// ---------------------------------------------------------------------------
router.post("/portal/:token/checkout", async (req, res): Promise<void> => {
  const { token } = req.params;

  const vendors = await db.select().from(vendorsTable).where(eq(vendorsTable.portalToken, token)).limit(1);
  const sponsors = await db.select().from(sponsorsTable).where(eq(sponsorsTable.portalToken, token)).limit(1);

  const entity = vendors[0] ?? sponsors[0];
  const entityType = vendors.length > 0 ? "vendor" : "sponsor";

  if (!entity) {
    res.status(404).json({ error: "Portal not found" });
    return;
  }

  // Sponsors must be at details_approved (or payment_pending if retrying) before checkout
  if (entityType === "sponsor") {
    const allowedStatuses = ["details_approved", "payment_pending"];
    if (!allowedStatuses.includes(entity.status)) {
      res.status(403).json({
        error: `Payment is not available yet. Your sponsorship details must be reviewed and approved before you can complete payment. Current status: '${entity.status}'.`,
      });
      return;
    }
  }

  const stripeModule = await import("./stripe").catch(() => null);
  if (!stripeModule) {
    res.status(503).json({ error: "Payment processing not configured yet" });
    return;
  }

  try {
    const url = await stripeModule.createCheckoutSession({ token, entity, entityType });
    res.json({ checkoutUrl: url });
  } catch (err) {
    logger.error({ err }, "Checkout creation failed");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

export default router;
