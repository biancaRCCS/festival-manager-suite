import { describe, expect, it } from "vitest";
import type { festivalSettingsTable } from "@workspace/db";
import { calculateVendorPricing } from "../lib/vendorPricing";

type FestivalSettings = typeof festivalSettingsTable.$inferSelect;

describe("calculateVendorPricing", () => {
  it("applies the space multiplier before the discount", () => {
    const pricing = calculateVendorPricing(
      "specialty_food",
      { spacesRequested: "double" },
      undefined,
      25,
    );

    expect(pricing).toMatchObject({
      multiplier: 2,
      originalAmount: 1200,
      amountDue: 900,
      amountDueCents: 90000,
    });
  });

  it("rounds the final discounted result to the nearest cent", () => {
    const settings = { vendorPriceRetail: "10.01" } as FestivalSettings;
    const pricing = calculateVendorPricing("retail", { spacesRequested: "single" }, settings, 33);

    expect(pricing.originalAmountCents).toBe(1001);
    expect(pricing.amountDueCents).toBe(671);
    expect(pricing.amountDue).toBe(6.71);
  });

  it("supports a 100 percent discount as a zero-dollar obligation", () => {
    const pricing = calculateVendorPricing("retail", { spacesRequested: "double" }, undefined, 100);

    expect(pricing.originalAmount).toBe(600);
    expect(pricing.amountDue).toBe(0);
    expect(pricing.amountDueCents).toBe(0);
  });
});