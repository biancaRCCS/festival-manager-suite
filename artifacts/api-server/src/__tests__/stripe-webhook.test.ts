/**
 * Integration tests for the Stripe webhook endpoint.
 *
 * These tests verify that events POSTed to /api/stripe/webhook are
 * correctly processed and that state lands in the database as expected.
 *
 * Strategy:
 *  - Mock `../lib/stripeClient` so tests don't need live Stripe credentials.
 *  - Use the real `@workspace/db` pool (DATABASE_URL is set in the environment).
 *  - For checkout.session.completed: create real DB rows and assert they change.
 *  - For payment_intent.succeeded: assert processWebhook receives the full payload.
 */

import { beforeAll, afterAll, afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { db, festivalYearsTable, vendorsTable, contributionsTable, activityLogTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import { createCheckoutSession } from "../routes/stripe";

// ---------------------------------------------------------------------------
// Module mocks — vi.mock() is hoisted to the top of the file by vitest,
// so any variables it closes over must be declared with vi.hoisted().
// ---------------------------------------------------------------------------

/** Spy that records every processWebhook call. Declared via vi.hoisted() so
 *  it is available when the hoisted vi.mock() factory runs. */
const {
  processWebhookSpy,
  contributionReceiptSpy,
  createCheckoutSessionSpy,
  checkoutSessionRetrieveSpy,
  checkoutSessionExpireSpy,
  vendorCategoryAdjustedEmailSpy,
  vendorWorkflowEmailSpy,
  paymentIntentRetrieveSpy,
} = vi.hoisted(() => ({
  processWebhookSpy: vi.fn().mockResolvedValue(undefined),
  contributionReceiptSpy: vi.fn().mockResolvedValue(undefined),
  createCheckoutSessionSpy: vi.fn(),
  checkoutSessionRetrieveSpy: vi.fn(),
  checkoutSessionExpireSpy: vi.fn(),
  vendorCategoryAdjustedEmailSpy: vi.fn().mockResolvedValue(undefined),
  vendorWorkflowEmailSpy: vi.fn().mockResolvedValue(undefined),
  paymentIntentRetrieveSpy: vi.fn().mockResolvedValue({ last_payment_error: null }),
}));

vi.mock("../lib/stripeClient", () => {
  return {
    getStripeSync: vi.fn().mockResolvedValue({
      processWebhook: processWebhookSpy,
    }),
    /**
     * Return a Stripe-shaped client whose webhooks.constructEvent simply
     * parses the raw payload as JSON — no real signature verification.
     * This keeps tests hermetic while still exercising the application logic
     * that branches on event.type.
     */
    getUncachableStripeClient: vi.fn().mockResolvedValue({
      checkout: {
        sessions: {
          create: createCheckoutSessionSpy,
          retrieve: checkoutSessionRetrieveSpy,
          expire: checkoutSessionExpireSpy,
        },
      },
      paymentIntents: {
        retrieve: paymentIntentRetrieveSpy,
      },
      webhooks: {
        constructEvent: (
          payload: Buffer,
          _sig: string,
          _secret: string
        ): Stripe.Event => JSON.parse(payload.toString()) as Stripe.Event,
      },
    }),
    getWebhookSecret: vi.fn().mockResolvedValue("whsec_test_secret"),
    persistWebhookSecret: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/email")>();
  return {
    ...actual,
    sendContributionReceipt: contributionReceiptSpy,
    sendVendorCategoryAdjustedEmail: vendorCategoryAdjustedEmailSpy,
    sendApplicantConfirmation: vendorWorkflowEmailSpy,
    sendVendorPortalInviteEmail: vendorWorkflowEmailSpy,
    sendSpecialAgreementPortalInviteEmail: vendorWorkflowEmailSpy,
    sendSpecialAgreementCreatedNotification: vendorWorkflowEmailSpy,
    sendManualPaymentConfirmationEmail: vendorWorkflowEmailSpy,
  };
});

vi.mock("../lib/auth", () => ({
  requireStaff: (req: any, _res: any, next: () => void) => {
    req.clerkUserId = "test-staff";
    req.staffMember = { name: "Test Staff" };
    next();
  },
}));

// Import the Express app *after* vi.mock so the mocks are in place.
// eslint-disable-next-line import/first
import app from "../app";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Stripe event envelope for a given type + data object. */
function makeEvent(type: string, data: object): Stripe.Event {
  return {
    id: `evt_test_${Date.now()}`,
    object: "event",
    api_version: "2023-10-16",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type: type as Stripe.Event["type"],
    data: { object: data as Stripe.Event.Data["object"] },
  } as Stripe.Event;
}

/** POST a raw JSON body to the webhook endpoint with the required header.
 *
 * NOTE: We pass the body as a JSON *string*, not a Buffer.  Supertest
 * serialises a Buffer object as `{"type":"Buffer","data":[…]}` when
 * Content-Type is application/json, which breaks Express.raw().  Sending
 * the raw JSON string lets express.raw() capture the bytes correctly, and
 * Buffer.from(jsonString) produces the expected event payload.
 */
async function postWebhook(body: object) {
  return request(app)
    .post("/api/stripe/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", "t=1,v1=test,v0=test") // value irrelevant; constructEvent is mocked
    .send(JSON.stringify(body));
}

// ---------------------------------------------------------------------------
// Test data setup / teardown
// ---------------------------------------------------------------------------

let testYearId: number;
let testVendorId: number;

beforeAll(async () => {
  // Insert a festival year to satisfy the foreign-key constraint on vendors
  const [year] = await db
    .insert(festivalYearsTable)
    .values({
      year: 2099,
      eventName: "Test Festival",
      eventDate: "2099-08-01",
      isActive: false,
    })
    .returning({ id: festivalYearsTable.id });
  testYearId = year!.id;
});

afterAll(async () => {
  // Clean up test data in reverse FK order
  if (testYearId) {
    await db.delete(contributionsTable).where(eq(contributionsTable.yearId, testYearId));
  }
  if (testVendorId) {
    await db
      .delete(activityLogTable)
      .where(eq(activityLogTable.entityId, testVendorId));
    await db
      .delete(vendorsTable)
      .where(eq(vendorsTable.id, testVendorId));
  }
  if (testYearId) {
    await db
      .delete(festivalYearsTable)
      .where(eq(festivalYearsTable.id, testYearId));
  }
});

beforeEach(() => {
  processWebhookSpy.mockClear();
  contributionReceiptSpy.mockClear();
  createCheckoutSessionSpy.mockClear();
  checkoutSessionRetrieveSpy.mockReset();
  checkoutSessionExpireSpy.mockReset();
  vendorCategoryAdjustedEmailSpy.mockClear();
  vendorWorkflowEmailSpy.mockClear();
  paymentIntentRetrieveSpy.mockReset();
  paymentIntentRetrieveSpy.mockResolvedValue({ last_payment_error: null });
});

async function createVendor(overrides: Partial<typeof vendorsTable.$inferInsert> = {}) {
  const [vendor] = await db
    .insert(vendorsTable)
    .values({
      yearId: testYearId,
      name: "Test Vendor",
      businessName: `Test Business ${Date.now()}`,
      email: "vendor@example.com",
      phone: "555-0100",
      vendorType: "retail",
      status: "approved",
      portalToken: `portal_test_${Date.now()}`,
      ...overrides,
    })
    .returning();
  return vendor!;
}

afterEach(async () => {
  if (!testYearId) return;
  const vendorIds = (await db.select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(eq(vendorsTable.yearId, testYearId)))
    .map((vendor) => vendor.id);
  if (vendorIds.length > 0) {
    await db.delete(activityLogTable).where(inArray(activityLogTable.entityId, vendorIds));
    await db.delete(vendorsTable).where(inArray(vendorsTable.id, vendorIds));
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PATCH /api/vendors/:id/reconcile-status-from-timestamps", () => {
  it("restores a timestamp-proven vendor status, logs the actor, and sends no email", async () => {
    const vendor = await createVendor({
      status: "paid",
      approvedAt: new Date("2026-08-24T04:02:05.233Z"),
      finalApprovedAt: new Date("2026-08-24T20:58:42.385Z"),
    });

    const before = await request(app).get(`/api/vendors/${vendor.id}`);
    expect(before.body).toMatchObject({
      status: "paid",
      statusNeedsRepair: true,
      timestampImpliedStatus: "final_approved",
    });

    const res = await request(app).patch(`/api/vendors/${vendor.id}/reconcile-status-from-timestamps`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "final_approved",
      statusNeedsRepair: false,
      timestampImpliedStatus: "final_approved",
    });
    const logs = await db.select().from(activityLogTable).where(eq(activityLogTable.entityId, vendor.id));
    expect(logs).toContainEqual(expect.objectContaining({
      type: "status_reconciled",
      performedBy: "Test Staff",
    }));
    expect(vendorCategoryAdjustedEmailSpy).not.toHaveBeenCalled();
    expect(vendorWorkflowEmailSpy).not.toHaveBeenCalled();
  });

  it("never downgrades a later vendor status and creates no extra activity", async () => {
    const vendor = await createVendor({
      status: "final_approved",
      approvedAt: new Date("2026-08-24T04:02:05.233Z"),
    });

    const res = await request(app).patch(`/api/vendors/${vendor.id}/reconcile-status-from-timestamps`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "final_approved",
      statusNeedsRepair: false,
      timestampImpliedStatus: "approved",
    });
    expect(await db.select().from(activityLogTable).where(eq(activityLogTable.entityId, vendor.id))).toHaveLength(0);
    expect(vendorWorkflowEmailSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook", () => {
  it("rejects invalid public contribution details before creating a Stripe Checkout session", async () => {
    const res = await request(app)
      .post("/api/public/contributions/checkout")
      .send({ name: "", email: "not-an-email", amount: 4 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("valid email address");
    expect(createCheckoutSessionSpy).not.toHaveBeenCalled();
  });

  it("returns 400 when stripe-signature header is absent", async () => {
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .send(Buffer.from(JSON.stringify({ type: "payment_intent.succeeded" })));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Missing stripe-signature header" });
  });

  it("forwards a payment_intent.succeeded event to stripe-replit-sync processWebhook", async () => {
    const paymentIntent: Partial<Stripe.PaymentIntent> = {
      id: "pi_test_123456",
      object: "payment_intent",
      amount: 50000,
      currency: "usd",
      status: "succeeded",
    };

    const event = makeEvent("payment_intent.succeeded", paymentIntent);

    const res = await postWebhook(event);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });

    // stripe-replit-sync must receive the raw payload so it can persist it
    expect(processWebhookSpy).toHaveBeenCalledOnce();
    const [receivedPayload] = processWebhookSpy.mock.calls[0] as [Buffer, string];
    expect(Buffer.isBuffer(receivedPayload)).toBe(true);

    const parsedPayload = JSON.parse(receivedPayload.toString()) as Stripe.Event;
    expect(parsedPayload.type).toBe("payment_intent.succeeded");
    expect((parsedPayload.data.object as Stripe.PaymentIntent).id).toBe("pi_test_123456");
  });

  it("marks vendor as paid in the database when checkout.session.completed arrives", async () => {
    // Insert a vendor in payment_pending status
    const vendor = await createVendor({
      status: "payment_pending",
      stripeSessionId: "cs_test_abc",
    });

    testVendorId = vendor.id;

    const session: Partial<Stripe.Checkout.Session> = {
      id: "cs_test_abc",
      object: "checkout.session",
      payment_status: "paid",
      amount_total: 30000,
      metadata: {
        token: "portal_test_token",
        entityType: "vendor",
        entityId: String(vendor.id),
      },
    };

    const event = makeEvent("checkout.session.completed", session);
    const res = await postWebhook(event);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });

    // Verify the vendor row in our application database was updated
    const [updated] = await db
      .select({ status: vendorsTable.status, paidAt: vendorsTable.paidAt })
      .from(vendorsTable)
        .where(eq(vendorsTable.id, vendor.id));

    expect(updated?.status).toBe("paid");
    expect(updated?.paidAt).not.toBeNull();

    // Verify an activity log entry was written
    const logs = await db
      .select()
      .from(activityLogTable)
      .where(eq(activityLogTable.entityId, vendor.id));

    expect(logs.length).toBeGreaterThanOrEqual(1);
    const paidLog = logs.find((l) => l.type === "paid");
    expect(paidLog).toBeDefined();
    expect(paidLog?.entityType).toBe("vendor");
  });

  it("does not let a late webhook mark a vendor paid after their Checkout was invalidated", async () => {
    const vendor = await createVendor({ status: "approved", stripeSessionId: null });
    const event = makeEvent("checkout.session.completed", {
      id: "cs_invalidated_checkout",
      object: "checkout.session",
      payment_status: "paid",
      amount_total: 30000,
      metadata: { entityType: "vendor", entityId: String(vendor.id) },
    });

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    const [updated] = await db.select()
      .from(vendorsTable)
      .where(eq(vendorsTable.id, vendor.id));
    expect(updated?.status).toBe("approved");
    expect(updated?.paidAt).toBeNull();
  });

  it("expires an unpaid Checkout before changing category so the portal creates a fresh price", async () => {
    const vendor = await createVendor({
      status: "payment_pending",
      stripeSessionId: "cs_open_before_category_change",
    });
    checkoutSessionRetrieveSpy.mockResolvedValue({
      id: vendor.stripeSessionId,
      status: "open",
      payment_status: "unpaid",
      amount_total: 30000,
    });
    checkoutSessionExpireSpy.mockResolvedValue({
      id: vendor.stripeSessionId,
      status: "expired",
      payment_status: "unpaid",
      amount_total: 30000,
    });

    const res = await request(app)
      .patch(`/api/vendors/${vendor.id}/category`)
      .send({ vendorType: "specialty_food", reason: "Products are prepared off site." });

    expect(res.status).toBe(200);
    expect(checkoutSessionExpireSpy).toHaveBeenCalledWith(vendor.stripeSessionId);
    expect(res.body.paymentAdjustment).toMatchObject({ isPaid: false, amount: 0 });
    expect(res.body.vendor).toMatchObject({
      status: "approved",
      vendorType: "specialty_food",
    });
    const [updated] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendor.id));
    expect(updated?.stripeSessionId).toBeNull();
  });

  it("treats a Checkout paid before its webhook as paid and requires a recorded manual adjustment", async () => {
    const vendor = await createVendor({
      status: "payment_pending",
      stripeSessionId: "cs_paid_before_webhook",
    });
    checkoutSessionRetrieveSpy.mockResolvedValue({
      id: vendor.stripeSessionId,
      status: "complete",
      payment_status: "paid",
      amount_total: 30000,
    });

    const firstChange = await request(app)
      .patch(`/api/vendors/${vendor.id}/category`)
      .send({ vendorType: "major_food", reason: "Vendor requires a full food booth." });

    expect(firstChange.status).toBe(200);
    expect(firstChange.body.paymentAdjustment).toEqual({
      isPaid: true,
      direction: "collect",
      amount: 1700,
    });
    expect(vendorCategoryAdjustedEmailSpy).not.toHaveBeenCalled();

    const secondChange = await request(app)
      .patch(`/api/vendors/${vendor.id}/category`)
      .send({ vendorType: "retail", reason: "Attempting an unresolved second change." });
    expect(secondChange.status).toBe(409);

    const settlement = await request(app)
      .patch(`/api/vendors/${vendor.id}/settle-category-adjustment`);
    expect(settlement.status).toBe(200);
    expect(settlement.body.settledAmount).toBe(2000);
    expect(settlement.body.pendingManualAdjustment).toBeNull();

    const delayedWebhook = await postWebhook(makeEvent("checkout.session.completed", {
      id: vendor.stripeSessionId,
      object: "checkout.session",
      payment_status: "paid",
      amount_total: 30000,
      metadata: { entityType: "vendor", entityId: String(vendor.id) },
    }));
    expect(delayedWebhook.status).toBe(200);
    const [afterDelayedWebhook] = await db.select()
      .from(vendorsTable)
      .where(eq(vendorsTable.id, vendor.id));
    expect(afterDelayedWebhook).toMatchObject({
      status: "paid",
      settledAmount: "2000.00",
    });

    const thirdChange = await request(app)
      .patch(`/api/vendors/${vendor.id}/category`)
      .send({ vendorType: "retail", reason: "Vendor no longer needs the full food booth." });
    expect(thirdChange.status).toBe(200);
    expect(thirdChange.body.paymentAdjustment).toEqual({
      isPaid: true,
      direction: "refund",
      amount: 1700,
    });
  });

  it("refuses a pending Checkout category change when Stripe cannot verify its state", async () => {
    const vendor = await createVendor({
      status: "payment_pending",
      stripeSessionId: "cs_unavailable",
    });
    checkoutSessionRetrieveSpy.mockRejectedValue(new Error("Stripe unavailable"));

    const res = await request(app)
      .patch(`/api/vendors/${vendor.id}/category`)
      .send({ vendorType: "nonprofit", reason: "Verified nonprofit documentation received." });

    expect(res.status).toBe(409);
    const [unchanged] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendor.id));
    expect(unchanged?.vendorType).toBe("retail");
  });

  it("allows a legacy category to be corrected for an unpaid vendor", async () => {
    const vendor = await createVendor({ vendorType: "food" });

    const res = await request(app)
      .patch(`/api/vendors/${vendor.id}/category`)
      .send({ vendorType: "specialty_food", reason: "Mapped from a retired vendor category." });

    expect(res.status).toBe(200);
    expect(res.body.oldAmount).toBeNull();
    expect(res.body.vendor.vendorType).toBe("specialty_food");
  });

  it("expires an old-price Checkout if the vendor category changes while Stripe creates it", async () => {
    const vendor = await createVendor();
    createCheckoutSessionSpy.mockImplementation(async () => {
      await db.update(vendorsTable)
        .set({ vendorType: "specialty_food", pricingRevision: 1 })
        .where(eq(vendorsTable.id, vendor.id));
      return { id: "cs_pricing_race", url: "https://checkout.example.test/race" };
    });
    checkoutSessionExpireSpy.mockResolvedValue({
      id: "cs_pricing_race",
      status: "expired",
      payment_status: "unpaid",
    });

    await expect(createCheckoutSession({
      token: vendor.portalToken!,
      entity: { id: vendor.id, name: vendor.name, yearId: vendor.yearId },
      entityType: "vendor",
    })).rejects.toThrow("changed category or payment state");

    expect(checkoutSessionExpireSpy).toHaveBeenCalledWith("cs_pricing_race");
    const [unchanged] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendor.id));
    expect(unchanged).toMatchObject({
      vendorType: "specialty_food",
      status: "approved",
      stripeSessionId: null,
      pricingRevision: 1,
    });
  });

  it("records a paid contribution once and sends one receipt when Stripe completes checkout", async () => {
    const sessionId = `cs_contribution_${Date.now()}`;
    const session: Partial<Stripe.Checkout.Session> = {
      id: sessionId,
      object: "checkout.session",
      payment_status: "paid",
      amount_total: 12500,
      customer_email: "contributor@example.com",
      metadata: {
        entityType: "contribution",
        contributorName: "Test Contributor",
        contributorEmail: "contributor@example.com",
        yearId: String(testYearId),
      },
    };

    const event = makeEvent("checkout.session.completed", session);
    const first = await postWebhook(event);
    expect(first.status).toBe(200);

    const [recorded] = await db
      .select()
      .from(contributionsTable)
      .where(eq(contributionsTable.stripeSessionId, sessionId));
    expect(recorded).toMatchObject({
      name: "Test Contributor",
      email: "contributor@example.com",
      amount: "125.00",
      stripeSessionId: sessionId,
    });
    expect(recorded?.paidAt).not.toBeNull();
    expect(contributionReceiptSpy).toHaveBeenCalledOnce();

    // Stripe may deliver the same webhook again. The session-id uniqueness must
    // prevent a duplicate record and a duplicate receipt.
    const second = await postWebhook(event);
    expect(second.status).toBe(200);
    const rows = await db
      .select()
      .from(contributionsTable)
      .where(eq(contributionsTable.stripeSessionId, sessionId));
    expect(rows).toHaveLength(1);
    expect(contributionReceiptSpy).toHaveBeenCalledOnce();
  });
});

describe("async bank payment methods (e.g. ACH) for vendors", () => {
  it("records a paid Checkout without moving a final-approved vendor backwards", async () => {
    const finalApprovedAt = new Date("2026-08-24T20:58:42.385Z");
    const vendor = await createVendor({
      status: "final_approved",
      finalApprovedAt,
      stripeSessionId: "cs_vendor_late_final_approved",
    });
    testVendorId = vendor.id;

    const event = makeEvent("checkout.session.completed", {
      id: "cs_vendor_late_final_approved",
      object: "checkout.session",
      payment_status: "paid",
      amount_total: 30000,
      metadata: { entityType: "vendor", entityId: String(vendor.id) },
    });
    expect((await postWebhook(event)).status).toBe(200);
    expect((await postWebhook(event)).status).toBe(200);

    const [updated] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendor.id));
    expect(updated).toMatchObject({
      status: "final_approved",
      finalApprovedAt,
      stripeSettledAmount: "300.00",
      settledAmount: "300.00",
    });
    expect(updated?.paidAt).not.toBeNull();
    expect(updated?.stripePaidAt).not.toBeNull();
  });

  it("marks a vendor payment_processing when checkout completes but payment is still unpaid", async () => {
    const vendor = await createVendor({ status: "payment_pending", stripeSessionId: "cs_async_pending" });
    testVendorId = vendor.id;

    const res = await postWebhook(makeEvent("checkout.session.completed", {
      id: "cs_async_pending",
      object: "checkout.session",
      payment_status: "unpaid",
      amount_total: 30000,
      metadata: { entityType: "vendor", entityId: String(vendor.id) },
    }));
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendor.id));
    expect(updated?.status).toBe("payment_processing");
    expect(updated?.paidAt).toBeNull();

    const logs = await db.select().from(activityLogTable).where(eq(activityLogTable.entityId, vendor.id));
    expect(logs.some((l) => l.type === "payment_processing")).toBe(true);
  });

  it("finalizes a vendor to paid when async_payment_succeeded arrives after payment_processing", async () => {
    const vendor = await createVendor({ status: "payment_processing", stripeSessionId: "cs_async_success" });
    testVendorId = vendor.id;

    const res = await postWebhook(makeEvent("checkout.session.async_payment_succeeded", {
      id: "cs_async_success",
      object: "checkout.session",
      payment_status: "paid",
      amount_total: 30000,
      metadata: { entityType: "vendor", entityId: String(vendor.id) },
    }));
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendor.id));
    expect(updated?.status).toBe("paid");
    expect(updated?.paidAt).not.toBeNull();
  });

  it("records ACH success without moving a final-approved vendor backwards", async () => {
    const finalApprovedAt = new Date("2026-08-24T20:58:42.385Z");
    const vendor = await createVendor({
      status: "final_approved",
      finalApprovedAt,
      stripeSessionId: "cs_vendor_async_late_success",
    });
    testVendorId = vendor.id;

    const res = await postWebhook(makeEvent("checkout.session.async_payment_succeeded", {
      id: "cs_vendor_async_late_success",
      object: "checkout.session",
      payment_status: "paid",
      amount_total: 60000,
      metadata: { entityType: "vendor", entityId: String(vendor.id) },
    }));
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendor.id));
    expect(updated).toMatchObject({
      status: "final_approved",
      finalApprovedAt,
      stripeSettledAmount: "600.00",
      settledAmount: "600.00",
    });
    expect(updated?.stripePaidAt).not.toBeNull();
  });

  it("reverts a vendor to approved and records the failure reason when async_payment_failed arrives", async () => {
    const vendor = await createVendor({ status: "payment_processing", stripeSessionId: "cs_async_fail" });
    testVendorId = vendor.id;

    paymentIntentRetrieveSpy.mockResolvedValue({
      id: "pi_test_failed",
      last_payment_error: { message: "Your bank account has insufficient funds." },
    });

    const res = await postWebhook(makeEvent("checkout.session.async_payment_failed", {
      id: "cs_async_fail",
      object: "checkout.session",
      payment_status: "unpaid",
      amount_total: 30000,
      payment_intent: "pi_test_failed",
      metadata: { entityType: "vendor", entityId: String(vendor.id) },
    }));
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendor.id));
    expect(updated?.status).toBe("approved");
    expect(updated?.paidAt).toBeNull();
    expect(updated?.paymentFailedAt).not.toBeNull();
    expect(updated?.paymentFailureReason).toBe("Your bank account has insufficient funds.");

    const logs = await db.select().from(activityLogTable).where(eq(activityLogTable.entityId, vendor.id));
    expect(logs.some((l) => l.type === "payment_failed")).toBe(true);
  });

  it("records ACH failure without moving a final-approved vendor backwards", async () => {
    const finalApprovedAt = new Date("2026-08-24T20:58:42.385Z");
    const vendor = await createVendor({
      status: "final_approved",
      finalApprovedAt,
      stripeSessionId: "cs_vendor_async_late_failure",
    });
    testVendorId = vendor.id;
    paymentIntentRetrieveSpy.mockResolvedValue({
      id: "pi_vendor_async_late_failure",
      last_payment_error: { message: "The bank account was closed." },
    });

    const res = await postWebhook(makeEvent("checkout.session.async_payment_failed", {
      id: "cs_vendor_async_late_failure",
      object: "checkout.session",
      payment_status: "unpaid",
      amount_total: 30000,
      payment_intent: "pi_vendor_async_late_failure",
      metadata: { entityType: "vendor", entityId: String(vendor.id) },
    }));
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendor.id));
    expect(updated).toMatchObject({
      status: "final_approved",
      finalApprovedAt,
      paymentFailureReason: "The bank account was closed.",
    });
    expect(updated?.paymentFailedAt).not.toBeNull();
  });
});

describe("async bank payment methods (e.g. ACH) for contributions", () => {
  it("records a processing contribution, then finalizes to paid and sends exactly one receipt", async () => {
    const sessionId = `cs_contribution_async_${Date.now()}`;
    const baseSession = {
      id: sessionId,
      object: "checkout.session" as const,
      amount_total: 5000,
      customer_email: "asyncdonor@example.com",
      metadata: {
        entityType: "contribution",
        contributorName: "Async Donor",
        contributorEmail: "asyncdonor@example.com",
        yearId: String(testYearId),
      },
    };

    const pending = await postWebhook(makeEvent("checkout.session.completed", { ...baseSession, payment_status: "unpaid" }));
    expect(pending.status).toBe(200);

    const [processing] = await db.select().from(contributionsTable).where(eq(contributionsTable.stripeSessionId, sessionId));
    expect(processing?.status).toBe("processing");
    expect(processing?.paidAt).toBeNull();
    expect(contributionReceiptSpy).not.toHaveBeenCalled();

    const success = await postWebhook(makeEvent("checkout.session.async_payment_succeeded", { ...baseSession, payment_status: "paid" }));
    expect(success.status).toBe(200);

    const [paid] = await db.select().from(contributionsTable).where(eq(contributionsTable.stripeSessionId, sessionId));
    expect(paid?.status).toBe("paid");
    expect(paid?.paidAt).not.toBeNull();
    expect(contributionReceiptSpy).toHaveBeenCalledOnce();

    // A retried success webhook must not send a second receipt or downgrade the row.
    const retried = await postWebhook(makeEvent("checkout.session.async_payment_succeeded", { ...baseSession, payment_status: "paid" }));
    expect(retried.status).toBe(200);
    expect(contributionReceiptSpy).toHaveBeenCalledOnce();
  });

  it("marks a processing contribution failed and never marks it paid", async () => {
    const sessionId = `cs_contribution_failed_${Date.now()}`;
    const baseSession = {
      id: sessionId,
      object: "checkout.session" as const,
      amount_total: 2000,
      payment_intent: "pi_contribution_failed",
      customer_email: "faileddonor@example.com",
      metadata: {
        entityType: "contribution",
        contributorName: "Failed Donor",
        contributorEmail: "faileddonor@example.com",
        yearId: String(testYearId),
      },
    };

    await postWebhook(makeEvent("checkout.session.completed", { ...baseSession, payment_status: "unpaid" }));

    paymentIntentRetrieveSpy.mockResolvedValue({
      id: "pi_contribution_failed",
      last_payment_error: { message: "The bank account could not be verified." },
    });

    const res = await postWebhook(makeEvent("checkout.session.async_payment_failed", { ...baseSession, payment_status: "unpaid" }));
    expect(res.status).toBe(200);

    const [row] = await db.select().from(contributionsTable).where(eq(contributionsTable.stripeSessionId, sessionId));
    expect(row?.status).toBe("failed");
    expect(row?.paidAt).toBeNull();
    expect(row?.paymentFailureReason).toBe("The bank account could not be verified.");
    expect(contributionReceiptSpy).not.toHaveBeenCalled();
  });
});
