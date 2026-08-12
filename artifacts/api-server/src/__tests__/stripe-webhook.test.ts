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

import { beforeAll, afterAll, describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { db, festivalYearsTable, vendorsTable, activityLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

// ---------------------------------------------------------------------------
// Module mocks — vi.mock() is hoisted to the top of the file by vitest,
// so any variables it closes over must be declared with vi.hoisted().
// ---------------------------------------------------------------------------

/** Spy that records every processWebhook call. Declared via vi.hoisted() so
 *  it is available when the hoisted vi.mock() factory runs. */
const { processWebhookSpy } = vi.hoisted(() => ({
  processWebhookSpy: vi.fn().mockResolvedValue(undefined),
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
      checkout: { sessions: { create: vi.fn() } },
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
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/stripe/webhook", () => {
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
    const [vendor] = await db
      .insert(vendorsTable)
      .values({
        yearId: testYearId,
        name: "Test Vendor",
        businessName: "Test Business LLC",
        email: "vendor@example.com",
        phone: "555-0100",
        vendorType: "retail",
        status: "payment_pending",
        portalToken: `portal_test_${Date.now()}`,
        stripeSessionId: "cs_test_abc",
      })
      .returning({ id: vendorsTable.id });

    testVendorId = vendor!.id;

    const session: Partial<Stripe.Checkout.Session> = {
      id: "cs_test_abc",
      object: "checkout.session",
      payment_status: "paid",
      metadata: {
        token: "portal_test_token",
        entityType: "vendor",
        entityId: String(testVendorId),
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
      .where(eq(vendorsTable.id, testVendorId));

    expect(updated?.status).toBe("paid");
    expect(updated?.paidAt).not.toBeNull();

    // Verify an activity log entry was written
    const logs = await db
      .select()
      .from(activityLogTable)
      .where(eq(activityLogTable.entityId, testVendorId));

    expect(logs.length).toBeGreaterThanOrEqual(1);
    const paidLog = logs.find((l) => l.type === "paid");
    expect(paidLog).toBeDefined();
    expect(paidLog?.entityType).toBe("vendor");
  });
});
