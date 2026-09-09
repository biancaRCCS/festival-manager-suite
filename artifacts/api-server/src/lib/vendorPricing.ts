import { festivalSettingsTable } from "@workspace/db";

export const VENDOR_CATEGORY_DEFAULT_PRICES = {
  major_food: 2000,
  specialty_food: 600,
  retail: 300,
  nonprofit: 150,
} as const;

const VENDOR_CATEGORY_PRICE_FIELDS = {
  major_food: "vendorPriceMajorFood",
  specialty_food: "vendorPriceSpecialtyFood",
  retail: "vendorPriceRetail",
  nonprofit: "vendorPriceNonprofit",
} as const;

const VENDOR_BOOTH_DIMENSIONS = {
  major_food: { single: "10′×20′", double: "20′×20′" },
  specialty_food: { single: "10′×10′", double: "10′×20′" },
  retail: { single: "10′×10′", double: "10′×20′" },
  nonprofit: { single: "10′×10′", double: "10′×20′" },
} as const;

export type VendorCategory = keyof typeof VENDOR_CATEGORY_DEFAULT_PRICES;

export function isVendorCategory(value: string): value is VendorCategory {
  return value in VENDOR_CATEGORY_DEFAULT_PRICES;
}

export function calculateVendorPricing(
  vendorType: VendorCategory,
  applicationData: unknown,
  settings: typeof festivalSettingsTable.$inferSelect | undefined,
  discountPercent: number,
) {
  const spacesRequested = typeof (applicationData as Record<string, unknown> | null)?.spacesRequested === "string"
    ? (applicationData as Record<string, unknown>).spacesRequested
    : null;
  const isDoubleSpace = spacesRequested === "double";
  const multiplier = isDoubleSpace ? 2 : 1;
  const configuredPrice = settings ? Number(settings[VENDOR_CATEGORY_PRICE_FIELDS[vendorType]]) : NaN;
  const unitAmount = Number.isFinite(configuredPrice) ? configuredPrice : VENDOR_CATEGORY_DEFAULT_PRICES[vendorType];
  const unitAmountCents = Math.round(unitAmount * 100);
  const originalAmountCents = unitAmountCents * multiplier;
  const normalizedDiscountPercent = Number.isInteger(discountPercent) && discountPercent >= 0 && discountPercent <= 100
    ? discountPercent
    : 0;
  const amountDueCents = Math.round(originalAmountCents * (100 - normalizedDiscountPercent) / 100);

  return {
    unitAmount: unitAmountCents / 100,
    multiplier,
    originalAmount: originalAmountCents / 100,
    originalAmountCents,
    discountPercent: normalizedDiscountPercent,
    amountDue: amountDueCents / 100,
    amountDueCents,
    boothDimensions: VENDOR_BOOTH_DIMENSIONS[vendorType][isDoubleSpace ? "double" : "single"],
    isDoubleSpace,
  };
}