import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { CreateContributionCheckoutBody, ListContributionsQueryParams } from "@workspace/api-zod";
import { contributionsTable, db, festivalYearsTable } from "@workspace/db";
import { requireStaff } from "../lib/auth";
import { createContributionCheckout } from "./stripe";

const router: IRouter = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export default router;