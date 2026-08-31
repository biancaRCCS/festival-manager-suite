/**
 * Tests that write actions record a `performedBy` field in the activity log
 * and that the dashboard activity endpoint surfaces it.
 *
 * Strategy:
 *  - Mock `../lib/auth` so `requireStaff` is a vi.fn() spy that injects a
 *    synthetic staff member without needing a live Clerk session or real DB
 *    staff row. Per-test overrides use mockImplementationOnce.
 *  - Use the real `@workspace/db` pool (DATABASE_URL is set in the environment).
 *  - Create minimal test rows, exercise a write route, then assert the
 *    activity_log row has the expected performedBy value.
 *  - Also verify the empty-name fallback: when staff name is blank the
 *    Clerk user ID is used instead so attribution is never silently lost.
 */

import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { db, festivalYearsTable, vendorsTable, activityLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Declare the spy via vi.hoisted() so it is available inside the hoisted
// vi.mock() factory block.
// ---------------------------------------------------------------------------
const { requireStaffSpy, mockStaffBase } = vi.hoisted(() => {
  const base = {
    id: 9999,
    clerkUserId: "user_test_clerk_id",
    email: "test@festival.local",
    name: "Test Staff",
    role: "admin",
    createdAt: new Date(),
  };

  const spy = vi.fn((req: any, _res: any, next: any) => {
    req.clerkUserId = base.clerkUserId;
    req.staffMember = { ...base };
    next();
  });

  return { requireStaffSpy: spy, mockStaffBase: base };
});

vi.mock("../lib/auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireStaff: requireStaffSpy,
}));

// Import app after mocks are in place.
import app from "../app";

// ---------------------------------------------------------------------------
// Test data lifecycle
// ---------------------------------------------------------------------------
let testYearId: number;
const createdVendorIds: number[] = [];

beforeAll(async () => {
  const [year] = await db
    .insert(festivalYearsTable)
    .values({
      year: 2097,
      eventName: "Attribution Test Festival",
      eventDate: "2097-08-01",
      isActive: false,
    })
    .returning({ id: festivalYearsTable.id });
  testYearId = year!.id;
});

afterAll(async () => {
  for (const vendorId of createdVendorIds) {
    await db.delete(activityLogTable).where(eq(activityLogTable.entityId, vendorId));
    await db.delete(vendorsTable).where(eq(vendorsTable.id, vendorId));
  }
  if (testYearId) {
    await db.delete(festivalYearsTable).where(eq(festivalYearsTable.id, testYearId));
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function createTestVendor(suffix = "") {
  const [vendor] = await db
    .insert(vendorsTable)
    .values({
      yearId: testYearId,
      name: `Attribution Vendor${suffix}`,
      businessName: `Attribution Co${suffix}.`,
      email: `attr${suffix}@test.com`,
      phone: "555-0000",
      status: "pending",
      applicationData: {},
    })
    .returning({ id: vendorsTable.id });
  const vendorId = vendor!.id;
  createdVendorIds.push(vendorId);
  return vendorId;
}

async function latestActivityForVendor(vendorId: number) {
  const [row] = await db
    .select()
    .from(activityLogTable)
    .where(eq(activityLogTable.entityId, vendorId))
    .orderBy(desc(activityLogTable.createdAt))
    .limit(1);
  return row;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Activity attribution", () => {
  it("records performedBy with staff display name when name is non-empty", async () => {
    const vendorId = await createTestVendor("_named");

    const res = await request(app)
      .patch(`/api/vendors/${vendorId}/review`)
      .send({ status: "rejected", note: "attribution test" });

    expect(res.status).toBe(200);

    const log = await latestActivityForVendor(vendorId);
    expect(log).toBeDefined();
    expect(log!.performedBy).toBe("Test Staff");
  });

  it("falls back to Clerk user ID when staff name is blank", async () => {
    // Override the spy for this one call only — injects a staff member with empty name
    requireStaffSpy.mockImplementationOnce((req: any, _res: any, next: any) => {
      req.clerkUserId = mockStaffBase.clerkUserId;
      req.staffMember = { ...mockStaffBase, name: "" };
      next();
    });

    const vendorId = await createTestVendor("_blank");

    const res = await request(app)
      .patch(`/api/vendors/${vendorId}/review`)
      .send({ status: "rejected", note: "empty name fallback test" });

    expect(res.status).toBe(200);

    const log = await latestActivityForVendor(vendorId);
    expect(log).toBeDefined();
    // With blank name the route should store the Clerk user ID instead
    expect(log!.performedBy).toBe(mockStaffBase.clerkUserId);
  });

  it("rejects an unpaid approved vendor and invalidates its approval portal state", async () => {
    const [created] = await db
      .insert(vendorsTable)
      .values({
        yearId: testYearId,
        name: "Previously Approved Vendor",
        businessName: "Previously Approved Co.",
        email: "approved@test.com",
        phone: "555-0000",
        status: "approved",
        approvedAt: new Date("2097-07-01T12:00:00.000Z"),
        portalToken: "approved-portal-token",
        applicationData: {},
      })
      .returning({ id: vendorsTable.id });
    const vendorId = created!.id;
    createdVendorIds.push(vendorId);

    const res = await request(app)
      .patch(`/api/vendors/${vendorId}/review`)
      .send({ status: "rejected", note: "approved in error" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");

    const [saved] = await db
      .select({
        status: vendorsTable.status,
        approvedAt: vendorsTable.approvedAt,
        finalApprovedAt: vendorsTable.finalApprovedAt,
        portalToken: vendorsTable.portalToken,
      })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, vendorId));
    expect(saved).toEqual({
      status: "rejected",
      approvedAt: null,
      finalApprovedAt: null,
      portalToken: null,
    });
  });

  it("dashboard activity endpoint includes performedBy key on every item", async () => {
    const res = await request(app)
      .get("/api/dashboard/activity")
      .query({ limit: 5 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);

    // Every item must expose the performedBy key (null for system events is fine)
    for (const item of res.body.items) {
      expect(item).toHaveProperty("performedBy");
    }
  });
});
