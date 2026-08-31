/**
 * Tests for the sponsor pay-first Checkout flow: creating/reusing a Checkout
 * session, the resend-payment-link staff action, and webhook fulfillment.
 *
 * Includes a concurrency regression test for a payment-integrity bug where
 * two concurrent calls to getOrCreateSponsorCheckoutUrl (e.g. two staff
 * members both clicking "Resend Payment Link") could each create a Stripe
 * Checkout session and one would silently overwrite the other's session id
 * in the database — orphaning whichever session the sponsor actually paid
 * through, since the webhook match requires the stored stripeSessionId to
 * equal the paid session's id.
 */

import { beforeAll, afterAll, afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { db, festivalYearsTable, festivalSettingsTable, sponsorsTable, activityLogTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";

// ---------------------------------------------------------------------------
// Module mocks — vi.mock() is hoisted to the top of the file by vitest,
// so any variables it closes over must be declared with vi.hoisted().
// ---------------------------------------------------------------------------

const {
  processWebhookSpy,
  checkoutSessionCreateSpy,
  checkoutSessionRetrieveSpy,
  checkoutSessionExpireSpy,
  paymentIntentRetrieveSpy,
  paymentReceiptSpy,
  paymentLinkEmailSpy,
  newApplicationNotificationSpy,
} = vi.hoisted(() => ({
  processWebhookSpy: vi.fn().mockResolvedValue(undefined),
  checkoutSessionCreateSpy: vi.fn(),
  checkoutSessionRetrieveSpy: vi.fn(),
  checkoutSessionExpireSpy: vi.fn().mockResolvedValue(undefined),
  paymentIntentRetrieveSpy: vi.fn().mockResolvedValue({ last_payment_error: null }),
  paymentReceiptSpy: vi.fn().mockResolvedValue(undefined),
  paymentLinkEmailSpy: vi.fn().mockResolvedValue(undefined),
  newApplicationNotificationSpy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/stripeClient", () => ({
  getStripeSync: vi.fn().mockResolvedValue({ processWebhook: processWebhookSpy }),
  getUncachableStripeClient: vi.fn().mockResolvedValue({
    checkout: {
      sessions: {
        create: checkoutSessionCreateSpy,
        retrieve: checkoutSessionRetrieveSpy,
        expire: checkoutSessionExpireSpy,
      },
    },
    paymentIntents: {
      retrieve: paymentIntentRetrieveSpy,
    },
    webhooks: {
      constructEvent: (payload: Buffer, _sig: string, _secret: string): Stripe.Event =>
        JSON.parse(payload.toString()) as Stripe.Event,
    },
  }),
  getWebhookSecret: vi.fn().mockResolvedValue("whsec_test_secret"),
  persistWebhookSecret: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/email")>();
  return {
    ...actual,
    sendSponsorPaymentReceiptEmail: paymentReceiptSpy,
    sendSponsorPaymentLinkEmail: paymentLinkEmailSpy,
    sendNewApplicationNotification: newApplicationNotificationSpy,
  };
});

vi.mock("../lib/auth", () => ({
  requireStaff: (req: any, _res: any, next: () => void) => {
    req.clerkUserId = "test-staff";
    req.staffMember = { name: "Test Staff", role: "admin" };
    next();
  },
  requireAdmin: (_req: any, _res: any, next: () => void) => next(),
}));

// Import after mocks so they take effect.
// eslint-disable-next-line import/first
import app from "../app";
// eslint-disable-next-line import/first
import { getOrCreateSponsorCheckoutUrl } from "../routes/stripe";

// ---------------------------------------------------------------------------
// Test data setup / teardown
// ---------------------------------------------------------------------------

let testYearId: number;

function makeEvent(type: string, data: object): Stripe.Event {
  return {
    id: `evt_test_${Date.now()}_${Math.random()}`,
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

async function postWebhook(body: object) {
  return request(app)
    .post("/api/stripe/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", "t=1,v1=test,v0=test")
    .send(JSON.stringify(body));
}

async function createSponsor(overrides: Partial<typeof sponsorsTable.$inferInsert> = {}) {
  const [sponsor] = await db
    .insert(sponsorsTable)
    .values({
      yearId: testYearId,
      name: "Test Sponsor",
      orgName: `Test Org ${Date.now()}_${Math.random()}`,
      email: "sponsor@example.com",
      phone: "555-0100",
      tier: "bronze",
      sponsorshipAmount: "750.00",
      status: "pending_payment",
      ...overrides,
    })
    .returning();
  return sponsor!;
}

beforeAll(async () => {
  const [year] = await db
    .insert(festivalYearsTable)
    .values({
      year: 2098,
      eventName: "Test Sponsor Checkout Festival",
      eventDate: "2098-08-01",
      isActive: false,
    })
    .returning({ id: festivalYearsTable.id });
  testYearId = year!.id;

  // Relies on column defaults for all sponsor tier prices.
  await db.insert(festivalSettingsTable).values({ yearId: testYearId });
});

afterAll(async () => {
  if (testYearId) {
    await db.delete(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, testYearId));
    await db.delete(festivalYearsTable).where(eq(festivalYearsTable.id, testYearId));
  }
});

beforeEach(() => {
  checkoutSessionCreateSpy.mockReset();
  checkoutSessionRetrieveSpy.mockReset();
  checkoutSessionExpireSpy.mockClear();
  paymentIntentRetrieveSpy.mockReset();
  paymentIntentRetrieveSpy.mockResolvedValue({ last_payment_error: null });
  paymentReceiptSpy.mockClear();
  paymentLinkEmailSpy.mockClear();
  newApplicationNotificationSpy.mockClear();
});

afterEach(async () => {
  if (!testYearId) return;
  const sponsorIds = (
    await db.select({ id: sponsorsTable.id }).from(sponsorsTable).where(eq(sponsorsTable.yearId, testYearId))
  ).map((s) => s.id);
  if (sponsorIds.length > 0) {
    await db.delete(activityLogTable).where(inArray(activityLogTable.entityId, sponsorIds));
    await db.delete(sponsorsTable).where(inArray(sponsorsTable.id, sponsorIds));
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sponsor pay-first Checkout", () => {
  it("creates and stores a Checkout session for a pending_payment sponsor", async () => {
    const sponsor = await createSponsor();
    checkoutSessionCreateSpy.mockResolvedValue({ id: "cs_test_new", url: "https://checkout.example.test/new" });

    const url = await getOrCreateSponsorCheckoutUrl(sponsor.id);

    expect(url).toBe("https://checkout.example.test/new");
    const [updated] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(updated?.stripeSessionId).toBe("cs_test_new");
  });

  it("reuses an existing open Checkout session instead of creating a new one", async () => {
    const sponsor = await createSponsor({ stripeSessionId: "cs_test_existing" });
    checkoutSessionRetrieveSpy.mockResolvedValue({
      id: "cs_test_existing",
      status: "open",
      url: "https://checkout.example.test/existing",
    });

    const url = await getOrCreateSponsorCheckoutUrl(sponsor.id);

    expect(url).toBe("https://checkout.example.test/existing");
    expect(checkoutSessionCreateSpy).not.toHaveBeenCalled();
  });

  it("resolves a concurrent race by claiming exactly one session, expiring the loser, and handing both callers the same winning url", async () => {
    const sponsor = await createSponsor({ stripeSessionId: null });

    // Two concurrent calls each create their own Stripe session before either
    // has written to the database. A small artificial delay (mirroring a real
    // Stripe API round-trip) reliably widens the race window so both calls'
    // initial reads land before either has claimed a session, exercising the
    // conflicting-claim path deterministically instead of leaving it to chance.
    let callCount = 0;
    checkoutSessionCreateSpy.mockImplementation(async () => {
      callCount += 1;
      const isFirst = callCount === 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return isFirst
        ? { id: "cs_test_A", url: "https://checkout.example.test/A" }
        : { id: "cs_test_B", url: "https://checkout.example.test/B" };
    });
    // Whichever call loses the DB claim retrieves the winner's session to hand
    // back a valid, still-payable url.
    checkoutSessionRetrieveSpy.mockImplementation(async (sessionId: string) => ({
      id: sessionId,
      status: "open",
      url: `https://checkout.example.test/${sessionId.endsWith("A") ? "A" : "B"}`,
    }));

    const [urlOne, urlTwo] = await Promise.all([
      getOrCreateSponsorCheckoutUrl(sponsor.id),
      getOrCreateSponsorCheckoutUrl(sponsor.id),
    ]);

    // Both callers must be handed a url for the SAME session that ultimately
    // ends up stored on the sponsor row — otherwise a sponsor who pays via
    // the "losing" link would have their payment silently dropped.
    const [finalRow] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(finalRow?.stripeSessionId).not.toBeNull();
    const winningLetter = finalRow!.stripeSessionId!.endsWith("A") ? "A" : "B";
    const expectedUrl = `https://checkout.example.test/${winningLetter}`;

    expect(urlOne).toBe(expectedUrl);
    expect(urlTwo).toBe(expectedUrl);

    // The 20ms delay on session creation is expected to force both calls to
    // read the sponsor row before either has claimed a session, so both reach
    // the create-and-claim path (the actual regression scenario). Assert that
    // happened, then require the losing session to have been expired rather
    // than left dangling and payable.
    expect(checkoutSessionCreateSpy).toHaveBeenCalledTimes(2);
    expect(checkoutSessionExpireSpy).toHaveBeenCalledTimes(1);
    const losingId = winningLetter === "A" ? "cs_test_B" : "cs_test_A";
    expect(checkoutSessionExpireSpy).toHaveBeenCalledWith(losingId);
  });

  it("rejects creating a Checkout session for a sponsor that isn't pending_payment", async () => {
    const sponsor = await createSponsor({ status: "approved" });
    await expect(getOrCreateSponsorCheckoutUrl(sponsor.id)).rejects.toThrow("expected 'pending_payment'");
    expect(checkoutSessionCreateSpy).not.toHaveBeenCalled();
  });

  it("reconciles instead of issuing a second payable link when the stored session already completed payment before the webhook landed", async () => {
    // Simulates the sponsor paying successfully, then someone (e.g. staff
    // clicking "Resend Payment Link", or a retried apply-time call) hitting
    // getOrCreateSponsorCheckoutUrl before checkout.session.completed has
    // been processed. Our DB row is still 'pending_payment', but Stripe
    // already shows the session as paid — creating a fresh session here
    // would let the sponsor be charged twice.
    const sponsor = await createSponsor({ stripeSessionId: "cs_test_already_paid" });
    checkoutSessionRetrieveSpy.mockResolvedValue({
      id: "cs_test_already_paid",
      status: "complete",
      url: null,
      payment_status: "paid",
      amount_total: 75000,
      metadata: { entityType: "sponsor", entityId: String(sponsor.id) },
    });

    await expect(getOrCreateSponsorCheckoutUrl(sponsor.id)).rejects.toThrow("already completed payment");

    expect(checkoutSessionCreateSpy).not.toHaveBeenCalled();
    const [updated] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(updated?.status).toBe("paid");
    expect(updated?.paidAt).not.toBeNull();
    expect(paymentReceiptSpy).toHaveBeenCalledOnce();
  });

  it("replaces a definitively expired (never-paid) stored session with a fresh one", async () => {
    const sponsor = await createSponsor({ stripeSessionId: "cs_test_expired" });
    checkoutSessionRetrieveSpy.mockResolvedValue({
      id: "cs_test_expired",
      status: "expired",
      url: null,
      payment_status: "unpaid",
    });
    checkoutSessionCreateSpy.mockResolvedValue({ id: "cs_test_fresh", url: "https://checkout.example.test/fresh" });

    const url = await getOrCreateSponsorCheckoutUrl(sponsor.id);

    expect(url).toBe("https://checkout.example.test/fresh");
    const [updated] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(updated?.stripeSessionId).toBe("cs_test_fresh");
    expect(updated?.status).toBe("pending_payment");
  });

  it("reconciles instead of returning a stale url when the concurrently-won session turns out to already be paid", async () => {
    const sponsor = await createSponsor({ stripeSessionId: null });

    // First call (this test's direct invocation) loses the DB claim to a
    // second, concurrent caller that we simulate by updating the row out from
    // under it right after the first call reads the sponsor but before it
    // claims a session.
    checkoutSessionCreateSpy.mockImplementation(async () => {
      // Simulate the sponsor's payment completing (and the webhook already
      // having claimed the row for a *different* session) while our call is
      // still in flight creating its own (soon to be discarded) session.
      await db
        .update(sponsorsTable)
        .set({ stripeSessionId: "cs_test_winner_paid", status: "paid", paidAt: new Date() })
        .where(eq(sponsorsTable.id, sponsor.id));
      return { id: "cs_test_loser", url: "https://checkout.example.test/loser" };
    });
    checkoutSessionRetrieveSpy.mockResolvedValue({
      id: "cs_test_winner_paid",
      status: "complete",
      url: null,
      payment_status: "paid",
      amount_total: 75000,
      metadata: { entityType: "sponsor", entityId: String(sponsor.id) },
    });

    await expect(getOrCreateSponsorCheckoutUrl(sponsor.id)).rejects.toThrow("already completed payment");

    expect(checkoutSessionExpireSpy).toHaveBeenCalledWith("cs_test_loser");
    const [updated] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(updated?.status).toBe("paid");
  });
});

describe("POST /api/sponsors/:id/resend-payment-link", () => {
  it("refuses all cash-payment paths for an in-kind sponsor", async () => {
    const sponsor = await createSponsor({ isInKind: true, status: "paid" });
    const resend = await request(app).post(`/api/sponsors/${sponsor.id}/resend-payment-link`);
    const manual = await request(app).post(`/api/sponsors/${sponsor.id}/manual-payment`).send({
      method: "cash", amount: 750, receivedDate: "2026-01-01",
    });
    await expect(getOrCreateSponsorCheckoutUrl(sponsor.id)).rejects.toThrow("in-kind");
    expect(resend.status).toBe(409);
    expect(manual.status).toBe(409);
    expect(checkoutSessionCreateSpy).not.toHaveBeenCalled();
  });
  it("creates a Checkout session, emails the link, and logs the resend", async () => {
    const sponsor = await createSponsor();
    checkoutSessionCreateSpy.mockResolvedValue({ id: "cs_test_resend", url: "https://checkout.example.test/resend" });

    const res = await request(app).post(`/api/sponsors/${sponsor.id}/resend-payment-link`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ checkoutUrl: "https://checkout.example.test/resend" });
    expect(paymentLinkEmailSpy).toHaveBeenCalledOnce();

    const logs = await db.select().from(activityLogTable).where(eq(activityLogTable.entityId, sponsor.id));
    expect(logs.some((l) => l.type === "email_resent")).toBe(true);
  });

  it("refuses to resend a payment link for a sponsor that isn't pending_payment", async () => {
    const sponsor = await createSponsor({ status: "paid", stripeSessionId: "cs_already_paid" });

    const res = await request(app).post(`/api/sponsors/${sponsor.id}/resend-payment-link`);

    expect(res.status).toBe(409);
    expect(checkoutSessionCreateSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/sponsors/:id/mark-in-kind", () => {
  it("requires a positive estimated value with cent precision", async () => {
    const sponsor = await createSponsor();
    expect((await request(app).post(`/api/sponsors/${sponsor.id}/mark-in-kind`).send({ description: "Donated goods" })).status).toBe(400);
    expect((await request(app).post(`/api/sponsors/${sponsor.id}/mark-in-kind`).send({ description: "Donated goods", estimatedValue: 1.001 })).status).toBe(400);
    const [unchanged] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(unchanged).toMatchObject({ isInKind: false, sponsorshipAmount: "750.00", inKindValue: null });
  });

  it("expires an open Checkout and fulfills without a cash payment record", async () => {
    const sponsor = await createSponsor({ tier: "diamond", sponsorshipAmount: "10000.00", stripeSessionId: "cs_in_kind_open" });
    checkoutSessionRetrieveSpy.mockResolvedValue({ id: "cs_in_kind_open", status: "open", payment_status: "unpaid" });

    const res = await request(app).post(`/api/sponsors/${sponsor.id}/mark-in-kind`).send({ description: "  Donated event printing  ", estimatedValue: 1200.50 });

    expect(res.status).toBe(200);
    expect(checkoutSessionExpireSpy).toHaveBeenCalledWith("cs_in_kind_open");
    const [updated] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(updated).toMatchObject({ status: "paid", tier: "diamond", isInKind: true, inKindDescription: "Donated event printing", sponsorshipAmount: "0.00", inKindValue: "1200.50", stripeSessionId: null, paidAt: null });
    expect(updated?.manualPaymentRecordedAt).toBeNull();
  });

  it("does not mark a paid or processing Checkout in-kind", async () => {
    const sponsor = await createSponsor({ stripeSessionId: "cs_in_kind_paid" });
    checkoutSessionRetrieveSpy.mockResolvedValue({ id: "cs_in_kind_paid", status: "complete", payment_status: "paid" });

    const res = await request(app).post(`/api/sponsors/${sponsor.id}/mark-in-kind`).send({ description: "Donated goods", estimatedValue: 750 });

    expect(res.status).toBe(409);
    const [unchanged] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(unchanged?.isInKind).toBe(false);
    expect(unchanged?.status).toBe("pending_payment");
  });
});

describe("checkout.session.completed webhook for sponsors", () => {
  it("ignores stale cash-payment webhooks for an in-kind sponsor", async () => {
    const sponsor = await createSponsor({ isInKind: true, status: "paid", stripeSessionId: "cs_in_kind_stale" });
    const res = await postWebhook(makeEvent("checkout.session.completed", {
      id: "cs_in_kind_stale", object: "checkout.session", payment_status: "paid", amount_total: 75000,
      metadata: { entityType: "sponsor", entityId: String(sponsor.id) },
    }));
    expect(res.status).toBe(200);
    const [unchanged] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(unchanged?.paidAt).toBeNull();
    expect(unchanged?.stripePaidAt).toBeNull();
    expect(paymentReceiptSpy).not.toHaveBeenCalled();
  });
  it("restores a timestamp-proven sponsor status without sending email", async () => {
    const sponsor = await createSponsor({
      status: "paid",
      approvedAt: new Date("2026-08-24T04:02:05.233Z"),
      detailsSubmittedAt: new Date("2026-08-24T04:41:00.039Z"),
      finalApprovedAt: new Date("2026-08-24T20:58:42.385Z"),
      paidAt: new Date("2026-08-26T02:15:18.136Z"),
      stripeSessionId: "cs_status_repair",
    });

    const before = await request(app).get(`/api/sponsors/${sponsor.id}`);
    expect(before.body).toMatchObject({
      status: "paid",
      statusNeedsRepair: true,
      timestampImpliedStatus: "details_approved",
    });

    const res = await request(app).patch(`/api/sponsors/${sponsor.id}/reconcile-status-from-timestamps`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: sponsor.id,
      status: "details_approved",
      statusNeedsRepair: false,
      timestampImpliedStatus: "details_approved",
      paidAt: "2026-08-26T02:15:18.136Z",
    });
    expect(paymentReceiptSpy).not.toHaveBeenCalled();
    expect(paymentLinkEmailSpy).not.toHaveBeenCalled();
    expect(newApplicationNotificationSpy).not.toHaveBeenCalled();

    const logs = await db.select().from(activityLogTable).where(eq(activityLogTable.entityId, sponsor.id));
    expect(logs).toContainEqual(expect.objectContaining({
      type: "status_reconciled",
      performedBy: "Test Staff",
    }));
  });

  it("does not update or log a sponsor whose status already matches its timestamps", async () => {
    const sponsor = await createSponsor({
      status: "details_submitted",
      approvedAt: new Date("2026-08-24T04:02:05.233Z"),
      detailsSubmittedAt: new Date("2026-08-24T04:41:00.039Z"),
    });

    const res = await request(app).patch(`/api/sponsors/${sponsor.id}/reconcile-status-from-timestamps`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "details_submitted",
      statusNeedsRepair: false,
      timestampImpliedStatus: "details_submitted",
    });
    expect(await db.select().from(activityLogTable).where(eq(activityLogTable.entityId, sponsor.id))).toHaveLength(0);
    expect(paymentReceiptSpy).not.toHaveBeenCalled();
    expect(paymentLinkEmailSpy).not.toHaveBeenCalled();
    expect(newApplicationNotificationSpy).not.toHaveBeenCalled();
  });

  it("marks a sponsor paid, logs it, and sends the receipt + staff notification", async () => {
    const sponsor = await createSponsor({ stripeSessionId: "cs_test_paid" });

    const session: Partial<Stripe.Checkout.Session> = {
      id: "cs_test_paid",
      object: "checkout.session",
      payment_status: "paid",
      amount_total: 75000,
      metadata: { entityType: "sponsor", entityId: String(sponsor.id) },
    };

    const res = await postWebhook(makeEvent("checkout.session.completed", session));
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(updated?.status).toBe("paid");
    expect(updated?.paidAt).not.toBeNull();

    const logs = await db.select().from(activityLogTable).where(eq(activityLogTable.entityId, sponsor.id));
    expect(logs.some((l) => l.type === "paid")).toBe(true);

    expect(paymentReceiptSpy).toHaveBeenCalledOnce();
    expect(newApplicationNotificationSpy).toHaveBeenCalledOnce();
  });

  it("records a paid Checkout without moving a details-approved sponsor backwards", async () => {
    const completedAt = new Date("2026-08-24T20:58:42.385Z");
    const sponsor = await createSponsor({
      status: "details_approved",
      detailsSubmittedAt: new Date("2026-08-24T04:41:00.039Z"),
      finalApprovedAt: completedAt,
      stripeSessionId: "cs_late_details_approved",
    });
    const event = makeEvent("checkout.session.completed", {
      id: "cs_late_details_approved",
      object: "checkout.session",
      payment_status: "paid",
      amount_total: 125000,
      metadata: { entityType: "sponsor", entityId: String(sponsor.id) },
    });

    expect((await postWebhook(event)).status).toBe(200);
    expect((await postWebhook(event)).status).toBe(200);

    const [updated] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(updated).toMatchObject({
      status: "details_approved",
      stripeSettledAmount: "1250.00",
      finalApprovedAt: completedAt,
    });
    expect(updated?.paidAt).not.toBeNull();
    expect(updated?.stripePaidAt).not.toBeNull();
    expect(paymentReceiptSpy).toHaveBeenCalledOnce();
    expect(newApplicationNotificationSpy).toHaveBeenCalledOnce();
  });

  it("ignores a webhook whose session id no longer matches the sponsor's current session", async () => {
    // Simulates a stale/orphaned session being paid after the sponsor's
    // record has already moved on (e.g. status changed away from
    // pending_payment, or a different session was legitimately claimed).
    const sponsor = await createSponsor({ status: "approved", stripeSessionId: null });

    const res = await postWebhook(
      makeEvent("checkout.session.completed", {
        id: "cs_orphaned_session",
        object: "checkout.session",
        payment_status: "paid",
        amount_total: 75000,
        metadata: { entityType: "sponsor", entityId: String(sponsor.id) },
      }),
    );
    expect(res.status).toBe(200);

    const [unchanged] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(unchanged?.status).toBe("approved");
    expect(unchanged?.paidAt).toBeNull();
    expect(paymentReceiptSpy).not.toHaveBeenCalled();
  });

  it("moves an unpaid completed Checkout into payment processing, then fulfills async success", async () => {
    const sponsor = await createSponsor({ stripeSessionId: "cs_sponsor_async_success" });
    const session = {
      id: "cs_sponsor_async_success",
      object: "checkout.session",
      amount_total: 75000,
      metadata: { entityType: "sponsor", entityId: String(sponsor.id) },
    };

    const pending = await postWebhook(makeEvent("checkout.session.completed", {
      ...session,
      payment_status: "unpaid",
    }));
    expect(pending.status).toBe(200);

    const [processing] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(processing?.status).toBe("payment_processing");
    expect(processing?.paidAt).toBeNull();
    expect(paymentReceiptSpy).not.toHaveBeenCalled();

    const success = await postWebhook(makeEvent("checkout.session.async_payment_succeeded", {
      ...session,
      payment_status: "paid",
    }));
    expect(success.status).toBe(200);

    const [paid] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(paid?.status).toBe("paid");
    expect(paid?.paidAt).not.toBeNull();
    expect(paymentReceiptSpy).toHaveBeenCalledOnce();
    expect(newApplicationNotificationSpy).toHaveBeenCalledOnce();
  });

  it("records ACH success without moving a details-submitted sponsor backwards", async () => {
    const detailsSubmittedAt = new Date("2026-08-24T04:41:00.039Z");
    const stripeSettlementAt = new Date("2026-08-26T18:42:17.000Z");
    const sponsor = await createSponsor({
      status: "details_submitted",
      detailsSubmittedAt,
      stripeSessionId: "cs_sponsor_async_late_success",
    });

    const event = makeEvent("checkout.session.async_payment_succeeded", {
      id: "cs_sponsor_async_late_success",
      object: "checkout.session",
      payment_status: "paid",
      amount_total: 90000,
      metadata: { entityType: "sponsor", entityId: String(sponsor.id) },
    });
    event.created = Math.floor(stripeSettlementAt.getTime() / 1000);
    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(updated).toMatchObject({
      status: "details_submitted",
      detailsSubmittedAt,
      stripeSettledAmount: "900.00",
    });
    expect(updated?.stripePaidAt).toEqual(stripeSettlementAt);
    expect(updated?.paidAt).toEqual(stripeSettlementAt);
  });

  it("reverts a failed async sponsor payment and records the Stripe failure reason", async () => {
    const sponsor = await createSponsor({
      status: "payment_processing",
      stripeSessionId: "cs_sponsor_async_failed",
    });
    paymentIntentRetrieveSpy.mockResolvedValue({
      id: "pi_sponsor_async_failed",
      last_payment_error: { message: "The bank account was closed." },
    });

    const res = await postWebhook(makeEvent("checkout.session.async_payment_failed", {
      id: "cs_sponsor_async_failed",
      object: "checkout.session",
      payment_status: "unpaid",
      amount_total: 75000,
      payment_intent: "pi_sponsor_async_failed",
      metadata: { entityType: "sponsor", entityId: String(sponsor.id) },
    }));
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(updated?.status).toBe("pending_payment");
    expect(updated?.paidAt).toBeNull();
    expect(updated?.paymentFailedAt).not.toBeNull();
    expect(updated?.paymentFailureReason).toBe("The bank account was closed.");

    const logs = await db.select().from(activityLogTable).where(eq(activityLogTable.entityId, sponsor.id));
    expect(logs.some((log) => log.type === "payment_failed")).toBe(true);
    expect(paymentReceiptSpy).not.toHaveBeenCalled();
  });

  it("records ACH failure without moving a details-approved sponsor backwards", async () => {
    const finalApprovedAt = new Date("2026-08-24T20:58:42.385Z");
    const sponsor = await createSponsor({
      status: "details_approved",
      detailsSubmittedAt: new Date("2026-08-24T04:41:00.039Z"),
      finalApprovedAt,
      stripeSessionId: "cs_sponsor_async_late_failure",
    });
    paymentIntentRetrieveSpy.mockResolvedValue({
      id: "pi_sponsor_async_late_failure",
      last_payment_error: { message: "The bank account could not be verified." },
    });

    const res = await postWebhook(makeEvent("checkout.session.async_payment_failed", {
      id: "cs_sponsor_async_late_failure",
      object: "checkout.session",
      payment_status: "unpaid",
      amount_total: 75000,
      payment_intent: "pi_sponsor_async_late_failure",
      metadata: { entityType: "sponsor", entityId: String(sponsor.id) },
    }));
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsor.id));
    expect(updated).toMatchObject({
      status: "details_approved",
      finalApprovedAt,
      paymentFailureReason: "The bank account could not be verified.",
    });
    expect(updated?.paymentFailedAt).not.toBeNull();
  });
});
