import { describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth")>();
  return {
    ...actual,
    requireStaff: (req: any, _res: any, next: () => void) => {
      req.clerkUserId = "staff-direct-api-test";
      req.staffMember = { name: "Staff Direct API Test", role: "staff" };
      next();
    },
  };
});

import app from "../app";

describe("sponsor Admin-only routes", () => {
  const cases: Array<[string, string, object?]> = [
    ["patch", "/api/sponsors/1/details", {
      name: "Name",
      orgName: "Organization",
      email: "name@example.com",
      phone: "555-0100",
      website: null,
      social: null,
      sponsorshipAmount: 750,
      isInKind: false,
      inKindDescription: null,
      inKindValue: null,
    }],
    ["post", "/api/sponsors/1/mark-in-kind", { description: "Services", estimatedValue: 100 }],
    ["post", "/api/sponsors/1/manual-payment", { method: "check", amount: 750, receivedDate: "2026-08-31" }],
    ["delete", "/api/sponsors/1/manual-payment"],
  ];

  for (const [method, path, body] of cases) {
    it(`rejects Staff calling ${method.toUpperCase()} ${path}`, async () => {
      const response = await (request(app) as any)[method](path).send(body);
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: "Only admins can perform this action" });
    });
  }
});