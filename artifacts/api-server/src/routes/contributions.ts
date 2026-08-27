import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { CreateContributionCheckoutBody, ListContributionsQueryParams, CreateManualContributionBody, RemoveManualContributionParams } from "@workspace/api-zod";
import { contributionsTable, db, festivalYearsTable, activityLogTable } from "@workspace/db";
import { requireStaff } from "../lib/auth";
import { createContributionCheckout } from "./stripe";
import { sendManualPaymentConfirmationEmail } from "../lib/email";

const router: IRouter = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const paymentLabels: Record<string, string> = { cash: "Cash", check: "Check", bank_transfer: "Bank transfer", other: "Other" };
function validDate(value: Date) { const text = value.toISOString().slice(0, 10), date = new Date(`${text}T00:00:00.000Z`), tomorrow = new Date(); tomorrow.setUTCHours(0,0,0,0); tomorrow.setUTCDate(tomorrow.getUTCDate()+1); return date > tomorrow ? null : text; }
function validAmount(value: number) { return Number.isFinite(value) && value > 0 && value <= 9_999_999_999.99 && Math.abs(value * 100 - Math.round(value * 100)) < 0.0000001; }

router.post("/public/contributions/checkout", async (req, res): Promise<void> => {
  const parsed = CreateContributionCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please provide a name, valid email address, and contribution of at least $5." });
    return;
  }

  const name = parsed.data.name.trim();
  const email = parsed.data.email.trim().toLowerCase();
  const amount = Math.round(parsed.data.amount * 100) / 100;
  if (!name || !EMAIL_PATTERN.test(email) || !Number.isFinite(amount) || amount < 5) {
    res.status(400).json({ error: "Please provide a name, valid email address, and contribution of at least $5." });
    return;
  }

  const [year] = await db
    .select({ id: festivalYearsTable.id })
    .from(festivalYearsTable)
    .where(eq(festivalYearsTable.isActive, true))
    .limit(1);
  if (!year) {
    res.status(404).json({ error: "Contributions are not available right now." });
    return;
  }

  try {
    const checkoutUrl = await createContributionCheckout({ name, email, amount, yearId: year.id });
    res.json({ checkoutUrl });
  } catch (err) {
    req.log.error({ err }, "Failed to create contribution checkout");
    res.status(500).json({ error: "Unable to start payment. Please try again." });
  }
});

router.get("/contributions", requireStaff, async (req, res): Promise<void> => {
  const queryParsed = ListContributionsQueryParams.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ error: "A valid festival year is required." });
    return;
  }

  const rows = await db
    .select()
    .from(contributionsTable)
    .where(eq(contributionsTable.yearId, queryParsed.data.yearId))
    .orderBy(desc(contributionsTable.createdAt));

  const items = rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    amount: Number(row.amount),
    stripeSessionId: row.stripeSessionId,
    status: row.status,
    paymentSource: row.manualPaymentRecordedAt ? "manual" : row.stripeSessionId ? "stripe" : null,
    paymentMethod: row.manualPaymentRecordedAt ? (paymentLabels[row.manualPaymentMethod ?? ""] ?? null) : row.stripeSessionId ? "Stripe" : null,
    manualPaymentReference: row.manualPaymentReference ?? null,
    manualPaymentReceivedDate: row.manualPaymentReceivedDate ?? null,
    manualPaymentRecordedAt: row.manualPaymentRecordedAt?.toISOString() ?? null,
    manualPaymentRecordedBy: row.manualPaymentRecordedBy ?? null,
    removedAt: row.removedAt?.toISOString() ?? null, removedBy: row.removedBy ?? null,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    paymentFailedAt: row.paymentFailedAt ? row.paymentFailedAt.toISOString() : null,
    paymentFailureReason: row.paymentFailureReason ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
  // Only settled donations count toward the reported total — bank transfers
  // still processing (or that failed) haven't actually raised anything yet.
  const total = items.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amount, 0);
  res.json({ items, total });
});

router.post("/contributions", requireStaff, async (req, res): Promise<void> => {
  const body = CreateManualContributionBody.safeParse(req.body);
  if (!body.success || !validAmount(body.success ? body.data.amount : 0)) { res.status(400).json({ error: "Enter a name, valid email, year, and positive amount in whole cents." }); return; }
  const input = body.data, name = input.name.trim(), email = input.email.trim().toLowerCase(), receivedDate = validDate(input.receivedDate);
  if (!name || !EMAIL_PATTERN.test(email) || !receivedDate) { res.status(400).json({ error: "Enter a valid name, email, and received date." }); return; }
  const [year] = await db.select({ id: festivalYearsTable.id }).from(festivalYearsTable).where(eq(festivalYearsTable.id, input.yearId)).limit(1);
  if (!year) { res.status(404).json({ error: "Festival year not found" }); return; }
  const actor = (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null, reference = input.reference?.trim() || null;
  const [created] = await db.insert(contributionsTable).values({ yearId: input.yearId, name, email, amount: input.amount.toFixed(2), status: "paid", paidAt: new Date(`${receivedDate}T00:00:00.000Z`), manualPaymentMethod: input.method, manualPaymentReference: reference, manualPaymentReceivedDate: receivedDate, manualPaymentRecordedAt: new Date(), manualPaymentRecordedBy: actor }).returning();
  await db.insert(activityLogTable).values({ type: "manual_payment_recorded", message: `Manual ${paymentLabels[input.method]} contribution of $${input.amount.toFixed(2)} recorded for ${name}${reference ? ` (reference: ${reference})` : ""} by ${actor ?? "staff"}`, entityType: "contribution", entityId: created.id, performedBy: actor });
  if (input.sendConfirmationEmail) void sendManualPaymentConfirmationEmail({ to: email, name, entityType: "contribution", amount: input.amount, method: input.method, reference, receivedDate });
  res.status(201).json({ id: created.id, name: created.name, email: created.email, amount: Number(created.amount), stripeSessionId: null, status: created.status, paymentSource: "manual", paymentMethod: paymentLabels[input.method], manualPaymentReference: reference, manualPaymentReceivedDate: receivedDate, manualPaymentRecordedAt: created.manualPaymentRecordedAt!.toISOString(), manualPaymentRecordedBy: actor, removedAt: null, removedBy: null, paidAt: created.paidAt!.toISOString(), paymentFailedAt: null, paymentFailureReason: null, createdAt: created.createdAt.toISOString() });
});

router.delete("/contributions/:id/manual-payment", requireStaff, async (req, res): Promise<void> => {
  const params = RemoveManualContributionParams.safeParse(req.params); if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [row] = await db.select().from(contributionsTable).where(eq(contributionsTable.id, params.data.id)).limit(1);
  if (!row) { res.status(404).json({ error: "Contribution not found" }); return; }
  if (!row.manualPaymentRecordedAt || row.status === "removed") { res.status(409).json({ error: "Contribution is not an active manual contribution." }); return; }
  const actor = (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null;
  const [updated] = await db.update(contributionsTable).set({ status: "removed", removedAt: new Date(), removedBy: actor }).where(eq(contributionsTable.id, row.id)).returning();
  await db.insert(activityLogTable).values({ type: "manual_payment_removed", message: `Manual ${paymentLabels[row.manualPaymentMethod ?? ""] ?? "payment"} contribution of $${Number(row.amount).toFixed(2)} removed for ${row.name}${row.manualPaymentReference ? ` (reference: ${row.manualPaymentReference})` : ""} by ${actor ?? "staff"}`, entityType: "contribution", entityId: row.id, performedBy: actor });
  res.json({ ...updated, amount: Number(updated.amount), stripeSessionId: updated.stripeSessionId, paymentSource: "manual", paymentMethod: paymentLabels[updated.manualPaymentMethod ?? ""], manualPaymentReference: updated.manualPaymentReference, manualPaymentReceivedDate: updated.manualPaymentReceivedDate, manualPaymentRecordedAt: updated.manualPaymentRecordedAt?.toISOString() ?? null, manualPaymentRecordedBy: updated.manualPaymentRecordedBy, removedAt: updated.removedAt?.toISOString() ?? null, removedBy: updated.removedBy, paidAt: updated.paidAt?.toISOString() ?? null, paymentFailedAt: null, paymentFailureReason: null, createdAt: updated.createdAt.toISOString() });
});

export default router;