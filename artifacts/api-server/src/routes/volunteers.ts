import { Router, type IRouter } from "express";
import { db, volunteersTable, activityLogTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireStaff } from "../lib/auth";
import { sendApplicantConfirmation } from "../lib/email";
import {
  GetVolunteerParams,
  ListVolunteersQueryParams,
  ReviewVolunteerParams,
  ReviewVolunteerBody,
  UpdateVolunteerDetailsParams,
  UpdateVolunteerDetailsBody,
  UpdateVolunteerDetailsResponse,
} from "@workspace/api-zod";
import {
  addDetailChange,
  applicationText,
  asApplicationData,
  type ApplicantDetailChange,
  isExactObjectWithKeys,
  isValidEmail,
  normalizeOptionalText,
  normalizeRequiredText,
} from "../lib/applicantDetails";

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

router.patch("/volunteers/:id/details", requireStaff, async (req, res): Promise<void> => {
  const allowedKeys = ["name", "organizationName", "email", "phone", "website", "social"] as const;
  if (!isExactObjectWithKeys(req.body, allowedKeys)) {
    res.status(400).json({ error: "Only staff-editable volunteer detail fields may be updated." });
    return;
  }

  const params = UpdateVolunteerDetailsParams.safeParse(req.params);
  const body = UpdateVolunteerDetailsBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Enter valid volunteer details." });
    return;
  }

  const input = {
    name: normalizeRequiredText(body.data.name),
    organizationName: normalizeOptionalText(body.data.organizationName),
    email: normalizeRequiredText(body.data.email),
    phone: normalizeRequiredText(body.data.phone),
    website: normalizeOptionalText(body.data.website),
    social: normalizeOptionalText(body.data.social),
  };
  if (!input.name || !isValidEmail(input.email)) {
    res.status(400).json({ error: "Enter a name and valid email address." });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    const [volunteer] = await tx.select().from(volunteersTable).where(eq(volunteersTable.id, params.data.id));
    if (!volunteer) return null;

    const nextApplicationData = asApplicationData(volunteer.applicationData);
    const changes: ApplicantDetailChange[] = [];
    addDetailChange(changes, "Contact name", volunteer.name, input.name);
    addDetailChange(changes, "Email", volunteer.email, input.email);
    addDetailChange(changes, "Phone", volunteer.phone, input.phone);
    for (const [key, label, value] of [
      ["organizationName", "Organization or business name", input.organizationName],
      ["website", "Website", input.website],
      ["social", "Social media", input.social],
    ] as const) {
      const oldValue = applicationText(nextApplicationData[key]);
      if (addDetailChange(changes, label, oldValue, value)) nextApplicationData[key] = value;
    }

    if (changes.length === 0) return volunteer;
    const [saved] = await tx.update(volunteersTable).set({
      name: input.name,
      email: input.email,
      phone: input.phone,
      applicationData: nextApplicationData,
    }).where(eq(volunteersTable.id, volunteer.id)).returning();

    await tx.insert(activityLogTable).values(changes.map((change) => ({
      type: "details_updated",
      message: `Volunteer details updated: ${change.fieldName}`,
      entityType: "volunteer",
      entityId: volunteer.id,
      performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
      ...change,
    })));
    return saved;
  });

  if (!updated) {
    res.status(404).json({ error: "Volunteer not found" });
    return;
  }
  res.json(UpdateVolunteerDetailsResponse.parse(formatVolunteer(updated)));
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
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  res.json(formatVolunteer(updated));
});

router.post("/volunteers/:id/resend-confirmation", requireStaff, async (req, res): Promise<void> => {
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

  sendApplicantConfirmation({
    to: volunteer.email,
    applicantName: volunteer.name,
    applicationType: "volunteer",
    organizationOrBusiness: null,
    categoryOrTier: volunteer.availability ?? null,
  });

  await db.insert(activityLogTable).values({
    type: "email_resent",
    message: `Confirmation email resent to volunteer ${volunteer.name} at ${volunteer.email}`,
    entityType: "volunteer",
    entityId: volunteer.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  res.status(204).send();
});

router.delete("/volunteers/:id", requireStaff, async (req, res): Promise<void> => {
  const parsed = GetVolunteerParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [deleted] = await db.delete(volunteersTable).where(eq(volunteersTable.id, parsed.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Volunteer not found" });
    return;
  }
  await db.insert(activityLogTable).values({
    type: "deleted",
    message: `Volunteer record deleted: ${deleted.name}`,
    entityType: "volunteer",
    entityId: deleted.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });
  res.status(204).send();
});

export default router;
