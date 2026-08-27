import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { db, activityLogTable, contributionsTable, festivalYearsTable, sponsorsTable, vendorsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const { manualEmailSpy } = vi.hoisted(() => ({ manualEmailSpy: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/auth", () => ({
  requireStaff: (req: any, _res: any, next: () => void) => {
    req.clerkUserId = "manual-test-clerk";
    req.staffMember = { name: "Manual Payment Staff" };
    next();
  },
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
  it("records vendor payments, validates input, audits staff, and defaults email off", async () => {
    const row = await vendor();
    expect((await request(app).post(`/api/vendors/${row.id}/manual-payment`).send({ ...payment, amount: 1.001 })).status).toBe(400);
    const res = await request(app).post(`/api/vendors/${row.id}/manual-payment`).send(payment);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "paid", paymentSource: "manual", paymentMethod: "Check", manualPaymentAmount: 125.25, manualPaymentReference: "CHECK-42" });
    expect(manualEmailSpy).not.toHaveBeenCalled();
    const [log] = await db.select().from(activityLogTable).where(eq(activityLogTable.entityId, row.id));
    expect(log).toMatchObject({ type: "manual_payment_recorded", performedBy: "Manual Payment Staff" });
    expect(log!.message).toContain("Manual Check payment of $125.25");
    expect((await request(app).post(`/api/vendors/${row.id}/manual-payment`).send(payment)).status).toBe(409);
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
});