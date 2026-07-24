import { Router, type IRouter } from "express";
import { db, vendorsTable, sponsorsTable, festivalYearsTable, festivalSettingsTable, activityLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SignPortalAgreementBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/portal/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const vendors = await db.select().from(vendorsTable).where(eq(vendorsTable.portalToken, token)).limit(1);
  if (vendors.length > 0) {
    const vendor = vendors[0];
    const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, vendor.yearId)).limit(1);
    const settingsRows = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, vendor.yearId)).limit(1);
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
      vendorPriceFood:        settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceFood)        : null,
      vendorPriceCrafts:      settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceCrafts)      : null,
      vendorPriceMerchandise: settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceMerchandise) : null,
      vendorPriceCultural:    settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceCultural)    : null,
      vendorPriceOther:       settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceOther)       : null,
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
    const s = settingsRows[0];
    res.json({
      type: "sponsor",
      id: sponsor.id,
      name: sponsor.name,
      businessName: null,
      orgName: sponsor.orgName,
      status: sponsor.status,
      agreementSigned: sponsor.agreementSigned,
      spotNumber: sponsor.spotNumber ?? null,
      location: sponsor.location ?? null,
      festivalYear: years[0]?.eventName ?? "",
      eventDate: years[0]?.eventDate ?? "",
      tier: sponsor.tier,
      vendorType: null,
      vendorPriceFood: null,
      vendorPriceCrafts: null,
      vendorPriceMerchandise: null,
      vendorPriceCultural: null,
      vendorPriceOther: null,
      sponsorPriceBronze: s ? parseFloat(s.sponsorPriceBronze) : null,
      sponsorPriceSilver: s ? parseFloat(s.sponsorPriceSilver) : null,
      sponsorPriceGold: s ? parseFloat(s.sponsorPriceGold) : null,
      sponsorPricePlatinum: s ? parseFloat(s.sponsorPricePlatinum) : null,
      sponsorPriceDiamond: s ? parseFloat(s.sponsorPriceDiamond) : null,
    });
    return;
  }

  res.status(404).json({ error: "Portal not found" });
});

router.post("/portal/:token/sign-agreement", async (req, res): Promise<void> => {
  const { token } = req.params;
  const parsed = SignPortalAgreementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const vendors = await db.select().from(vendorsTable).where(eq(vendorsTable.portalToken, token)).limit(1);
  if (vendors.length > 0) {
    const [updated] = await db.update(vendorsTable)
      .set({ agreementSigned: true, agreementSignedName: parsed.data.signedName })
      .where(eq(vendorsTable.portalToken, token))
      .returning();
    const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, updated.yearId)).limit(1);
    const settingsRows = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, updated.yearId)).limit(1);
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
      vendorPriceFood:        settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceFood)        : null,
      vendorPriceCrafts:      settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceCrafts)      : null,
      vendorPriceMerchandise: settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceMerchandise) : null,
      vendorPriceCultural:    settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceCultural)    : null,
      vendorPriceOther:       settingsRows[0] ? parseFloat(settingsRows[0].vendorPriceOther)       : null,
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
    const [updated] = await db.update(sponsorsTable)
      .set({ agreementSigned: true, agreementSignedName: parsed.data.signedName })
      .where(eq(sponsorsTable.portalToken, token))
      .returning();
    const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, updated.yearId)).limit(1);
    const settingsRows = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, updated.yearId)).limit(1);
    const s = settingsRows[0];
    res.json({
      type: "sponsor",
      id: updated.id,
      name: updated.name,
      businessName: null,
      orgName: updated.orgName,
      status: updated.status,
      agreementSigned: updated.agreementSigned,
      spotNumber: updated.spotNumber ?? null,
      location: updated.location ?? null,
      festivalYear: years[0]?.eventName ?? "",
      eventDate: years[0]?.eventDate ?? "",
      tier: updated.tier,
      vendorType: null,
      vendorPriceFood: null,
      vendorPriceCrafts: null,
      vendorPriceMerchandise: null,
      vendorPriceCultural: null,
      vendorPriceOther: null,
      sponsorPriceBronze: s ? parseFloat(s.sponsorPriceBronze) : null,
      sponsorPriceSilver: s ? parseFloat(s.sponsorPriceSilver) : null,
      sponsorPriceGold: s ? parseFloat(s.sponsorPriceGold) : null,
      sponsorPricePlatinum: s ? parseFloat(s.sponsorPricePlatinum) : null,
      sponsorPriceDiamond: s ? parseFloat(s.sponsorPriceDiamond) : null,
    });
    return;
  }

  res.status(404).json({ error: "Portal not found" });
});

router.post("/portal/:token/checkout", async (req, res): Promise<void> => {
  const { token } = req.params;

  // Try to find the entity
  const vendors = await db.select().from(vendorsTable).where(eq(vendorsTable.portalToken, token)).limit(1);
  const sponsors = await db.select().from(sponsorsTable).where(eq(sponsorsTable.portalToken, token)).limit(1);

  const entity = vendors[0] ?? sponsors[0];
  const entityType = vendors.length > 0 ? "vendor" : "sponsor";

  if (!entity) {
    res.status(404).json({ error: "Portal not found" });
    return;
  }

  // Get Stripe integration
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
