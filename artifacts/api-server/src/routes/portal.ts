import { Router, type IRouter } from "express";
import { db, vendorsTable, sponsorsTable, festivalYearsTable, festivalSettingsTable, activityLogTable } from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";
import { SignPortalAgreementBody, SubmitSpecialAgreementBody, SubmitSponsorDetailsBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { sendSponsorDetailsSubmittedNotification, sendSpecialAgreementSignedNotification } from "../lib/email";

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
    styleGuidelinesUrl: s?.styleGuidelinesUrl ?? null,
  };
}

function buildSpecialAgreementPortalInfo(
  vendor: typeof vendorsTable.$inferSelect,
  year: { eventName: string; eventDate: string } | undefined,
  settings: typeof festivalSettingsTable.$inferSelect | undefined,
) {
  return {
    type: "special_agreement" as const,
    id: vendor.id,
    name: vendor.name,
    businessName: vendor.businessName,
    orgName: null,
    status: vendor.status,
    agreementSigned: vendor.agreementSigned,
    spotNumber: vendor.spotNumber ?? null,
    location: vendor.location ?? null,
    festivalYear: year?.eventName ?? "",
    eventDate: year?.eventDate ?? "",
    tier: null,
    vendorType: vendor.vendorType,
    spacesRequested: null,
    sponsorshipAmount: null,
    boothOrNameOnly: null,
    paymentDeadline: null,
    specialAgreementOperationType: vendor.specialAgreementOperationType ?? null,
    specialAgreementRevenueSharePercentage: vendor.specialAgreementRevenueSharePercentage === null
      ? null
      : Number(vendor.specialAgreementRevenueSharePercentage),
    specialAgreementNetProfitDefinition: settings?.specialAgreementNetProfitDefinition ?? null,
    documentDeadline: settings?.documentDeadline ?? null,
    notificationEmail: settings?.notificationEmail ?? null,
    styleGuidelinesUrl: settings?.styleGuidelinesUrl ?? null,
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
    if (vendor.vendorType === "special_agreement") {
      res.json(buildSpecialAgreementPortalInfo(vendor, years[0], settingsRows[0]));
      return;
    }
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
// POST /portal/:token/special-agreement
// ---------------------------------------------------------------------------
router.post("/portal/:token/special-agreement", async (req, res): Promise<void> => {
  const parsed = SubmitSpecialAgreementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const acknowledgements = {
    ackRevenueShare: parsed.data.ackRevenueShare,
    ackPermitsInsurance: parsed.data.ackPermitsInsurance,
    ackEquipment: parsed.data.ackEquipment,
    ackNoRunningWater: parsed.data.ackNoRunningWater,
    ackPower: parsed.data.ackPower,
    ackLoadInVehicles: parsed.data.ackLoadInVehicles,
    ackCleanUp: parsed.data.ackCleanUp,
    ackPropertyLiability: parsed.data.ackPropertyLiability,
    ackStyleGuidelines: parsed.data.ackStyleGuidelines,
  };
  if (Object.values(acknowledgements).some((value) => !value)) {
    res.status(400).json({ error: "Every Special Agreement acknowledgement must be accepted before signing." });
    return;
  }

  const [vendor] = await db.select().from(vendorsTable)
    .where(eq(vendorsTable.portalToken, req.params.token))
    .limit(1);
  if (!vendor || vendor.vendorType !== "special_agreement") {
    res.status(404).json({ error: "Special Agreement not found" });
    return;
  }
  if (vendor.agreementSigned) {
    res.status(409).json({ error: "This agreement has already been submitted." });
    return;
  }

  const [updated] = await db.update(vendorsTable)
    .set({
      agreementSigned: true,
      agreementSignedName: parsed.data.signedName.trim(),
      specialAgreementDayOfContactName: parsed.data.dayOfContactName.trim(),
      specialAgreementDayOfContactPhone: parsed.data.dayOfContactPhone.trim(),
      specialAgreementBackupContactName: parsed.data.backupContactName.trim(),
      specialAgreementBackupContactPhone: parsed.data.backupContactPhone.trim(),
      specialAgreementAcknowledgements: acknowledgements,
      specialAgreementSignedDate: parsed.data.signedDate.toISOString().slice(0, 10),
      specialAgreementSignedAt: new Date(),
    })
    .where(eq(vendorsTable.id, vendor.id))
    .returning();

  const [year] = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, updated.yearId)).limit(1);
  const [settings] = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, updated.yearId)).limit(1);
  await db.insert(activityLogTable).values({
    type: "special_agreement_signed",
    message: `Special Agreement signed by ${updated.agreementSignedName} for ${updated.name} (${updated.businessName})`,
    entityType: "vendor",
    entityId: updated.id,
  });
  if (settings?.notificationEmail) {
    void sendSpecialAgreementSignedNotification({
      notificationEmail: settings.notificationEmail,
      applicantName: updated.name,
      businessName: updated.businessName,
      signedName: updated.agreementSignedName ?? updated.name,
      adminPath: `/vendors/${updated.id}`,
    });
  }
  res.json(buildSpecialAgreementPortalInfo(updated, year, settings));
});

// ---------------------------------------------------------------------------
// POST /portal/:token/submit-details
// Sponsor stage 2: save details, move to details_submitted, notify RCCS.
// ---------------------------------------------------------------------------
router.post("/portal/:token/submit-details", async (req, res): Promise<void> => {
  const { token } = req.params;
  const parsed = SubmitSponsorDetailsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

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
  const submitted = parsed.data;
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
    .where(and(
      eq(vendorsTable.portalToken, token),
      eq(vendorsTable.agreementSigned, false),
      ne(vendorsTable.vendorType, "special_agreement"),
    ))
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

  // Sponsors no longer sign an agreement through the portal — they accept
  // the acknowledgements and sign electronically at the public apply stage,
  // before payment. If the token belongs to a sponsor, there's nothing to sign.
  const sponsorRows = await db.select({ id: sponsorsTable.id }).from(sponsorsTable).where(eq(sponsorsTable.portalToken, token)).limit(1);
  if (sponsorRows.length > 0) {
    res.status(409).json({ error: "Sponsors sign their agreement at the time of application, not in the portal." });
    return;
  }

  res.status(404).json({ error: "Portal not found" });
});

// ---------------------------------------------------------------------------
// POST /portal/:token/checkout
// ---------------------------------------------------------------------------
router.post("/portal/:token/checkout", async (req, res): Promise<void> => {
  const { token } = req.params;

  const vendors = await db.select().from(vendorsTable).where(eq(vendorsTable.portalToken, token)).limit(1);

  if (vendors[0]?.vendorType === "special_agreement") {
    res.status(409).json({ error: "Special Agreement Vendors do not have a booth fee or online payment." });
    return;
  }

  const entity = vendors[0];

  if (!entity) {
    // Sponsors pay at the time of their public application, not via the portal.
    const sponsorRows = await db.select({ id: sponsorsTable.id }).from(sponsorsTable).where(eq(sponsorsTable.portalToken, token)).limit(1);
    if (sponsorRows.length > 0) {
      res.status(409).json({ error: "Sponsors complete payment during application, not through the portal." });
      return;
    }
    res.status(404).json({ error: "Portal not found" });
    return;
  }

  const stripeModule = await import("./stripe").catch(() => null);
  if (!stripeModule) {
    res.status(503).json({ error: "Payment processing not configured yet" });
    return;
  }

  try {
    const url = await stripeModule.createCheckoutSession({ token, entity, entityType: "vendor" });
    res.json({ checkoutUrl: url });
  } catch (err) {
    logger.error({ err }, "Checkout creation failed");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

export default router;
