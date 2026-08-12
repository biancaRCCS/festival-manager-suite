import { Router, type IRouter } from "express";
import { db, festivalYearsTable, festivalSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireStaff } from "../lib/auth";
import { GetSettingsQueryParams, UpdateSettingsBody } from "@workspace/api-zod";
import { sendTestEmail, getSmtpStatus } from "../lib/email";

const router: IRouter = Router();

// Convenience: format a settings row into the API response shape
function formatSettings(s: typeof festivalSettingsTable.$inferSelect) {
  return {
    id: s.id,
    yearId: s.yearId,

    // Vendor categories (4)
    vendorTypeLabelMajorFood:    s.vendorTypeLabelMajorFood,
    vendorTypeLabelSpecialtyFood: s.vendorTypeLabelSpecialtyFood,
    vendorTypeLabelRetail:       s.vendorTypeLabelRetail,
    vendorTypeLabelNonprofit:    s.vendorTypeLabelNonprofit,
    vendorPriceMajorFood:    parseFloat(s.vendorPriceMajorFood),
    vendorPriceSpecialtyFood: parseFloat(s.vendorPriceSpecialtyFood),
    vendorPriceRetail:       parseFloat(s.vendorPriceRetail),
    vendorPriceNonprofit:    parseFloat(s.vendorPriceNonprofit),
    vendorSpotLimitMajorFood:    s.vendorSpotLimitMajorFood,
    vendorSpotLimitSpecialtyFood: s.vendorSpotLimitSpecialtyFood,
    vendorSpotLimitRetail:       s.vendorSpotLimitRetail,
    vendorSpotLimitNonprofit:    s.vendorSpotLimitNonprofit,

    // Sponsor tiers — min and max prices
    sponsorPriceBronze:   parseFloat(s.sponsorPriceBronze),
    sponsorPriceSilver:   parseFloat(s.sponsorPriceSilver),
    sponsorPriceGold:     parseFloat(s.sponsorPriceGold),
    sponsorPricePlatinum: parseFloat(s.sponsorPricePlatinum),
    sponsorPriceDiamond:  parseFloat(s.sponsorPriceDiamond),
    sponsorPriceMaxBronze:   parseFloat(s.sponsorPriceMaxBronze),
    sponsorPriceMaxSilver:   parseFloat(s.sponsorPriceMaxSilver),
    sponsorPriceMaxGold:     parseFloat(s.sponsorPriceMaxGold),
    sponsorPriceMaxPlatinum: parseFloat(s.sponsorPriceMaxPlatinum),
    sponsorPriceMaxDiamond:  s.sponsorPriceMaxDiamond != null ? parseFloat(s.sponsorPriceMaxDiamond) : null,
    sponsorSpotLimitBronze:   s.sponsorSpotLimitBronze,
    sponsorSpotLimitSilver:   s.sponsorSpotLimitSilver,
    sponsorSpotLimitGold:     s.sponsorSpotLimitGold,
    sponsorSpotLimitPlatinum: s.sponsorSpotLimitPlatinum,
    sponsorSpotLimitDiamond:  s.sponsorSpotLimitDiamond,

    // Dates & operational settings
    festivalDate:        s.festivalDate ?? null,
    applicationDeadline: s.applicationDeadline ?? null,
    documentDeadline:    s.documentDeadline ?? null,
    paymentWindowDays:   s.paymentWindowDays,
    notificationEmail:   s.notificationEmail ?? null,

    // Form customisation
    vendorFormQuestions:    s.vendorFormQuestions,
    sponsorFormQuestions:   s.sponsorFormQuestions,
    volunteerFormQuestions: s.volunteerFormQuestions,
    sponsorFormDescription:  s.sponsorFormDescription ?? null,
    sponsorFormHeaderImage:  s.sponsorFormHeaderImage ?? null,
    vendorFormDescription:   s.vendorFormDescription ?? null,
    vendorFormHeaderImage:   s.vendorFormHeaderImage ?? null,
  };
}

router.get("/settings", requireStaff, async (req, res): Promise<void> => {
  const queryParsed = GetSettingsQueryParams.safeParse(req.query);
  let yearId: number | undefined = queryParsed.success ? queryParsed.data.yearId : undefined;

  if (!yearId) {
    const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.isActive, true)).limit(1);
    if (years.length === 0) {
      res.status(404).json({ error: "No active festival year" });
      return;
    }
    yearId = years[0].id;
  }

  let settings = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, yearId)).limit(1);

  if (settings.length === 0) {
    // Auto-create default settings for this year
    const [created] = await db.insert(festivalSettingsTable).values({
      yearId,
      festivalDate:        "2026-09-26",
      applicationDeadline: "2026-09-10",
      documentDeadline:    "2026-09-18",
      paymentWindowDays:   7,
      notificationEmail:   "vendors@romaniancenter.org",
      vendorFormQuestions:    [],
      sponsorFormQuestions:   [],
      volunteerFormQuestions: [],
    }).returning();
    settings = [created];
  }

  res.json(formatSettings(settings[0]));
});

router.patch("/settings", requireStaff, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.isActive, true)).limit(1);
  if (years.length === 0) {
    res.status(404).json({ error: "No active festival year" });
    return;
  }
  const yearId = years[0].id;

  const d = parsed.data as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  // Vendor categories
  if (d.vendorTypeLabelMajorFood    != null) updates.vendorTypeLabelMajorFood    = d.vendorTypeLabelMajorFood;
  if (d.vendorTypeLabelSpecialtyFood != null) updates.vendorTypeLabelSpecialtyFood = d.vendorTypeLabelSpecialtyFood;
  if (d.vendorTypeLabelRetail       != null) updates.vendorTypeLabelRetail       = d.vendorTypeLabelRetail;
  if (d.vendorTypeLabelNonprofit    != null) updates.vendorTypeLabelNonprofit    = d.vendorTypeLabelNonprofit;
  if (d.vendorPriceMajorFood    != null) updates.vendorPriceMajorFood    = String(d.vendorPriceMajorFood);
  if (d.vendorPriceSpecialtyFood != null) updates.vendorPriceSpecialtyFood = String(d.vendorPriceSpecialtyFood);
  if (d.vendorPriceRetail       != null) updates.vendorPriceRetail       = String(d.vendorPriceRetail);
  if (d.vendorPriceNonprofit    != null) updates.vendorPriceNonprofit    = String(d.vendorPriceNonprofit);
  if (d.vendorSpotLimitMajorFood    != null) updates.vendorSpotLimitMajorFood    = d.vendorSpotLimitMajorFood;
  if (d.vendorSpotLimitSpecialtyFood != null) updates.vendorSpotLimitSpecialtyFood = d.vendorSpotLimitSpecialtyFood;
  if (d.vendorSpotLimitRetail       != null) updates.vendorSpotLimitRetail       = d.vendorSpotLimitRetail;
  if (d.vendorSpotLimitNonprofit    != null) updates.vendorSpotLimitNonprofit    = d.vendorSpotLimitNonprofit;

  // Sponsor tiers — min prices
  if (d.sponsorPriceBronze   != null) updates.sponsorPriceBronze   = String(d.sponsorPriceBronze);
  if (d.sponsorPriceSilver   != null) updates.sponsorPriceSilver   = String(d.sponsorPriceSilver);
  if (d.sponsorPriceGold     != null) updates.sponsorPriceGold     = String(d.sponsorPriceGold);
  if (d.sponsorPricePlatinum != null) updates.sponsorPricePlatinum = String(d.sponsorPricePlatinum);
  if (d.sponsorPriceDiamond  != null) updates.sponsorPriceDiamond  = String(d.sponsorPriceDiamond);
  // Sponsor tiers — max prices (diamond can be null)
  if (d.sponsorPriceMaxBronze   != null) updates.sponsorPriceMaxBronze   = String(d.sponsorPriceMaxBronze);
  if (d.sponsorPriceMaxSilver   != null) updates.sponsorPriceMaxSilver   = String(d.sponsorPriceMaxSilver);
  if (d.sponsorPriceMaxGold     != null) updates.sponsorPriceMaxGold     = String(d.sponsorPriceMaxGold);
  if (d.sponsorPriceMaxPlatinum != null) updates.sponsorPriceMaxPlatinum = String(d.sponsorPriceMaxPlatinum);
  if ("sponsorPriceMaxDiamond" in d) updates.sponsorPriceMaxDiamond = d.sponsorPriceMaxDiamond != null ? String(d.sponsorPriceMaxDiamond) : null;
  // Sponsor spot limits
  if (d.sponsorSpotLimitBronze   != null) updates.sponsorSpotLimitBronze   = d.sponsorSpotLimitBronze;
  if (d.sponsorSpotLimitSilver   != null) updates.sponsorSpotLimitSilver   = d.sponsorSpotLimitSilver;
  if (d.sponsorSpotLimitGold     != null) updates.sponsorSpotLimitGold     = d.sponsorSpotLimitGold;
  if (d.sponsorSpotLimitPlatinum != null) updates.sponsorSpotLimitPlatinum = d.sponsorSpotLimitPlatinum;
  if (d.sponsorSpotLimitDiamond  != null) updates.sponsorSpotLimitDiamond  = d.sponsorSpotLimitDiamond;

  // Dates & operational settings (all nullable)
  if ("festivalDate"        in d) updates.festivalDate        = d.festivalDate        ?? null;
  if ("applicationDeadline" in d) updates.applicationDeadline = d.applicationDeadline ?? null;
  if ("documentDeadline"    in d) updates.documentDeadline    = d.documentDeadline    ?? null;
  if (d.paymentWindowDays   != null) updates.paymentWindowDays = d.paymentWindowDays;
  if ("notificationEmail"   in d) updates.notificationEmail   = d.notificationEmail   ?? null;

  // Form customisation
  if (d.vendorFormQuestions    != null) updates.vendorFormQuestions    = d.vendorFormQuestions;
  if (d.sponsorFormQuestions   != null) updates.sponsorFormQuestions   = d.sponsorFormQuestions;
  if (d.volunteerFormQuestions != null) updates.volunteerFormQuestions = d.volunteerFormQuestions;
  if ("sponsorFormDescription" in d) updates.sponsorFormDescription  = d.sponsorFormDescription  ?? null;
  if ("sponsorFormHeaderImage" in d) updates.sponsorFormHeaderImage  = d.sponsorFormHeaderImage  ?? null;
  if ("vendorFormDescription"  in d) updates.vendorFormDescription   = d.vendorFormDescription   ?? null;
  if ("vendorFormHeaderImage"  in d) updates.vendorFormHeaderImage   = d.vendorFormHeaderImage   ?? null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db.update(festivalSettingsTable)
    .set(updates)
    .where(eq(festivalSettingsTable.yearId, yearId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Settings not found for active year" });
    return;
  }

  res.json(formatSettings(updated));
});

router.get("/settings/smtp-status", requireStaff, (req, res): void => {
  const status = getSmtpStatus();
  res.json(status);
});

router.post("/settings/test-email", requireStaff, async (req, res): Promise<void> => {
  // Get the notification email from settings for the active year
  const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.isActive, true)).limit(1);
  if (years.length === 0) {
    res.status(404).json({ error: "No active festival year" });
    return;
  }
  const yearId = years[0].id;

  const settingsRows = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, yearId)).limit(1);
  if (settingsRows.length === 0) {
    res.status(404).json({ error: "Settings not found for active year" });
    return;
  }

  const notificationEmail = settingsRows[0].notificationEmail;
  if (!notificationEmail) {
    res.status(400).json({ error: "No notification email configured in Settings" });
    return;
  }

  try {
    await sendTestEmail(notificationEmail);
    res.json({ ok: true, sentTo: notificationEmail });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
