import { Router, type IRouter } from "express";
import { db, sponsorsTable, festivalYearsTable, festivalSettingsTable, activityLogTable } from "@workspace/db";
import { eq, and, desc, isNull, isNotNull } from "drizzle-orm";
import { requireStaff } from "../lib/auth";
import {
  GetSponsorParams,
  ListSponsorsQueryParams,
  ReviewSponsorParams,
  ReviewSponsorBody,
  UpdateSponsorDetailsParams,
  UpdateSponsorDetailsBody,
  UpdateSponsorDetailsResponse,
  FinalApproveSponsorParams,
  AssignSponsorSpotParams,
  AssignSponsorSpotBody,
  RecordSponsorManualPaymentParams,
  RecordSponsorManualPaymentBody,
  RemoveSponsorManualPaymentParams,
} from "@workspace/api-zod";
import { randomBytes } from "crypto";
import { sendSponsorDetailsInviteEmail, sendSponsorFinalConfirmationEmail, sendSponsorPaymentLinkEmail, sendApplicantConfirmation, sendManualPaymentConfirmationEmail, TIER_LABELS } from "../lib/email";
import { getOrCreateSponsorCheckoutUrl } from "./stripe";
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
const paymentLabels: Record<string, string> = { cash: "Cash", check: "Check", bank_transfer: "Bank transfer", other: "Other" };
const SPONSOR_STATUS_RANK: Record<string, number> = {
  pending_payment: 0,
  payment_processing: 0,
  paid: 1,
  approved: 2,
  rejected: -1,
  details_submitted: 3,
  details_approved: 4,
};

function getSponsorTimestampImpliedStatus(sponsor: typeof sponsorsTable.$inferSelect): string | null {
  return sponsor.finalApprovedAt
    ? "details_approved"
    : sponsor.detailsSubmittedAt
      ? "details_submitted"
      : sponsor.approvedAt
        ? "approved"
        : null;
}

function sponsorNeedsStatusRepair(sponsor: typeof sponsorsTable.$inferSelect): boolean {
  const impliedStatus = getSponsorTimestampImpliedStatus(sponsor);
  return Boolean(
    impliedStatus
    && (SPONSOR_STATUS_RANK[sponsor.status] ?? -1) < SPONSOR_STATUS_RANK[impliedStatus],
  );
}

function validReceivedDate(value: Date): string | null {
  const text = value.toISOString().slice(0, 10), date = new Date(`${text}T00:00:00.000Z`), tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return date > tomorrow ? null : text;
}
function validManualAmount(value: number) { return Number.isFinite(value) && value > 0 && value <= 99_999_999.99 && Math.abs(value * 100 - Math.round(value * 100)) < 0.0000001; }

function formatSponsor(s: typeof sponsorsTable.$inferSelect) {
  const hasStripePayment = Boolean(s.stripePaidAt || (s.stripeSessionId && s.paidAt));
  const timestampImpliedStatus = getSponsorTimestampImpliedStatus(s);
  return {
    id: s.id,
    yearId: s.yearId,
    name: s.name,
    orgName: s.orgName,
    email: s.email,
    phone: s.phone,
    tier: s.tier,
    sponsorshipAmount: s.sponsorshipAmount != null ? parseFloat(s.sponsorshipAmount) : null,
    status: s.status,
    statusNeedsRepair: sponsorNeedsStatusRepair(s),
    timestampImpliedStatus,
    applicationData: s.applicationData,
    agreementSigned: s.agreementSigned,
    agreementSignedName: s.agreementSignedName ?? null,
    spotNumber: s.spotNumber ?? null,
    location: s.location ?? null,
    reviewNote: s.reviewNote ?? null,
    paidAt: s.paidAt ? s.paidAt.toISOString() : null,
    paymentSource: s.manualPaymentRecordedAt ? "manual" : (hasStripePayment ? "stripe" : null),
    paymentMethod: s.manualPaymentRecordedAt ? (paymentLabels[s.manualPaymentMethod ?? ""] ?? null) : (hasStripePayment ? "Stripe" : null),
    hasStripePayment,
    stripePaymentAmount: s.stripeSettledAmount === null
      ? (s.stripeSessionId && s.paidAt && s.sponsorshipAmount !== null ? Number(s.sponsorshipAmount) : null)
      : Number(s.stripeSettledAmount),
    stripePaidAt: s.stripePaidAt?.toISOString() ?? (s.stripeSessionId && s.paidAt ? s.paidAt.toISOString() : null),
    manualPaymentAmount: s.manualPaymentAmount === null ? null : Number(s.manualPaymentAmount),
    manualPaymentReceivedDate: s.manualPaymentReceivedDate ?? null,
    manualPaymentReference: s.manualPaymentReference ?? null,
    manualPaymentRecordedAt: s.manualPaymentRecordedAt?.toISOString() ?? null,
    manualPaymentRecordedBy: s.manualPaymentRecordedBy ?? null,
    manualPaymentPreviousStatus: s.manualPaymentPreviousStatus ?? null,
    paymentFailedAt: s.paymentFailedAt ? s.paymentFailedAt.toISOString() : null,
    paymentFailureReason: s.paymentFailureReason ?? null,
    approvedAt: s.approvedAt ? s.approvedAt.toISOString() : null,
    detailsSubmittedAt: s.detailsSubmittedAt ? s.detailsSubmittedAt.toISOString() : null,
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

router.patch("/sponsors/:id/reconcile-status-from-timestamps", requireStaff, async (req, res): Promise<void> => {
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

  const impliedStatus = getSponsorTimestampImpliedStatus(sponsor);
  if (!impliedStatus) {
    res.status(409).json({ error: "This sponsor has no stage timestamp that can restore their workflow status." });
    return;
  }

  if (!sponsorNeedsStatusRepair(sponsor)) {
    res.json(formatSponsor(sponsor));
    return;
  }

  const [updated] = await db.update(sponsorsTable)
    .set({ status: impliedStatus })
    .where(and(eq(sponsorsTable.id, sponsor.id), eq(sponsorsTable.status, sponsor.status)))
    .returning();
  if (!updated) {
    res.status(409).json({ error: "The sponsor changed while their status was being reconciled. Refresh and try again." });
    return;
  }

  await db.insert(activityLogTable).values({
    type: "status_reconciled",
    message: `Sponsor ${updated.name} (${updated.orgName}) status restored from ${sponsor.status} to ${impliedStatus} using existing stage timestamps`,
    entityType: "sponsor",
    entityId: updated.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  res.json(formatSponsor(updated));
});

router.post("/sponsors/:id/manual-payment", requireStaff, async (req, res): Promise<void> => {
  const params = RecordSponsorManualPaymentParams.safeParse(req.params), body = RecordSponsorManualPaymentBody.safeParse(req.body);
  if (!params.success || !body.success || !validManualAmount(body.success ? body.data.amount : 0)) { res.status(400).json({ error: "Enter a positive amount in whole cents and a valid manual payment." }); return; }
  const receivedDate = validReceivedDate(body.data.receivedDate);
  if (!receivedDate) { res.status(400).json({ error: "Received date cannot be unreasonably in the future." }); return; }
  const [sponsor] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, params.data.id)).limit(1);
  if (!sponsor) { res.status(404).json({ error: "Sponsor not found" }); return; }
  if (sponsor.manualPaymentRecordedAt) { res.status(409).json({ error: "Remove the active manual payment before recording another." }); return; }
  const hasStripe = Boolean(sponsor.stripePaidAt || (sponsor.stripeSessionId && sponsor.paidAt));
  if (hasStripe && !body.data.confirmStripeOverlap) { res.status(409).json({ error: "This sponsor already has a Stripe payment. Confirm the overlap to record a manual payment." }); return; }
  const actor = (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null, reference = body.data.reference?.trim() || null;
  const shouldAdvanceToPaid = ["pending_payment", "payment_processing"].includes(sponsor.status);
  const updated = await db.transaction(async (tx) => {
    const [saved] = await tx.update(sponsorsTable).set({
      status: hasStripe || !shouldAdvanceToPaid ? sponsor.status : "paid",
      paidAt: hasStripe ? sponsor.paidAt : sponsor.paidAt ?? new Date(`${receivedDate}T00:00:00.000Z`),
      manualPaymentMethod: body.data.method,
      manualPaymentAmount: body.data.amount.toFixed(2),
      manualPaymentReceivedDate: receivedDate,
      manualPaymentReference: reference,
      manualPaymentRecordedAt: new Date(),
      manualPaymentRecordedBy: actor,
      manualPaymentPreviousStatus: sponsor.status,
    }).where(and(
      eq(sponsorsTable.id, sponsor.id),
      eq(sponsorsTable.status, sponsor.status),
      isNull(sponsorsTable.manualPaymentRecordedAt),
    )).returning();
    if (!saved) return null;
    await tx.insert(activityLogTable).values({
      type: "manual_payment_recorded",
      message: `Manual ${paymentLabels[body.data.method]} payment of $${body.data.amount.toFixed(2)} recorded for sponsor ${saved.name}${reference ? ` (reference: ${reference})` : ""} by ${actor ?? "staff"}`,
      entityType: "sponsor",
      entityId: saved.id,
      performedBy: actor,
    });
    return saved;
  });
  if (!updated) { res.status(409).json({ error: "This sponsor changed while recording payment. Refresh and try again." }); return; }
  if (body.data.sendConfirmationEmail) void sendManualPaymentConfirmationEmail({ to: updated.email, name: updated.name, entityType: "sponsor", amount: body.data.amount, method: body.data.method, reference, receivedDate });
  res.json(formatSponsor(updated));
});

router.delete("/sponsors/:id/manual-payment", requireStaff, async (req, res): Promise<void> => {
  const params = RemoveSponsorManualPaymentParams.safeParse(req.params); if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [sponsor] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, params.data.id)).limit(1);
  if (!sponsor) { res.status(404).json({ error: "Sponsor not found" }); return; }
  if (!sponsor.manualPaymentRecordedAt) { res.status(409).json({ error: "There is no active manual payment to remove." }); return; }
  const actor = (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null;
  const stripeSettled = Boolean(sponsor.stripePaidAt || (sponsor.stripeSessionId && sponsor.paidAt));
  const stripePaidAt = sponsor.stripePaidAt ?? (sponsor.stripeSessionId ? sponsor.paidAt : null);
  const restoredStatus = stripeSettled && ["pending_payment", "payment_processing"].includes(sponsor.manualPaymentPreviousStatus ?? "")
    ? "paid"
    : sponsor.manualPaymentPreviousStatus ?? (stripeSettled ? "paid" : "pending_payment");
  const updated = await db.transaction(async (tx) => {
    const [saved] = await tx.update(sponsorsTable).set({
      status: restoredStatus,
      paidAt: stripeSettled ? stripePaidAt : null,
      manualPaymentMethod: null,
      manualPaymentAmount: null,
      manualPaymentReceivedDate: null,
      manualPaymentReference: null,
      manualPaymentRecordedAt: null,
      manualPaymentRecordedBy: null,
      manualPaymentPreviousStatus: null,
    }).where(and(
      eq(sponsorsTable.id, sponsor.id),
      eq(sponsorsTable.status, sponsor.status),
      isNotNull(sponsorsTable.manualPaymentRecordedAt),
    )).returning();
    if (!saved) return null;
    await tx.insert(activityLogTable).values({
      type: "manual_payment_removed",
      message: `Manual ${paymentLabels[sponsor.manualPaymentMethod ?? ""] ?? "payment"} of $${Number(sponsor.manualPaymentAmount).toFixed(2)} removed for sponsor ${saved.name}${sponsor.manualPaymentReference ? ` (reference: ${sponsor.manualPaymentReference})` : ""} by ${actor ?? "staff"}`,
      entityType: "sponsor",
      entityId: saved.id,
      performedBy: actor,
    });
    return saved;
  });
  if (!updated) { res.status(409).json({ error: "This sponsor payment changed while removing it. Refresh and try again." }); return; }
  res.json(formatSponsor(updated));
});

router.patch("/sponsors/:id/details", requireStaff, async (req, res): Promise<void> => {
  const allowedKeys = ["name", "orgName", "email", "phone", "website", "social"] as const;
  if (!isExactObjectWithKeys(req.body, allowedKeys)) {
    res.status(400).json({ error: "Only staff-editable sponsor detail fields may be updated." });
    return;
  }

  const params = UpdateSponsorDetailsParams.safeParse(req.params);
  const body = UpdateSponsorDetailsBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Enter valid sponsor details." });
    return;
  }

  const input = {
    name: normalizeRequiredText(body.data.name),
    orgName: normalizeRequiredText(body.data.orgName),
    email: normalizeRequiredText(body.data.email),
    phone: normalizeRequiredText(body.data.phone),
    website: normalizeOptionalText(body.data.website),
    social: normalizeOptionalText(body.data.social),
  };
  if (!input.name || !input.orgName || !isValidEmail(input.email)) {
    res.status(400).json({ error: "Enter a name, organization name, and valid email address." });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    const [sponsor] = await tx.select().from(sponsorsTable).where(eq(sponsorsTable.id, params.data.id));
    if (!sponsor) return null;

    const nextApplicationData = asApplicationData(sponsor.applicationData);
    const changes: ApplicantDetailChange[] = [];
    addDetailChange(changes, "Contact name", sponsor.name, input.name);
    addDetailChange(changes, "Organization name", sponsor.orgName, input.orgName);
    addDetailChange(changes, "Email", sponsor.email, input.email);
    addDetailChange(changes, "Phone", sponsor.phone, input.phone);
    for (const [key, label, value] of [
      ["website", "Website", input.website],
      ["social", "Social media", input.social],
    ] as const) {
      const oldValue = applicationText(nextApplicationData[key]);
      if (addDetailChange(changes, label, oldValue, value)) nextApplicationData[key] = value;
    }

    if (changes.length === 0) return sponsor;
    const [saved] = await tx.update(sponsorsTable).set({
      name: input.name,
      orgName: input.orgName,
      email: input.email,
      phone: input.phone,
      applicationData: nextApplicationData,
    }).where(eq(sponsorsTable.id, sponsor.id)).returning();

    await tx.insert(activityLogTable).values(changes.map((change) => ({
      type: "details_updated",
      message: `Sponsor details updated: ${change.fieldName}`,
      entityType: "sponsor",
      entityId: sponsor.id,
      performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
      ...change,
    })));
    return saved;
  });

  if (!updated) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }
  res.json(UpdateSponsorDetailsResponse.parse(formatSponsor(updated)));
});

// ---------------------------------------------------------------------------
// Stage 1 review — pending → approved (sends details invite) or rejected
// ---------------------------------------------------------------------------
router.patch("/sponsors/:id/review", requireStaff, async (req, res): Promise<void> => {
  const paramsParsed = ReviewSponsorParams.safeParse(req.params);
  const bodyParsed = ReviewSponsorBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { id } = paramsParsed.data;
  const { status, note } = bodyParsed.data;

  const [current] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, id)).limit(1);
  if (!current) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }
  if (current.status !== "paid") {
    res.status(409).json({ error: `Cannot review: sponsor is currently '${current.status}', expected 'paid'` });
    return;
  }

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
    message: `Sponsor ${updated.name} (${updated.orgName}) ${status === "approved" ? "approved — details invite sent" : "rejected"}`,
    entityType: "sponsor",
    entityId: updated.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  // When approved: email the sponsor a link to complete their remaining stage 2
  // details (booth/operational info, logo). Payment and acknowledgements
  // already happened at application time under the pay-first flow.
  if (status === "approved" && updated.portalToken) {
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost";
    const portalUrl = `https://${domain}/portal/${updated.portalToken}`;
    const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, updated.yearId)).limit(1);
    sendSponsorDetailsInviteEmail({
      to: updated.email,
      name: updated.name,
      orgName: updated.orgName,
      tier: updated.tier,
      portalUrl,
      festivalName: years[0]?.eventName ?? "Romanian Festival",
    });
  }

  res.json(formatSponsor(updated));
});

// ---------------------------------------------------------------------------
// Stage 2 details approval — details_submitted → details_approved
// Sends the payment-ready email with tier, amount, and document deadline.
// ---------------------------------------------------------------------------
router.patch("/sponsors/:id/final-approve", requireStaff, async (req, res): Promise<void> => {
  const parsed = FinalApproveSponsorParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  // Fetch current sponsor to validate status
  const [current] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, parsed.data.id)).limit(1);
  if (!current) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }
  if (current.status !== "details_submitted") {
    res.status(409).json({ error: `Cannot approve details: sponsor is currently '${current.status}', expected 'details_submitted'` });
    return;
  }

  const [updated] = await db.update(sponsorsTable)
    .set({ status: "details_approved", finalApprovedAt: new Date() })
    .where(eq(sponsorsTable.id, parsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }

  await db.insert(activityLogTable).values({
    type: "final_approved",
    message: `Sponsor ${updated.name} (${updated.orgName}) details approved — sponsorship confirmed`,
    entityType: "sponsor",
    entityId: updated.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  // Payment already happened at application time — this is a plain confirmation.
  if (updated.portalToken) {
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost";
    const portalUrl = `https://${domain}/portal/${updated.portalToken}`;
    const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, updated.yearId)).limit(1);

    sendSponsorFinalConfirmationEmail({
      to: updated.email,
      name: updated.name,
      orgName: updated.orgName,
      tier: updated.tier,
      portalUrl,
      festivalName: years[0]?.eventName ?? "Romanian Festival",
    });
  }

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

router.post("/sponsors/:id/resend-confirmation", requireStaff, async (req, res): Promise<void> => {
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

  sendApplicantConfirmation({
    to: sponsor.email,
    applicantName: sponsor.name,
    applicationType: "sponsor",
    organizationOrBusiness: sponsor.orgName,
    categoryOrTier: TIER_LABELS[sponsor.tier] ?? sponsor.tier,
  });

  await db.insert(activityLogTable).values({
    type: "email_resent",
    message: `Confirmation email resent to sponsor ${sponsor.name} (${sponsor.orgName}) at ${sponsor.email}`,
    entityType: "sponsor",
    entityId: sponsor.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  res.status(204).send();
});

router.post("/sponsors/:id/resend-payment-link", requireStaff, async (req, res): Promise<void> => {
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
  if (sponsor.status !== "pending_payment") {
    res.status(409).json({ error: `Cannot resend payment link: sponsor is currently '${sponsor.status}', expected 'pending_payment'` });
    return;
  }

  let checkoutUrl: string;
  try {
    checkoutUrl = await getOrCreateSponsorCheckoutUrl(sponsor.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(409).json({ error: message });
    return;
  }

  const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, sponsor.yearId)).limit(1);
  sendSponsorPaymentLinkEmail({
    to: sponsor.email,
    name: sponsor.name,
    orgName: sponsor.orgName,
    checkoutUrl,
    festivalName: years[0]?.eventName ?? "Romanian Festival",
  });

  await db.insert(activityLogTable).values({
    type: "email_resent",
    message: `Payment link resent to sponsor ${sponsor.name} (${sponsor.orgName}) at ${sponsor.email}`,
    entityType: "sponsor",
    entityId: sponsor.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  res.json({ checkoutUrl });
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
