import { Router, type IRouter } from "express";
import { db, volunteersTable, activityLogTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireStaff } from "../lib/auth";
import {
  GetVolunteerParams,
  ListVolunteersQueryParams,
  ReviewVolunteerParams,
  ReviewVolunteerBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatVolunteer(v: typeof volunteersTable.$inferSelect) {
  return {
    id: v.id,
    yearId: v.yearId,
    name: v.name,
    email: v.email,
    phone: v.phone,
    availability: v.availability ?? null,
    status: v.status,
    applicationData: v.applicationData,
    assignedRole: v.assignedRole ?? null,
    reviewNote: v.reviewNote ?? null,
    createdAt: v.createdAt.toISOString(),
  };
}

router.get("/volunteers", requireStaff, async (req, res): Promise<void> => {
  const queryParsed = ListVolunteersQueryParams.safeParse(req.query);
  const yearId = queryParsed.success ? queryParsed.data.yearId : undefined;
  const status = queryParsed.success ? queryParsed.data.status : undefined;

  const conditions = [];
  if (yearId) conditions.push(eq(volunteersTable.yearId, yearId));
  if (status) conditions.push(eq(volunteersTable.status, status));

  const rows = conditions.length > 0
    ? await db.select().from(volunteersTable).where(and(...conditions)).orderBy(desc(volunteersTable.createdAt))
    : await db.select().from(volunteersTable).orderBy(desc(volunteersTable.createdAt));

  res.json(rows.map(formatVolunteer));
});

router.get("/volunteers/:id", requireStaff, async (req, res): Promise<void> => {
  const parsed = GetVolunteerParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [volunteer] = await db.select().from(volunteersTable).where(eq(volunteersTable.id, parsed.data.id));
  if (!volunteer) {
    res.status(404).json({ error: "Volunteer not found" });
    return;
  }
  res.json(formatVolunteer(volunteer));
});

router.patch("/volunteers/:id/review", requireStaff, async (req, res): Promise<void> => {
  const paramsParsed = ReviewVolunteerParams.safeParse(req.params);
  const bodyParsed = ReviewVolunteerBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { id } = paramsParsed.data;
  const { status, assignedRole, note } = bodyParsed.data;

  const [updated] = await db.update(volunteersTable)
    .set({ status, assignedRole: assignedRole ?? null, reviewNote: note ?? null })
    .where(eq(volunteersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Volunteer not found" });
    return;
  }

  await db.insert(activityLogTable).values({
    type: status === "approved" ? "approved" : "rejected",
    message: `Volunteer ${updated.name} ${status === "approved" ? "approved" : "rejected"}${assignedRole ? ` for role: ${assignedRole}` : ""}`,
    entityType: "volunteer",
    entityId: updated.id,
  });

  res.json(formatVolunteer(updated));
});

export default router;
