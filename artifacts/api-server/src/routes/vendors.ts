import { Router, type IRouter } from "express";
import { db, vendorsTable, festivalYearsTable, activityLogTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireStaff } from "../lib/auth";
import {
  GetVendorParams,
  ListVendorsQueryParams,
  ReviewVendorParams,
  ReviewVendorBody,
  FinalApproveVendorParams,
  AssignVendorSpotParams,
  AssignVendorSpotBody,
} from "@workspace/api-zod";
import { randomBytes } from "crypto";
import { sendPortalInviteEmail } from "../lib/email";

const router: IRouter = Router();

function formatVendor(v: typeof vendorsTable.$inferSelect) {
  return {
    id: v.id,
    yearId: v.yearId,
    name: v.name,
    businessName: v.businessName,
    email: v.email,
    phone: v.phone,
    vendorType: v.vendorType,
    status: v.status,
    applicationData: v.applicationData,
    agreementSigned: v.agreementSigned,
    agreementSignedName: v.agreementSignedName ?? null,
    spotNumber: v.spotNumber ?? null,
    location: v.location ?? null,
    reviewNote: v.reviewNote ?? null,
    paidAt: v.paidAt ? v.paidAt.toISOString() : null,
    approvedAt: v.approvedAt ? v.approvedAt.toISOString() : null,
    finalApprovedAt: v.finalApprovedAt ? v.finalApprovedAt.toISOString() : null,
    createdAt: v.createdAt.toISOString(),
  };
}

router.get("/vendors", requireStaff, async (req, res): Promise<void> => {
  const queryParsed = ListVendorsQueryParams.safeParse(req.query);
  const yearId = queryParsed.success ? queryParsed.data.yearId : undefined;
  const status = queryParsed.success ? queryParsed.data.status : undefined;

  let query = db.select().from(vendorsTable);
  const conditions = [];
  if (yearId) conditions.push(eq(vendorsTable.yearId, yearId));
  if (status) conditions.push(eq(vendorsTable.status, status));

  const rows = conditions.length > 0
    ? await db.select().from(vendorsTable).where(and(...conditions)).orderBy(desc(vendorsTable.createdAt))
    : await db.select().from(vendorsTable).orderBy(desc(vendorsTable.createdAt));

  res.json(rows.map(formatVendor));
});

router.get("/vendors/:id", requireStaff, async (req, res): Promise<void> => {
  const parsed = GetVendorParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, parsed.data.id));
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.json(formatVendor(vendor));
});

router.patch("/vendors/:id/review", requireStaff, async (req, res): Promise<void> => {
  const paramsParsed = ReviewVendorParams.safeParse(req.params);
  const bodyParsed = ReviewVendorBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { id } = paramsParsed.data;
  const { status, note } = bodyParsed.data;

  const updates: Record<string, unknown> = {
    status,
    reviewNote: note ?? null,
  };

  if (status === "approved") {
    updates.approvedAt = new Date();
    // Generate portal token
    const portalToken = randomBytes(32).toString("hex");
    updates.portalToken = portalToken;
  }

  const [updated] = await db.update(vendorsTable)
    .set(updates)
    .where(eq(vendorsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }

  await db.insert(activityLogTable).values({
    type: status === "approved" ? "approved" : "rejected",
    message: `Vendor ${updated.name} (${updated.businessName}) ${status === "approved" ? "approved" : "rejected"}`,
    entityType: "vendor",
    entityId: updated.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  // Send portal invite email if approved
  if (status === "approved" && updated.portalToken) {
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost";
    const portalUrl = `https://${domain}/portal/${updated.portalToken}`;
    const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, updated.yearId)).limit(1);
    sendPortalInviteEmail({
      to: updated.email,
      name: updated.name,
      type: "vendor",
      portalUrl,
      festivalName: years[0]?.eventName ?? "Romanian Festival",
    });
  }

  res.json(formatVendor(updated));
});

router.patch("/vendors/:id/final-approve", requireStaff, async (req, res): Promise<void> => {
  const parsed = FinalApproveVendorParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [updated] = await db.update(vendorsTable)
    .set({ status: "final_approved", finalApprovedAt: new Date() })
    .where(eq(vendorsTable.id, parsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }

  await db.insert(activityLogTable).values({
    type: "final_approved",
    message: `Vendor ${updated.name} (${updated.businessName}) final approved`,
    entityType: "vendor",
    entityId: updated.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  res.json(formatVendor(updated));
});

router.patch("/vendors/:id/assign", requireStaff, async (req, res): Promise<void> => {
  const paramsParsed = AssignVendorSpotParams.safeParse(req.params);
  const bodyParsed = AssignVendorSpotBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [updated] = await db.update(vendorsTable)
    .set({ spotNumber: bodyParsed.data.spotNumber, location: bodyParsed.data.location })
    .where(eq(vendorsTable.id, paramsParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }

  await db.insert(activityLogTable).values({
    type: "assigned",
    message: `Vendor ${updated.name} assigned spot ${bodyParsed.data.spotNumber} at ${bodyParsed.data.location}`,
    entityType: "vendor",
    entityId: updated.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  res.json(formatVendor(updated));
});

router.delete("/vendors/:id", requireStaff, async (req, res): Promise<void> => {
  const parsed = GetVendorParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [deleted] = await db.delete(vendorsTable).where(eq(vendorsTable.id, parsed.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  await db.insert(activityLogTable).values({
    type: "deleted",
    message: `Vendor record deleted: ${deleted.name} (${deleted.businessName})`,
    entityType: "vendor",
    entityId: deleted.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });
  res.status(204).send();
});

export default router;
