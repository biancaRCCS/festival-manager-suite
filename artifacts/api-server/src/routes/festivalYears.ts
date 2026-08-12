import { Router, type IRouter } from "express";
import { db, festivalYearsTable, festivalSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireStaff } from "../lib/auth";
import { CreateFestivalYearBody, UpdateFestivalYearBody, UpdateFestivalYearParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/festival-years", requireStaff, async (req, res): Promise<void> => {
  const years = await db.select().from(festivalYearsTable).orderBy(festivalYearsTable.year);
  res.json(years.map(y => ({ ...y, eventDate: y.eventDate, createdAt: y.createdAt.toISOString() })));
});

router.post("/festival-years", requireStaff, async (req, res): Promise<void> => {
  const parsed = CreateFestivalYearBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { year, eventName, eventDate, isActive } = parsed.data;

  // If marking as active, deactivate others first
  if (isActive) {
    await db.update(festivalYearsTable).set({ isActive: false });
  }

  const [created] = await db.insert(festivalYearsTable).values({
    year,
    eventName,
    eventDate,
    isActive: isActive ?? false,
  }).returning();

  // Create default settings for the new year
  await db.insert(festivalSettingsTable).values({
    yearId: created.id,
    vendorFormQuestions: [],
    sponsorFormQuestions: [],
    volunteerFormQuestions: [],
  }).onConflictDoNothing();

  res.status(201).json({ ...created, eventDate: created.eventDate, createdAt: created.createdAt.toISOString() });
});

router.patch("/festival-years/:id", requireStaff, async (req, res): Promise<void> => {
  const paramsParsed = UpdateFestivalYearParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const parsed = UpdateFestivalYearBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { id } = paramsParsed.data;
  const { eventName, eventDate, isActive } = parsed.data;

  // If marking as active, deactivate others first
  if (isActive) {
    await db.update(festivalYearsTable).set({ isActive: false });
  }

  const updates: Record<string, unknown> = {};
  if (eventName != null) updates.eventName = eventName;
  if (eventDate != null) updates.eventDate = eventDate;
  if (isActive != null) updates.isActive = isActive;

  const [updated] = await db.update(festivalYearsTable)
    .set(updates)
    .where(eq(festivalYearsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Festival year not found" });
    return;
  }

  res.json({ ...updated, eventDate: updated.eventDate, createdAt: updated.createdAt.toISOString() });
});

export default router;
