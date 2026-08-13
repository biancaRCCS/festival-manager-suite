import { Router, type IRouter } from "express";
import { db, sponsorsTable, festivalYearsTable, activityLogTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireStaff } from "../lib/auth";
import {
  GetSponsorParams,
  ListSponsorsQueryParams,
  ReviewSponsorParams,
  ReviewSponsorBody,
  FinalApproveSponsorParams,
  AssignSponsorSpotParams,
  AssignSponsorSpotBody,
} from "@workspace/api-zod";
import { randomBytes } from "crypto";
import { sendPortalInviteEmail } from "../lib/email";

const router: IRouter = Router();

function formatSponsor(s: typeof sponsorsTable.$inferSelect) {
  return {
    id: s.id,
    yearId: s.yearId,
    name: s.name,
    orgName: s.orgName,
    email: s.email,
    phone: s.phone,
    tier: s.tier,
    status: s.status,
    applicationData: s.applicationData,
    agreementSigned: s.agreementSigned,
    spotNumber: s.spotNumber ?? null,
    location: s.location ?? null,
    reviewNote: s.reviewNote ?? null,
    paidAt: s.paidAt ? s.paidAt.toISOString() : null,
    approvedAt: s.approvedAt ? s.approvedAt.toISOString() : null,
    finalApprovedAt: s.finalApprovedAt ? s.finalApprovedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  };
}

router.get("/sponsors", requireStaff, async (req, res): Promise<void> => {
  const queryParsed = ListSponsorsQueryParams.safeParse(req.query);
  const yearId = queryParsed.success ? queryParsed.data.yearId : undefined;
  const status = queryParsed.success ? queryParsed.data.status : undefined;

  const conditions = [];
  if (yearId) conditions.push(eq(sponsorsTable.yearId, yearId));
  if (status) conditions.push(eq(sponsorsTable.status, status));

  const rows = conditions.length > 0
    ? await db.select().from(sponsorsTable).where(and(...conditions)).orderBy(desc(sponsorsTable.createdAt))
    : await db.select().from(sponsorsTable).orderBy(desc(sponsorsTable.createdAt));

  res.json(rows.map(formatSponsor));
});

router.get("/sponsors/:id", requireStaff, async (req, res): Promise<void> => {
  const parsed = GetSponsorParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [sponsor] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, parsed.data.id));
  if (!sponsor) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }
  res.json(formatSponsor(sponsor));
});

router.patch("/sponsors/:id/review", requireStaff, async (req, res): Promise<void> => {
  const paramsParsed = ReviewSponsorParams.safeParse(req.params);
  const bodyParsed = ReviewSponsorBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { id } = paramsParsed.data;
  const { status, note } = bodyParsed.data;

  const updates: Record<string, unknown> = { status, reviewNote: note ?? null };
  if (status === "approved") {
    updates.approvedAt = new Date();
    updates.portalToken = randomBytes(32).toString("hex");
  }

  const [updated] = await db.update(sponsorsTable).set(updates).where(eq(sponsorsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }

  await db.insert(activityLogTable).values({
    type: status === "approved" ? "approved" : "rejected",
    message: `Sponsor ${updated.name} (${updated.orgName}) ${status === "approved" ? "approved" : "rejected"}`,
    entityType: "sponsor",
    entityId: updated.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  if (status === "approved" && updated.portalToken) {
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost";
    const portalUrl = `https://${domain}/portal/${updated.portalToken}`;
    const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, updated.yearId)).limit(1);
    sendPortalInviteEmail({
      to: updated.email,
      name: updated.name,
      type: "sponsor",
      portalUrl,
      festivalName: years[0]?.eventName ?? "Romanian Festival",
    });
  }

  res.json(formatSponsor(updated));
});

router.patch("/sponsors/:id/final-approve", requireStaff, async (req, res): Promise<void> => {
  const parsed = FinalApproveSponsorParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [updated] = await db.update(sponsorsTable)
    .set({ status: "final_approved", finalApprovedAt: new Date() })
    .where(eq(sponsorsTable.id, parsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }

  await db.insert(activityLogTable).values({
    type: "final_approved",
    message: `Sponsor ${updated.name} (${updated.orgName}) final approved`,
    entityType: "sponsor",
    entityId: updated.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  res.json(formatSponsor(updated));
});

router.patch("/sponsors/:id/assign", requireStaff, async (req, res): Promise<void> => {
  const paramsParsed = AssignSponsorSpotParams.safeParse(req.params);
  const bodyParsed = AssignSponsorSpotBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [updated] = await db.update(sponsorsTable)
    .set({ spotNumber: bodyParsed.data.spotNumber, location: bodyParsed.data.location })
    .where(eq(sponsorsTable.id, paramsParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }

  await db.insert(activityLogTable).values({
    type: "assigned",
    message: `Sponsor ${updated.name} assigned spot ${bodyParsed.data.spotNumber} at ${bodyParsed.data.location}`,
    entityType: "sponsor",
    entityId: updated.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  res.json(formatSponsor(updated));
});

router.delete("/sponsors/:id", requireStaff, async (req, res): Promise<void> => {
  const parsed = GetSponsorParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const { id } = parsed.data;
  const [deleted] = await db.delete(sponsorsTable).where(eq(sponsorsTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }
  await db.insert(activityLogTable).values({
    type: "deleted",
    message: `Sponsor record deleted: ${deleted.name} (${deleted.orgName})`,
    entityType: "sponsor",
    entityId: deleted.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });
  res.status(204).send();
});

export default router;
