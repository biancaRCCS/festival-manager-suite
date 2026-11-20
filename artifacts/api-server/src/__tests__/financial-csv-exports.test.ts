import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { contributionsTable, vendorsTable } from "@workspace/db";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
}));
vi.mock("@workspace/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@workspace/db")>(),
  db: mocks,
}));
vi.mock("../lib/auth", () => ({
  requireStaff: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.headers["x-test-staff"] !== "yes") {
      res.sendStatus(401);
      return;
    }
    next();
  },
}));

import router from "../routes/exportRoutes";
import { contributionsCsv, serializeCsv, settlementsCsv } from "../lib/financialCsv";

const app = express();
app.use("/api", router);
const dialect = new PgDialect();
const conditions: { sql: string; params: unknown[] }[] = [];
const contribution = {
  id: 10, yearId: 42, name: 'Ștefan, "Sponsor"', email: "friend@example.org", amount: "123.45",
  status: "processing", stripeSessionId: "test-session", paidAt: null,
  paymentFailedAt: null, paymentFailureReason: null, manualPaymentRecordedAt: null,
  manualPaymentMethod: null, manualPaymentReference: null, manualPaymentReceivedDate: null,
  manualPaymentRecordedBy: null, removedAt: null, removedBy: null,
  createdAt: new Date("2026-08-01T12:00:00Z"),
} as typeof contributionsTable.$inferSelect;
const vendor = {
  id: 20, yearId: 42, vendorType: "special_agreement", businessName: "Vendor A", name: "Contact",
  email: "vendor@example.org", phone: "555-0100", status: "final_approved", agreementSigned: true,
  specialAgreementRevenueSharePercentage: "35.00", specialAgreementGrossSales: "1000.00",
  specialAgreementDeductions: "100.00", specialAgreementAmountPaid: "100.00",
  specialAgreementPaidDate: "2026-10-01", specialAgreementSignedDate: "2026-08-01",
  specialAgreementSignedAt: new Date("2026-08-01T12:00:00Z"),
  approvedAt: null, finalApprovedAt: null, createdAt: new Date("2026-08-01T12:00:00Z"),
  specialAgreementDeductionsNotes: "Supplies,\npermits", specialAgreementSettlementNotes: null,
} as typeof vendorsTable.$inferSelect;

function results(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn((condition: SQL) => {
      conditions.push(dialect.sqlToQuery(condition));
      return chain;
    }),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  mocks.select.mockReturnValueOnce(chain);
}

beforeEach(() => {
  vi.clearAllMocks();
  conditions.length = 0;
});

describe("read-only, selected-year CSV routes", () => {
  for (const path of ["contributions", "special-agreement-settlements"]) {
    it(`${path} rejects unauthenticated requests`, async () => {
      expect((await request(app).get(`/api/export/${path}?yearId=42`)).status).toBe(401);
      expect(mocks.select).not.toHaveBeenCalled();
    });

    for (const query of ["", "?yearId=abc", "?yearId=0", "?yearId=-1", "?yearId=1.5"]) {
      it(`${path} refuses invalid year ${query || "(missing)"} instead of falling back to the active year`, async () => {
        const response = await request(app).get(`/api/export/${path}${query}`).set("x-test-staff", "yes");
        expect(response.status).toBe(400);
        expect(mocks.select).not.toHaveBeenCalled();
      });
    }

    it(`${path} exports an inactive selected year and never writes records`, async () => {
      results([{ id: 42, year: 2026, isActive: false }]);
      results(path === "contributions" ? [contribution] : [vendor]);
      const response = await request(app).get(`/api/export/${path}?yearId=42`).set("x-test-staff", "yes");
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/csv");
      expect(response.headers["content-disposition"]).toContain(`${path}-2026.csv`);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(conditions[0].params).toEqual([42]);
      expect(conditions[1].sql).toContain('"year_id"');
      expect(conditions[1].params).toEqual(path === "contributions" ? [42] : [42, "special_agreement"]);
      expect(response.text).toContain(path === "contributions" ? '"123.45"' : '"315.00","100.00","215.00"');
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.delete).not.toHaveBeenCalled();
    });

    it(`${path} returns a header-only CSV for an empty year`, async () => {
      results([{ id: 42, year: 2026 }]);
      results([]);
      const response = await request(app).get(`/api/export/${path}?yearId=42`).set("x-test-staff", "yes");
      expect(response.status).toBe(200);
      expect(response.text.trim().split("\r\n")).toHaveLength(1);
    });

    it(`${path} rejects unknown years`, async () => {
      results([]);
      const response = await request(app).get(`/api/export/${path}?yearId=42`).set("x-test-staff", "yes");
      expect(response.status).toBe(404);
      expect(mocks.select).toHaveBeenCalledTimes(1);
    });
  }
});

describe("CSV content", () => {
  it("quotes commas, quotes, newlines and Unicode and neutralizes formula cells", () => {
    expect(serializeCsv([['Ștefan, "Sponsor"\nNext line', "=SUM(1,2)", " \t@evil", 0, null]]))
      .toBe('\uFEFF"Ștefan, ""Sponsor""\nNext line","\'=SUM(1,2)","\' \t@evil","0",""\r\n');
  });

  it("includes all contribution statuses and financial dates, without changing records", () => {
    const rows = ["paid", "processing", "failed", "removed"].map(status => ({ ...contribution, status }));
    const before = JSON.stringify(rows);
    const csv = contributionsCsv(rows, 2026);
    for (const status of ["paid", "processing", "failed", "removed"]) expect(csv).toContain(`"${status}"`);
    for (const column of ["Date", "Paid At", "Payment Failed At", "Removed At", "Received Date", "Status", "Amount (USD)"]) {
      expect(csv).toContain(`"${column}"`);
    }
    expect(csv).toContain('Ștefan, ""Sponsor""');
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("preserves unknown settlement amounts as blanks and exports payout dates and both statuses", () => {
    const row = { ...vendor, specialAgreementGrossSales: null, specialAgreementDeductions: null };
    const before = JSON.stringify(row);
    const csv = settlementsCsv([row], 2026);
    expect(csv).toContain('"35","","","","","100.00","","awaiting_figures","final_approved","2026-10-01"');
    expect(csv).toContain('"Agreement Signed At"');
    expect(csv).toContain('"Supplies,\npermits"');
    expect(JSON.stringify(row)).toBe(before);
  });
});
