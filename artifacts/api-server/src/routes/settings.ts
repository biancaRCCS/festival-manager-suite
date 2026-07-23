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
      vendorPrice: "200.00",
      sponsorPrice: "500.00",
      vendorSpotLimit: 50,
      sponsorSpotLimit: 20,
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
    vendorPrice: parseFloat(s.vendorPrice),
    sponsorPrice: parseFloat(s.sponsorPrice),
    vendorSpotLimit: s.vendorSpotLimit,
    sponsorSpotLimit: s.sponsorSpotLimit,
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
  if (parsed.data.vendorPrice != null) updates.vendorPrice = parsed.data.vendorPrice.toString();
  if (parsed.data.sponsorPrice != null) updates.sponsorPrice = parsed.data.sponsorPrice.toString();
  if (parsed.data.vendorSpotLimit != null) updates.vendorSpotLimit = parsed.data.vendorSpotLimit;
  if (parsed.data.sponsorSpotLimit != null) updates.sponsorSpotLimit = parsed.data.sponsorSpotLimit;
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
    vendorPrice: parseFloat(updated.vendorPrice),
    sponsorPrice: parseFloat(updated.sponsorPrice),
    vendorSpotLimit: updated.vendorSpotLimit,
    sponsorSpotLimit: updated.sponsorSpotLimit,
    vendorFormQuestions: updated.vendorFormQuestions,
    sponsorFormQuestions: updated.sponsorFormQuestions,
    volunteerFormQuestions: updated.volunteerFormQuestions,
  });
});

export default router;
