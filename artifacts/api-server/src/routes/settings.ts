import { Router, type IRouter } from "express";
import { db, festivalYearsTable, festivalSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireStaff } from "../lib/auth";
import { GetSettingsQueryParams, UpdateSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

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
    // Auto-create default settings
    const [created] = await db.insert(festivalSettingsTable).values({
      yearId,
      vendorPriceFood: "200.00",
      vendorPriceCrafts: "150.00",
      vendorPriceMerchandise: "150.00",
      vendorPriceCultural: "100.00",
      vendorPriceOther: "100.00",
      sponsorPriceBronze: "250.00",
      sponsorPriceSilver: "500.00",
      sponsorPriceGold: "1000.00",
      sponsorPricePlatinum: "2000.00",
      sponsorPriceDiamond: "5000.00",
      vendorSpotLimitFood: 20,
      vendorSpotLimitCrafts: 15,
      vendorSpotLimitMerchandise: 15,
      vendorSpotLimitCultural: 10,
      vendorSpotLimitOther: 10,
      sponsorSpotLimitBronze: 10,
      sponsorSpotLimitSilver: 8,
      sponsorSpotLimitGold: 5,
      sponsorSpotLimitPlatinum: 3,
      sponsorSpotLimitDiamond: 1,
      vendorFormQuestions: [],
      sponsorFormQuestions: [],
      volunteerFormQuestions: [],
    }).returning();
    settings = [created];
  }

  const s = settings[0];
  res.json({
    id: s.id,
    yearId: s.yearId,
    vendorPriceFood: parseFloat(s.vendorPriceFood),
    vendorPriceCrafts: parseFloat(s.vendorPriceCrafts),
    vendorPriceMerchandise: parseFloat(s.vendorPriceMerchandise),
    vendorPriceCultural: parseFloat(s.vendorPriceCultural),
    vendorPriceOther: parseFloat(s.vendorPriceOther),
    sponsorPriceBronze: parseFloat(s.sponsorPriceBronze),
    sponsorPriceSilver: parseFloat(s.sponsorPriceSilver),
    sponsorPriceGold: parseFloat(s.sponsorPriceGold),
    sponsorPricePlatinum: parseFloat(s.sponsorPricePlatinum),
    sponsorPriceDiamond: parseFloat(s.sponsorPriceDiamond),
    vendorSpotLimitFood: s.vendorSpotLimitFood,
    vendorSpotLimitCrafts: s.vendorSpotLimitCrafts,
    vendorSpotLimitMerchandise: s.vendorSpotLimitMerchandise,
    vendorSpotLimitCultural: s.vendorSpotLimitCultural,
    vendorSpotLimitOther: s.vendorSpotLimitOther,
    sponsorSpotLimitBronze: s.sponsorSpotLimitBronze,
    sponsorSpotLimitSilver: s.sponsorSpotLimitSilver,
    sponsorSpotLimitGold: s.sponsorSpotLimitGold,
    sponsorSpotLimitPlatinum: s.sponsorSpotLimitPlatinum,
    sponsorSpotLimitDiamond: s.sponsorSpotLimitDiamond,
    applicationDeadline: s.applicationDeadline ?? null,
    vendorFormQuestions: s.vendorFormQuestions,
    sponsorFormQuestions: s.sponsorFormQuestions,
    volunteerFormQuestions: s.volunteerFormQuestions,
  });
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

  const updates: Record<string, unknown> = {};
  if (parsed.data.vendorPriceFood != null) updates.vendorPriceFood = parsed.data.vendorPriceFood.toString();
  if (parsed.data.vendorPriceCrafts != null) updates.vendorPriceCrafts = parsed.data.vendorPriceCrafts.toString();
  if (parsed.data.vendorPriceMerchandise != null) updates.vendorPriceMerchandise = parsed.data.vendorPriceMerchandise.toString();
  if (parsed.data.vendorPriceCultural != null) updates.vendorPriceCultural = parsed.data.vendorPriceCultural.toString();
  if (parsed.data.vendorPriceOther != null) updates.vendorPriceOther = parsed.data.vendorPriceOther.toString();
  if (parsed.data.sponsorPriceBronze != null) updates.sponsorPriceBronze = parsed.data.sponsorPriceBronze.toString();
  if (parsed.data.sponsorPriceSilver != null) updates.sponsorPriceSilver = parsed.data.sponsorPriceSilver.toString();
  if (parsed.data.sponsorPriceGold != null) updates.sponsorPriceGold = parsed.data.sponsorPriceGold.toString();
  if (parsed.data.sponsorPricePlatinum != null) updates.sponsorPricePlatinum = parsed.data.sponsorPricePlatinum.toString();
  if (parsed.data.sponsorPriceDiamond != null) updates.sponsorPriceDiamond = parsed.data.sponsorPriceDiamond.toString();
  if (parsed.data.vendorSpotLimitFood != null) updates.vendorSpotLimitFood = parsed.data.vendorSpotLimitFood;
  if (parsed.data.vendorSpotLimitCrafts != null) updates.vendorSpotLimitCrafts = parsed.data.vendorSpotLimitCrafts;
  if (parsed.data.vendorSpotLimitMerchandise != null) updates.vendorSpotLimitMerchandise = parsed.data.vendorSpotLimitMerchandise;
  if (parsed.data.vendorSpotLimitCultural != null) updates.vendorSpotLimitCultural = parsed.data.vendorSpotLimitCultural;
  if (parsed.data.vendorSpotLimitOther != null) updates.vendorSpotLimitOther = parsed.data.vendorSpotLimitOther;
  if (parsed.data.sponsorSpotLimitBronze != null) updates.sponsorSpotLimitBronze = parsed.data.sponsorSpotLimitBronze;
  if (parsed.data.sponsorSpotLimitSilver != null) updates.sponsorSpotLimitSilver = parsed.data.sponsorSpotLimitSilver;
  if (parsed.data.sponsorSpotLimitGold != null) updates.sponsorSpotLimitGold = parsed.data.sponsorSpotLimitGold;
  if (parsed.data.sponsorSpotLimitPlatinum != null) updates.sponsorSpotLimitPlatinum = parsed.data.sponsorSpotLimitPlatinum;
  if (parsed.data.sponsorSpotLimitDiamond != null) updates.sponsorSpotLimitDiamond = parsed.data.sponsorSpotLimitDiamond;
  if (parsed.data.vendorFormQuestions != null) updates.vendorFormQuestions = parsed.data.vendorFormQuestions;
  if (parsed.data.sponsorFormQuestions != null) updates.sponsorFormQuestions = parsed.data.sponsorFormQuestions;
  if (parsed.data.volunteerFormQuestions != null) updates.volunteerFormQuestions = parsed.data.volunteerFormQuestions;
  if ("applicationDeadline" in parsed.data) updates.applicationDeadline = (parsed.data as any).applicationDeadline ?? null;

  const [updated] = await db.update(festivalSettingsTable)
    .set(updates)
    .where(eq(festivalSettingsTable.yearId, yearId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Settings not found" });
    return;
  }

  res.json({
    id: updated.id,
    yearId: updated.yearId,
    vendorPriceFood: parseFloat(updated.vendorPriceFood),
    vendorPriceCrafts: parseFloat(updated.vendorPriceCrafts),
    vendorPriceMerchandise: parseFloat(updated.vendorPriceMerchandise),
    vendorPriceCultural: parseFloat(updated.vendorPriceCultural),
    vendorPriceOther: parseFloat(updated.vendorPriceOther),
    sponsorPriceBronze: parseFloat(updated.sponsorPriceBronze),
    sponsorPriceSilver: parseFloat(updated.sponsorPriceSilver),
    sponsorPriceGold: parseFloat(updated.sponsorPriceGold),
    sponsorPricePlatinum: parseFloat(updated.sponsorPricePlatinum),
    sponsorPriceDiamond: parseFloat(updated.sponsorPriceDiamond),
    vendorSpotLimitFood: updated.vendorSpotLimitFood,
    vendorSpotLimitCrafts: updated.vendorSpotLimitCrafts,
    vendorSpotLimitMerchandise: updated.vendorSpotLimitMerchandise,
    vendorSpotLimitCultural: updated.vendorSpotLimitCultural,
    vendorSpotLimitOther: updated.vendorSpotLimitOther,
    sponsorSpotLimitBronze: updated.sponsorSpotLimitBronze,
    sponsorSpotLimitSilver: updated.sponsorSpotLimitSilver,
    sponsorSpotLimitGold: updated.sponsorSpotLimitGold,
    sponsorSpotLimitPlatinum: updated.sponsorSpotLimitPlatinum,
    sponsorSpotLimitDiamond: updated.sponsorSpotLimitDiamond,
    vendorFormQuestions: updated.vendorFormQuestions,
    sponsorFormQuestions: updated.sponsorFormQuestions,
    volunteerFormQuestions: updated.volunteerFormQuestions,
  });
});

export default router;
