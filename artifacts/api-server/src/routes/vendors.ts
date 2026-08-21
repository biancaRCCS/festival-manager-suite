import { Router, type IRouter } from "express";
import { db, vendorsTable, festivalYearsTable, festivalSettingsTable, activityLogTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireStaff } from "../lib/auth";
import {
  GetVendorParams,
  ListVendorsQueryParams,
  ReviewVendorParams,
  ReviewVendorBody,
  UpdateVendorCategoryParams,
  UpdateVendorCategoryBody,
  FinalApproveVendorParams,
  AssignVendorSpotParams,
  AssignVendorSpotBody,
} from "@workspace/api-zod";
import { randomBytes } from "crypto";
import { sendVendorCategoryAdjustedEmail, sendVendorPortalInviteEmail } from "../lib/email";
import { getUncachableStripeClient } from "../lib/stripeClient";

const router: IRouter = Router();

function formatVendor(v: typeof vendorsTable.$inferSelect) {
  return {
    id: v.id,
    yearId: v.yearId,
    name: v.name,
    businessName: v.businessName,
    email: v.email,
    phone: v.phone,
    vendorType: v.vendorType,
    status: v.status,
    applicationData: v.applicationData,
    agreementSigned: v.agreementSigned,
    agreementSignedName: v.agreementSignedName ?? null,
    spotNumber: v.spotNumber ?? null,
    location: v.location ?? null,
    reviewNote: v.reviewNote ?? null,
    paidAt: v.paidAt ? v.paidAt.toISOString() : null,
    settledAmount: v.settledAmount === null ? null : Number(v.settledAmount),
    pendingManualAdjustment: v.pendingManualAdjustment === null ? null : Number(v.pendingManualAdjustment),
    pendingAdjustmentTargetAmount: v.pendingAdjustmentTargetAmount === null ? null : Number(v.pendingAdjustmentTargetAmount),
    approvedAt: v.approvedAt ? v.approvedAt.toISOString() : null,
    finalApprovedAt: v.finalApprovedAt ? v.finalApprovedAt.toISOString() : null,
    createdAt: v.createdAt.toISOString(),
  };
}

const VENDOR_CATEGORY_DEFAULT_PRICES = {
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

type VendorCategory = keyof typeof VENDOR_CATEGORY_DEFAULT_PRICES;

function isVendorCategory(value: string): value is VendorCategory {
  return value in VENDOR_CATEGORY_DEFAULT_PRICES;
}

function getVendorCategoryPricing(
  vendorType: VendorCategory,
  applicationData: unknown,
  settings: typeof festivalSettingsTable.$inferSelect | undefined,
) {
  const spacesRequested = typeof (applicationData as Record<string, unknown> | null)?.spacesRequested === "string"
    ? (applicationData as Record<string, unknown>).spacesRequested
    : null;
  const isDoubleSpace = spacesRequested === "double";
  const configuredPrice = settings ? Number(settings[VENDOR_CATEGORY_PRICE_FIELDS[vendorType]]) : NaN;
  const unitPrice = Number.isFinite(configuredPrice) ? configuredPrice : VENDOR_CATEGORY_DEFAULT_PRICES[vendorType];

  return {
    amount: unitPrice * (isDoubleSpace ? 2 : 1),
    boothDimensions: VENDOR_BOOTH_DIMENSIONS[vendorType][isDoubleSpace ? "double" : "single"],
  };
}

router.get("/vendors", requireStaff, async (req, res): Promise<void> => {
  const queryParsed = ListVendorsQueryParams.safeParse(req.query);
  const yearId = queryParsed.success ? queryParsed.data.yearId : undefined;
  const status = queryParsed.success ? queryParsed.data.status : undefined;

  let query = db.select().from(vendorsTable);
  const conditions = [];
  if (yearId) conditions.push(eq(vendorsTable.yearId, yearId));
  if (status) conditions.push(eq(vendorsTable.status, status));

  const rows = conditions.length > 0
    ? await db.select().from(vendorsTable).where(and(...conditions)).orderBy(desc(vendorsTable.createdAt))
    : await db.select().from(vendorsTable).orderBy(desc(vendorsTable.createdAt));

  res.json(rows.map(formatVendor));
});

router.get("/vendors/:id", requireStaff, async (req, res): Promise<void> => {
  const parsed = GetVendorParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, parsed.data.id));
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.json(formatVendor(vendor));
});

router.patch("/vendors/:id/review", requireStaff, async (req, res): Promise<void> => {
  const paramsParsed = ReviewVendorParams.safeParse(req.params);
  const bodyParsed = ReviewVendorBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { id } = paramsParsed.data;
  const { status, note } = bodyParsed.data;

  const updates: Record<string, unknown> = {
    status,
    reviewNote: note ?? null,
  };

  if (status === "approved") {
    updates.approvedAt = new Date();
    // Generate portal token
    const portalToken = randomBytes(32).toString("hex");
    updates.portalToken = portalToken;
  }

  const [updated] = await db.update(vendorsTable)
    .set(updates)
    .where(eq(vendorsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }

  await db.insert(activityLogTable).values({
    type: status === "approved" ? "approved" : "rejected",
    message: `Vendor ${updated.name} (${updated.businessName}) ${status === "approved" ? "approved" : "rejected"}`,
    entityType: "vendor",
    entityId: updated.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  // Send portal invite email if approved
  if (status === "approved" && updated.portalToken) {
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost";
    const portalUrl = `https://${domain}/portal/${updated.portalToken}`;
    const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, updated.yearId)).limit(1);
    void sendVendorPortalInviteEmail({
      to: updated.email,
      name: updated.name,
      portalUrl,
      festivalName: years[0]?.eventName ?? "Romanian Festival",
      reviewNote: updated.reviewNote,
    });
  }

  res.json(formatVendor(updated));
});

router.patch("/vendors/:id/category", requireStaff, async (req, res): Promise<void> => {
  const paramsParsed = UpdateVendorCategoryParams.safeParse(req.params);
  const bodyParsed = UpdateVendorCategoryBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Choose a valid category and provide a reason of at least 3 characters." });
    return;
  }

  const { id } = paramsParsed.data;
  const { vendorType: newVendorType, reason } = bodyParsed.data;
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id));
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }

  const previousVendorType = vendor.vendorType;
  if (previousVendorType === newVendorType) {
    res.status(400).json({ error: "Choose a different category to update this vendor." });
    return;
  }

  const [settings] = await db.select()
    .from(festivalSettingsTable)
    .where(eq(festivalSettingsTable.yearId, vendor.yearId))
    .limit(1);
  const newPricing = getVendorCategoryPricing(newVendorType, vendor.applicationData, settings);
  const oldPricing = isVendorCategory(previousVendorType)
    ? getVendorCategoryPricing(previousVendorType, vendor.applicationData, settings)
    : null;

  if (vendor.pendingAdjustmentTargetAmount !== null) {
    res.status(409).json({
      error: "Resolve the existing manual category adjustment before making another category change.",
    });
    return;
  }

  let isPaid = Boolean(vendor.paidAt);
  let settledAmount = vendor.settledAmount === null ? null : Number(vendor.settledAmount);
  let invalidateCheckout = false;

  // A completed Checkout can reach this route before its webhook is written to
  // the database. Always inspect the tracked session before changing a vendor
  // that has one so an old amount cannot silently become payable afterward.
  if (vendor.stripeSessionId && (!isPaid || settledAmount === null)) {
    try {
      const stripe = await getUncachableStripeClient();
      let session = await stripe.checkout.sessions.retrieve(vendor.stripeSessionId);

      if (session.payment_status !== "paid" && !isPaid && session.status === "open") {
        try {
          session = await stripe.checkout.sessions.expire(vendor.stripeSessionId);
        } catch {
          // Completion can win the race with expiry. Read the canonical Stripe
          // state once more instead of treating a paid Checkout as stale.
          session = await stripe.checkout.sessions.retrieve(vendor.stripeSessionId);
        }
      }

      if (session.payment_status === "paid" && session.amount_total !== null) {
        isPaid = true;
        settledAmount ??= session.amount_total / 100;
      } else if (!isPaid) {
        invalidateCheckout = true;
      }
    } catch {
      res.status(409).json({
        error: "RCCS could not verify or invalidate this vendor's Stripe Checkout. The category was not changed.",
      });
      return;
    }
  }

  if (isPaid && (settledAmount === null || !Number.isFinite(settledAmount))) {
    res.status(409).json({
      error: "RCCS could not verify this vendor's original settled payment. The category was not changed.",
    });
    return;
  }

  const difference = settledAmount === null ? 0 : newPricing.amount - settledAmount;
  const updates: Record<string, unknown> = {
    vendorType: newVendorType,
    pricingRevision: sql`${vendorsTable.pricingRevision} + 1`,
  };
  if (isPaid) {
    updates.status = vendor.status === "final_approved" ? "final_approved" : "paid";
    updates.paidAt = vendor.paidAt ?? new Date();
    updates.settledAmount = settledAmount!.toFixed(2);
    if (difference !== 0) {
      updates.pendingManualAdjustment = difference.toFixed(2);
      updates.pendingAdjustmentTargetAmount = newPricing.amount.toFixed(2);
    }
  } else if (invalidateCheckout) {
    updates.stripeSessionId = null;
    if (vendor.status === "payment_pending") updates.status = "approved";
  }

  const [updated] = await db.update(vendorsTable)
    .set(updates)
    .where(eq(vendorsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }

  const vendorLabel = (type: string) => ({
    major_food: "Major Food Vendor",
    specialty_food: "Specialty Food & Beverage Vendor",
    retail: "Retail, Artisan & Business Vendor",
    nonprofit: "Verified Nonprofit Organization",
  })[type] ?? type;
  await db.insert(activityLogTable).values({
    type: "category_changed",
    message: `Vendor ${updated.name} (${updated.businessName}) category changed from ${vendorLabel(previousVendorType)} to ${vendorLabel(newVendorType)}. Reason: ${reason}`,
    entityType: "vendor",
    entityId: updated.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  const oldAmount = settledAmount ?? oldPricing?.amount ?? null;
  const paymentAdjustment = {
    isPaid,
    direction: difference > 0 ? "collect" : difference < 0 ? "refund" : "none",
    amount: Math.abs(difference),
  } as const;

  const canNotifyUnpaidVendor = !isPaid
    && Boolean(updated.portalToken)
    && ["approved", "payment_pending"].includes(updated.status);
  if (canNotifyUnpaidVendor) {
    const [year] = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, vendor.yearId)).limit(1);
    void sendVendorCategoryAdjustedEmail({
      to: updated.email,
      name: updated.name,
      vendorType: newVendorType,
      amountDue: newPricing.amount,
      boothDimensions: newPricing.boothDimensions,
      reason,
      festivalName: year?.eventName ?? "Romanian Festival",
    });
  }

  res.json({
    vendor: formatVendor(updated),
    previousVendorType,
    newVendorType,
    oldAmount,
    newAmount: newPricing.amount,
    boothDimensions: newPricing.boothDimensions,
    paymentAdjustment,
  });
});

router.patch("/vendors/:id/settle-category-adjustment", requireStaff, async (req, res): Promise<void> => {
  const parsed = GetVendorParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, parsed.data.id));
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  if (vendor.pendingAdjustmentTargetAmount === null || vendor.pendingManualAdjustment === null) {
    res.status(409).json({ error: "This vendor has no manual category adjustment awaiting settlement." });
    return;
  }

  const [updated] = await db.update(vendorsTable)
    .set({
      settledAmount: vendor.pendingAdjustmentTargetAmount,
      pendingManualAdjustment: null,
      pendingAdjustmentTargetAmount: null,
    })
    .where(eq(vendorsTable.id, vendor.id))
    .returning();

  await db.insert(activityLogTable).values({
    type: "category_adjustment_settled",
    message: `Vendor ${vendor.name} (${vendor.businessName}) manual ${Number(vendor.pendingManualAdjustment) > 0 ? "collection" : "refund"} of $${Math.abs(Number(vendor.pendingManualAdjustment)).toFixed(2)} marked handled.`,
    entityType: "vendor",
    entityId: vendor.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  res.json(formatVendor(updated));
});

router.patch("/vendors/:id/final-approve", requireStaff, async (req, res): Promise<void> => {
  const parsed = FinalApproveVendorParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, parsed.data.id));
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  if (vendor.pendingAdjustmentTargetAmount !== null) {
    res.status(409).json({ error: "Resolve the vendor's manual category adjustment before final approval." });
    return;
  }

  const [updated] = await db.update(vendorsTable)
    .set({ status: "final_approved", finalApprovedAt: new Date() })
    .where(eq(vendorsTable.id, parsed.data.id))
    .returning();

  await db.insert(activityLogTable).values({
    type: "final_approved",
    message: `Vendor ${updated.name} (${updated.businessName}) final approved`,
    entityType: "vendor",
    entityId: updated.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  res.json(formatVendor(updated));
});

router.patch("/vendors/:id/assign", requireStaff, async (req, res): Promise<void> => {
  const paramsParsed = AssignVendorSpotParams.safeParse(req.params);
  const bodyParsed = AssignVendorSpotBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [updated] = await db.update(vendorsTable)
    .set({ spotNumber: bodyParsed.data.spotNumber, location: bodyParsed.data.location })
    .where(eq(vendorsTable.id, paramsParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }

  await db.insert(activityLogTable).values({
    type: "assigned",
    message: `Vendor ${updated.name} assigned spot ${bodyParsed.data.spotNumber} at ${bodyParsed.data.location}`,
    entityType: "vendor",
    entityId: updated.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  res.json(formatVendor(updated));
});

router.delete("/vendors/:id", requireStaff, async (req, res): Promise<void> => {
  const parsed = GetVendorParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [deleted] = await db.delete(vendorsTable).where(eq(vendorsTable.id, parsed.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  await db.insert(activityLogTable).values({
    type: "deleted",
    message: `Vendor record deleted: ${deleted.name} (${deleted.businessName})`,
    entityType: "vendor",
    entityId: deleted.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });
  res.status(204).send();
});

export default router;
