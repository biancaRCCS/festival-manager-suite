import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { db, activityLogTable, contributionsTable, festivalYearsTable, sponsorsTable, vendorsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { handleCheckoutComplete } from "../routes/stripe";

const { manualEmailSpy } = vi.hoisted(() => ({ manualEmailSpy: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/auth", () => ({
  requireStaff: (req: any, _res: any, next: () => void) => {
    req.clerkUserId = "manual-test-clerk";
    req.staffMember = { name: "Manual Payment Staff", role: "admin" };
    next();
  },
  requireAdmin: (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/email")>()),
  sendManualPaymentConfirmationEmail: manualEmailSpy,
}));
import app from "../app";

let yearId: number;
const vendorIds: number[] = [], sponsorIds: number[] = [], contributionIds: number[] = [];
const payment = { method: "check", amount: 125.25, receivedDate: "2025-06-01", reference: "  CHECK-42  " };

beforeAll(async () => {
  const [year] = await db.insert(festivalYearsTable).values({ year: 2096, eventName: "Manual payment test", eventDate: "2096-08-01", isActive: false }).returning();
  yearId = year!.id;
});
afterAll(async () => {
  const ids = [...vendorIds, ...sponsorIds, ...contributionIds];
  if (ids.length) await db.delete(activityLogTable).where(inArray(activityLogTable.entityId, ids));
  if (contributionIds.length) await db.delete(contributionsTable).where(inArray(contributionsTable.id, contributionIds));
  if (sponsorIds.length) await db.delete(sponsorsTable).where(inArray(sponsorsTable.id, sponsorIds));
  if (vendorIds.length) await db.delete(vendorsTable).where(inArray(vendorsTable.id, vendorIds));
  await db.delete(festivalYearsTable).where(eq(festivalYearsTable.id, yearId));
});
async function vendor(values: Partial<typeof vendorsTable.$inferInsert> = {}) {
  const [row] = await db.insert(vendorsTable).values({ yearId, name: "Vendor", businessName: "Vendor Co", email: `vendor${vendorIds.length}@test.local`, phone: "555", status: "approved", applicationData: {}, ...values }).returning();
  vendorIds.push(row!.id); return row!;
}
async function sponsor(values: Partial<typeof sponsorsTable.$inferInsert> = {}) {
  const [row] = await db.insert(sponsorsTable).values({ yearId, name: "Sponsor", orgName: "Sponsor Co", email: `sponsor${sponsorIds.length}@test.local`, phone: "555", status: "pending_payment", applicationData: {}, ...values }).returning();
  sponsorIds.push(row!.id); return row!;
}

describe("manual payments", () => {
  it("returns required in-kind fields for vendor and special-agreement portal responses", async () => {
    const standardVendor = await vendor({ portalToken: "portal-contract-vendor" });
    const specialVendor = await vendor({ portalToken: "portal-contract-special", vendorType: "special_agreement" });

    const standardResponse = await request(app).get(`/api/portal/${standardVendor.portalToken}`);
    const specialResponse = await request(app).get(`/api/portal/${specialVendor.portalToken}`);

    expect(standardResponse.status).toBe(200);
    expect(standardResponse.body).toMatchObject({ type: "vendor", isInKind: false, inKindDescription: null });
    expect(specialResponse.status).toBe(200);
    expect(specialResponse.body).toMatchObject({ type: "special_agreement", isInKind: false, inKindDescription: null });
  });

  it("records vendor payments, validates input, audits staff, and defaults email off", async () => {
    const row = await vendor();
    expect((await request(app).post(`/api/vendors/${row.id}/manual-payment`).send({ ...payment, amount: 1.001 })).status).toBe(400);
    expect((await request(app).post(`/api/vendors/${row.id}/manual-payment`).send({ ...payment, amount: 100_000_000 })).status).toBe(400);
    const res = await request(app).post(`/api/vendors/${row.id}/manual-payment`).send(payment);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "paid", paymentSource: "manual", paymentMethod: "Check", manualPaymentAmount: 125.25, manualPaymentReference: "CHECK-42" });
    expect(manualEmailSpy).not.toHaveBeenCalled();
    const [log] = await db.select().from(activityLogTable).where(eq(activityLogTable.entityId, row.id));
    expect(log).toMatchObject({ type: "manual_payment_recorded", performedBy: "Manual Payment Staff" });
    expect(log!.message).toContain("Manual Check payment of $125.25");
    expect((await request(app).post(`/api/vendors/${row.id}/manual-payment`).send(payment)).status).toBe(409);
  });

  it("keeps vendor guards, preserves a sponsor's existing workflow status, and permits only one concurrent record", async () => {
    const pendingVendor = await vendor({ status: "pending" });
    expect((await request(app).post(`/api/vendors/${pendingVendor.id}/manual-payment`).send(payment)).status).toBe(409);
    const rejectedSponsor = await sponsor({ status: "rejected" });
    const sponsorPayment = await request(app).post(`/api/sponsors/${rejectedSponsor.id}/manual-payment`).send(payment);
    expect(sponsorPayment.status).toBe(200);
    expect(sponsorPayment.body).toMatchObject({ status: "rejected", paymentSource: "manual" });
    const payable = await vendor();
    const results = await Promise.all([
      request(app).post(`/api/vendors/${payable.id}/manual-payment`).send(payment),
      request(app).post(`/api/vendors/${payable.id}/manual-payment`).send(payment),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  });

  it("rejects special-agreement vendors and requires confirmation for Stripe overlap, then restores Stripe payment", async () => {
    const special = await vendor({ vendorType: "special_agreement" });
    expect((await request(app).post(`/api/vendors/${special.id}/manual-payment`).send(payment)).status).toBe(409);
    const stripe = await vendor({ status: "paid", stripeSessionId: "cs_vendor_paid", paidAt: new Date("2025-05-01"), settledAmount: "200.00", stripePaidAt: new Date("2025-05-01"), stripeSettledAmount: "200.00" });
    expect((await request(app).post(`/api/vendors/${stripe.id}/manual-payment`).send(payment)).status).toBe(409);
    expect((await request(app).post(`/api/vendors/${stripe.id}/manual-payment`).send({ ...payment, confirmStripeOverlap: true, sendConfirmationEmail: true })).status).toBe(200);
    expect(manualEmailSpy).toHaveBeenCalledOnce();
    const removed = await request(app).delete(`/api/vendors/${stripe.id}/manual-payment`);
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ status: "paid", paymentSource: "stripe", settledAmount: 200 });
    expect((await request(app).delete(`/api/vendors/${stripe.id}/manual-payment`)).status).toBe(409);
  });

  it("records/removes a sponsor manual payment and restores pending payment", async () => {
    const row = await sponsor();
    const recorded = await request(app).post(`/api/sponsors/${row.id}/manual-payment`).send({ ...payment, method: "cash" });
    expect(recorded.status).toBe(200);
    expect(recorded.body).toMatchObject({ status: "paid", paymentSource: "manual", paymentMethod: "Cash" });
    const removed = await request(app).delete(`/api/sponsors/${row.id}/manual-payment`);
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ status: "pending_payment", paymentSource: null });
    const logs = await db.select().from(activityLogTable).where(eq(activityLogTable.entityId, row.id));
    expect(logs.map((log) => log.type)).toEqual(expect.arrayContaining(["manual_payment_recorded", "manual_payment_removed"]));
    expect(logs.every((log) => log.performedBy === "Manual Payment Staff")).toBe(true);
    const stripe = await sponsor({ status: "paid", stripeSessionId: "cs_sponsor_paid", paidAt: new Date("2025-05-01"), stripePaidAt: new Date("2025-05-01"), stripeSettledAmount: "400.00" });
    expect((await request(app).post(`/api/sponsors/${stripe.id}/manual-payment`).send(payment)).status).toBe(409);
    expect((await request(app).post(`/api/sponsors/${stripe.id}/manual-payment`).send({ ...payment, confirmStripeOverlap: true })).status).toBe(200);
    const stripeRemoved = await request(app).delete(`/api/sponsors/${stripe.id}/manual-payment`);
    expect(stripeRemoved.body).toMatchObject({ status: "paid", paymentSource: "stripe" });
  });

  it("creates, voids, and excludes manual contributions from totals", async () => {
    const created = await request(app).post("/api/contributions").send({ ...payment, name: "Cash Donor", email: "donor@test.local", yearId, sendConfirmationEmail: true });
    expect(created.status).toBe(201);
    contributionIds.push(created.body.id);
    expect(created.body).toMatchObject({ stripeSessionId: null, status: "paid", paymentSource: "manual" });
    expect(manualEmailSpy).toHaveBeenCalledTimes(2);
    expect((await request(app).get("/api/contributions").query({ yearId })).body.total).toBe(125.25);
    const removed = await request(app).delete(`/api/contributions/${created.body.id}/manual-payment`);
    expect(removed.status).toBe(200);
    expect(removed.body.status).toBe("removed");
    expect((await request(app).get("/api/contributions").query({ yearId })).body.total).toBe(0);
    expect((await request(app).delete(`/api/contributions/${created.body.id}/manual-payment`)).status).toBe(409);
  });

  it("keeps a late Stripe settlement after a manual payment is removed", async () => {
    const row = await vendor();
    await request(app).post(`/api/vendors/${row.id}/manual-payment`).send(payment);
    await handleCheckoutComplete({ id: row.stripeSessionId ?? "cs_late_manual_vendor", amount_total: 33300, payment_status: "paid", metadata: { entityType: "vendor", entityId: String(row.id) } } as any);
    // The manual route is allowed to race an existing checkout; attach the
    // test session first so fulfillment has the same conditional key.
    await db.update(vendorsTable).set({ stripeSessionId: "cs_late_manual_vendor" }).where(eq(vendorsTable.id, row.id));
    await handleCheckoutComplete({ id: "cs_late_manual_vendor", amount_total: 33300, payment_status: "paid", metadata: { entityType: "vendor", entityId: String(row.id) } } as any);
    const removed = await request(app).delete(`/api/vendors/${row.id}/manual-payment`);
    expect(removed.body).toMatchObject({ status: "paid", paymentSource: "stripe", settledAmount: 333 });
    expect(removed.body.paidAt).toBeTruthy();
  });

  it("reports actual manual and Stripe-plus-manual amounts in financials", async () => {
    const manualVendor = await vendor({ status: "paid", paidAt: new Date(), manualPaymentAmount: "111.00", manualPaymentRecordedAt: new Date() });
    const combinedVendor = await vendor({ status: "paid", paidAt: new Date(), stripeSessionId: "cs_revenue", stripeSettledAmount: "222.00", manualPaymentAmount: "33.00", manualPaymentRecordedAt: new Date() });
    const manualSponsor = await sponsor({ status: "paid", paidAt: new Date(), manualPaymentAmount: "444.00", manualPaymentRecordedAt: new Date() });
    const result = await request(app).get("/api/dashboard/financials").query({ yearId });
    expect(result.status).toBe(200);
    expect(result.body.vendorRevenue).toBeGreaterThanOrEqual(366);
    expect(result.body.sponsorRevenue).toBeGreaterThanOrEqual(444);
    expect(result.body.recentPayments).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: `${manualVendor.name} — ${manualVendor.businessName}`, amount: 111 }),
      expect.objectContaining({ name: `${combinedVendor.name} — ${combinedVendor.businessName}`, amount: 255 }),
      expect.objectContaining({ name: `${manualSponsor.name} — ${manualSponsor.orgName}`, amount: 444 }),
    ]));
  });

  it("separates in-kind sponsorship value from cash revenue and recent payments", async () => {
    const cashSponsor = await sponsor({
      orgName: "Cash Sponsor Co",
      status: "paid", paidAt: new Date("2025-06-01T12:00:00.000Z"),
      manualPaymentAmount: "400.00", manualPaymentRecordedAt: new Date("2025-06-01T12:00:00.000Z"),
    });
    const inKindSponsor = await sponsor({
      orgName: "In Kind Sponsor Co",
      status: "paid", isInKind: true, inKindDescription: "Donated catering",
      sponsorshipAmount: "0.00", inKindValue: "750.00", paidAt: null,
    });

    const financials = await request(app).get("/api/dashboard/financials").query({ yearId });
    expect(financials.status).toBe(200);
    expect(financials.body.sponsorRevenue).toBeGreaterThanOrEqual(400);
    expect(financials.body.sponsorInKindValue).toBeGreaterThanOrEqual(750);
    expect(financials.body.totalRevenue).toBe(financials.body.vendorRevenue + financials.body.sponsorRevenue);
    expect(financials.body.recentPayments).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: `${cashSponsor.name} — ${cashSponsor.orgName}`, amount: 400 }),
    ]));
    expect(financials.body.recentPayments).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: `${inKindSponsor.name} — ${inKindSponsor.orgName}` }),
    ]));

    // The summary always uses the active year, so temporarily make this
    // isolated test year active and restore the prior active-year selection.
    const activeYears = await db.select({ id: festivalYearsTable.id }).from(festivalYearsTable).where(eq(festivalYearsTable.isActive, true));
    await db.update(festivalYearsTable).set({ isActive: false }).where(eq(festivalYearsTable.isActive, true));
    try {
      await db.update(festivalYearsTable).set({ isActive: true }).where(eq(festivalYearsTable.id, yearId));
      const summary = await request(app).get("/api/dashboard/summary");
      expect(summary.status).toBe(200);
      expect(summary.body.sponsorRevenue).toBeGreaterThanOrEqual(400);
      expect(summary.body.sponsorInKindValue).toBeGreaterThanOrEqual(750);
      expect(summary.body.totalRevenue).toBe(summary.body.vendorRevenue + summary.body.sponsorRevenue);
    } finally {
      await db.update(festivalYearsTable).set({ isActive: false }).where(eq(festivalYearsTable.id, yearId));
      for (const activeYear of activeYears) {
        await db.update(festivalYearsTable).set({ isActive: true }).where(eq(festivalYearsTable.id, activeYear.id));
      }
    }
  });

  it("recognizes and restores legacy vendor Stripe evidence without the new Stripe settlement columns", async () => {
    const legacyPaidAt = new Date("2025-04-15T12:30:00.000Z");
    const row = await vendor({
      status: "final_approved",
      stripeSessionId: "cs_legacy_vendor",
      paidAt: legacyPaidAt,
      settledAmount: "512.34",
      stripePaidAt: null,
      stripeSettledAmount: null,
    });
    const before = await request(app).get(`/api/vendors/${row.id}`);
    expect(before.body).toMatchObject({
      hasStripePayment: true,
      paymentSource: "stripe",
      stripePaymentAmount: 512.34,
      stripePaidAt: legacyPaidAt.toISOString(),
    });
    expect((await request(app).post(`/api/vendors/${row.id}/manual-payment`).send(payment)).status).toBe(409);
    const recorded = await request(app).post(`/api/vendors/${row.id}/manual-payment`).send({ ...payment, confirmStripeOverlap: true });
    expect(recorded.status).toBe(200);
    expect(recorded.body).toMatchObject({ status: "final_approved", paymentSource: "manual", hasStripePayment: true });
    const removed = await request(app).delete(`/api/vendors/${row.id}/manual-payment`);
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({
      status: "final_approved",
      paymentSource: "stripe",
      hasStripePayment: true,
      settledAmount: 512.34,
      stripePaymentAmount: 512.34,
      paidAt: legacyPaidAt.toISOString(),
      stripePaidAt: legacyPaidAt.toISOString(),
    });
  });

  it("recognizes and restores legacy sponsor Stripe evidence without the new Stripe settlement columns", async () => {
    const legacyPaidAt = new Date("2025-04-20T09:00:00.000Z");
    const row = await sponsor({
      status: "details_approved",
      stripeSessionId: "cs_legacy_sponsor",
      paidAt: legacyPaidAt,
      sponsorshipAmount: "987.65",
      stripePaidAt: null,
      stripeSettledAmount: null,
    });
    const before = await request(app).get(`/api/sponsors/${row.id}`);
    expect(before.body).toMatchObject({
      hasStripePayment: true,
      paymentSource: "stripe",
      stripePaymentAmount: 987.65,
      stripePaidAt: legacyPaidAt.toISOString(),
    });
    expect((await request(app).post(`/api/sponsors/${row.id}/manual-payment`).send(payment)).status).toBe(409);
    const recorded = await request(app).post(`/api/sponsors/${row.id}/manual-payment`).send({ ...payment, confirmStripeOverlap: true });
    expect(recorded.status).toBe(200);
    expect(recorded.body).toMatchObject({ status: "details_approved", paymentSource: "manual", hasStripePayment: true });
    const removed = await request(app).delete(`/api/sponsors/${row.id}/manual-payment`);
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({
      status: "details_approved",
      paymentSource: "stripe",
      hasStripePayment: true,
      stripePaymentAmount: 987.65,
      paidAt: legacyPaidAt.toISOString(),
      stripePaidAt: legacyPaidAt.toISOString(),
    });
  });
});