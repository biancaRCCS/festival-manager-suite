import { describe, expect, it, vi } from "vitest";
import { requireAdmin } from "../lib/auth";

describe("requireAdmin", () => {
  it("rejects Staff with 403", () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    requireAdmin({ staffMember: { role: "staff" } } as any, { status, json } as any, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: "Only admins can perform this action" });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows Admin", () => {
    const next = vi.fn();
    requireAdmin({ staffMember: { role: "admin" } } as any, {} as any, next);
    expect(next).toHaveBeenCalledOnce();
  });
});