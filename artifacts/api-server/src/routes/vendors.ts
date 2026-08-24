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
  ListSpecialAgreementVendorsQueryParams,
  CreateSpecialAgreementVendorBody,
  GetSpecialAgreementSettlementSummaryQueryParams,
  GetSpecialAgreementSettlementSummaryResponse,
  UpdateSpecialAgreementSettlementParams,
  UpdateSpecialAgreementSettlementBody,
  UpdateSpecialAgreementSettlementResponse,
} from "@workspace/api-zod";
import { randomBytes } from "crypto";
import {
  sendApplicantConfirmation,
  sendVendorCategoryAdjustedEmail,
  sendVendorPortalInviteEmail,
  sendSpecialAgreementPortalInviteEmail,
  sendSpecialAgreementCreatedNotification,
  VENDOR_LABELS,
} from "../lib/email";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { deriveSpecialAgreementSettlement } from "../lib/specialAgreementSettlement";

const router: IRouter = Router();

function formatVendor(v: typeof vendorsTable.$inferSelect) {
  const settlement = deriveSpecialAgreementSettlement(v);
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
    specialAgreementOperationType: v.specialAgreementOperationType ?? null,
    specialAgreementRevenueSharePercentage: v.specialAgreementRevenueSharePercentage === null
      ? null
      : Number(v.specialAgreementRevenueSharePercentage),
    specialAgreementInternalNotes: v.specialAgreementInternalNotes ?? null,
    specialAgreementDayOfContactName: v.specialAgreementDayOfContactName ?? null,
    specialAgreementDayOfContactPhone: v.specialAgreementDayOfContactPhone ?? null,
    specialAgreementBackupContactName: v.specialAgreementBackupContactName ?? null,
    specialAgreementBackupContactPhone: v.specialAgreementBackupContactPhone ?? null,
    specialAgreementSignedDate: v.specialAgreementSignedDate ?? null,
    specialAgreementSignedAt: v.specialAgreementSignedAt ? v.specialAgreementSignedAt.toISOString() : null,
    specialAgreementGrossSales: settlement.grossSales,
    specialAgreementDeductions: settlement.deductions,
    specialAgreementDeductionsNotes: v.specialAgreementDeductionsNotes ?? null,
    specialAgreementNetProfit: settlement.netProfit,
    specialAgreementAmountOwed: settlement.amountOwed,
    specialAgreementAmountPaid: settlement.amountPaid,
    specialAgreementPaidDate: settlement.paidDate,
    specialAgreementOutstandingBalance: settlement.outstandingBalance,
    specialAgreementSettlementStatus: settlement.settlementStatus,
    specialAgreementSettlementNotes: v.specialAgreementSettlementNotes ?? null,
    specialAgreementSettlementVersion: v.specialAgreementSettlementVersion,
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

const MAX_SETTLEMENT_AMOUNT = 9_999_999_999.99;

function isWholeCents(value: number | null): boolean {
  return value === null || (
    Number.isFinite(value)
    && value <= MAX_SETTLEMENT_AMOUNT
    && Math.abs(value * 100 - Math.round(value * 100)) < 0.0000001
  );
}

function asCents(value: number): number {
  return Math.round(value * 100);
}

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

router.get("/special-agreements", requireStaff, async (req, res): Promise<void> => {
  const parsed = ListSpecialAgreementVendorsQueryParams.safeParse(req.query);
  const yearId = parsed.success ? parsed.data.yearId : undefined;
  const conditions = [eq(vendorsTable.vendorType, "special_agreement")];
  if (yearId) conditions.push(eq(vendorsTable.yearId, yearId));
  const rows = await db.select().from(vendorsTable)
    .where(and(...conditions))
    .orderBy(desc(vendorsTable.createdAt));
  res.json(rows.map(formatVendor));
});

router.get("/special-agreements/settlement-summary", requireStaff, async (req, res): Promise<void> => {
  const parsed = GetSpecialAgreementSettlementSummaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a valid festival year." });
    return;
  }

  const rows = await db.select().from(vendorsTable)
    .where(and(
      eq(vendorsTable.vendorType, "special_agreement"),
      eq(vendorsTable.yearId, parsed.data.yearId),
    ))
    .orderBy(desc(vendorsTable.createdAt));

  const vendors = rows.map((vendor) => {
    const settlement = deriveSpecialAgreementSettlement(vendor);
    return {
      id: vendor.id,
      businessName: vendor.businessName,
      name: vendor.name,
      specialAgreementRevenueSharePercentage: Number(vendor.specialAgreementRevenueSharePercentage ?? 0),
      grossSales: settlement.grossSales,
      deductions: settlement.deductions,
      netProfit: settlement.netProfit,
      amountOwed: settlement.amountOwed,
      amountPaid: settlement.amountPaid,
      outstandingBalance: settlement.outstandingBalance,
      settlementStatus: settlement.settlementStatus,
    };
  });

  const sum = (field: "grossSales" | "deductions" | "netProfit" | "amountOwed" | "amountPaid" | "outstandingBalance") =>
    Math.round(vendors.reduce((total, vendor) => total + (vendor[field] ?? 0), 0) * 100) / 100;
  const response = {
    yearId: parsed.data.yearId,
    vendors,
    totals: {
      grossSales: sum("grossSales"),
      deductions: sum("deductions"),
      netProfit: sum("netProfit"),
      amountOwed: sum("amountOwed"),
      amountPaid: sum("amountPaid"),
      outstandingBalance: sum("outstandingBalance"),
    },
  };
  res.json(GetSpecialAgreementSettlementSummaryResponse.parse(response));
});

router.post("/special-agreements", requireStaff, async (req, res): Promise<void> => {
  const parsed = CreateSpecialAgreementVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data;
  const [year] = await db.select().from(festivalYearsTable)
    .where(eq(festivalYearsTable.id, input.yearId))
    .limit(1);
  if (!year) {
    res.status(404).json({ error: "Festival year not found" });
    return;
  }

  const portalToken = randomBytes(24).toString("hex");
  const [created] = await db.insert(vendorsTable).values({
    yearId: input.yearId,
    name: input.name.trim(),
    businessName: input.businessName.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    vendorType: "special_agreement",
    status: "approved",
    applicationData: { specialAgreementVendor: true },
    agreementSigned: false,
    portalToken,
    specialAgreementOperationType: input.operationType.trim(),
    specialAgreementRevenueSharePercentage: String(input.revenueSharePercentage),
    specialAgreementInternalNotes: input.internalNotes?.trim() || null,
    approvedAt: new Date(),
  }).returning();

  const portalBase = (process.env.APP_BASE_URL?.trim() || process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() || "").replace(/\/+$/, "");
  const portalUrl = portalBase
    ? `${/^https?:\/\//.test(portalBase) ? portalBase : `https://${portalBase}`}/portal/${portalToken}`
    : `/portal/${portalToken}`;
  const [settings] = await db.select().from(festivalSettingsTable)
    .where(eq(festivalSettingsTable.yearId, created.yearId))
    .limit(1);

  await db.insert(activityLogTable).values({
    type: "special_agreement_created",
    message: `Special Agreement Vendor created: ${created.name} (${created.businessName})`,
    entityType: "vendor",
    entityId: created.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  void sendSpecialAgreementPortalInviteEmail({
    to: created.email,
    name: created.name,
    businessName: created.businessName,
    operationType: created.specialAgreementOperationType ?? "",
    revenueSharePercentage: Number(created.specialAgreementRevenueSharePercentage),
    festivalName: year.eventName,
    portalUrl,
  });
  if (settings?.notificationEmail) {
    void sendSpecialAgreementCreatedNotification({
      notificationEmail: settings.notificationEmail,
      applicantName: created.name,
      businessName: created.businessName,
      operationType: created.specialAgreementOperationType ?? "",
      revenueSharePercentage: Number(created.specialAgreementRevenueSharePercentage),
      adminPath: `/vendors/${created.id}`,
    });
  }

  res.status(201).json(formatVendor(created));
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

router.patch("/vendors/:id/special-agreement-settlement", requireStaff, async (req, res): Promise<void> => {
  const params = UpdateSpecialAgreementSettlementParams.safeParse(req.params);
  const body = UpdateSpecialAgreementSettlementBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Enter valid settlement amounts and payment details." });
    return;
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, params.data.id));
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  if (vendor.vendorType !== "special_agreement") {
    res.status(409).json({ error: "Settlement tracking is only available for Special Agreement Vendors." });
    return;
  }

  const { grossSales, deductions, deductionsNotes, amountPaid, paidDate, settlementNotes, expectedSettlementVersion } = body.data;
  if (![grossSales, deductions, amountPaid].every(isWholeCents)) {
    res.status(400).json({ error: "Settlement amounts must use whole cents and fit within the supported range." });
    return;
  }
  if (expectedSettlementVersion !== vendor.specialAgreementSettlementVersion) {
    res.status(409).json({ error: "This settlement was updated by another staff member. Refresh the page before saving your changes." });
    return;
  }
  const hasFigures = grossSales !== null || deductions !== null;
  if (hasFigures && (grossSales === null || deductions === null)) {
    res.status(400).json({ error: "Enter both gross sales and deductions before calculating a settlement." });
    return;
  }
  const grossSalesCents = grossSales === null ? null : asCents(grossSales);
  const deductionsCents = deductions === null ? null : asCents(deductions);
  const amountPaidCents = amountPaid === null ? null : asCents(amountPaid);
  if (grossSalesCents !== null && deductionsCents !== null && deductionsCents > grossSalesCents) {
    res.status(400).json({ error: "Deductions cannot be greater than gross sales." });
    return;
  }
  if (deductions !== null && deductions > 0 && !deductionsNotes?.trim()) {
    res.status(400).json({ error: "Add notes explaining any deductions or costs." });
    return;
  }
  if (amountPaid !== null && (grossSales === null || deductions === null)) {
    res.status(400).json({ error: "Enter gross sales and deductions before recording a payment." });
    return;
  }
  if (amountPaid !== null && amountPaid > 0 && paidDate === null) {
    res.status(400).json({ error: "Add the payment date when recording an amount paid to the vendor." });
    return;
  }
  if (paidDate !== null && amountPaid === null) {
    res.status(400).json({ error: "Enter the amount paid when adding a payment date." });
    return;
  }

  const percentage = Number(vendor.specialAgreementRevenueSharePercentage);
  const amountOwedCents = grossSalesCents === null || deductionsCents === null
    ? null
    : Math.round((grossSalesCents - deductionsCents) * percentage / 100);
  if (amountPaidCents !== null && amountOwedCents !== null && amountPaidCents > amountOwedCents) {
    res.status(400).json({ error: "Amount paid cannot be greater than the calculated amount owed to this vendor." });
    return;
  }

  const paidDateString = paidDate
    ? `${paidDate.getUTCFullYear()}-${String(paidDate.getUTCMonth() + 1).padStart(2, "0")}-${String(paidDate.getUTCDate()).padStart(2, "0")}`
    : null;
  const [updated] = await db.update(vendorsTable).set({
    specialAgreementGrossSales: grossSalesCents === null ? null : (grossSalesCents / 100).toFixed(2),
    specialAgreementDeductions: deductionsCents === null ? null : (deductionsCents / 100).toFixed(2),
    specialAgreementDeductionsNotes: deductionsNotes?.trim() || null,
    specialAgreementAmountPaid: amountPaidCents === null ? null : (amountPaidCents / 100).toFixed(2),
    specialAgreementPaidDate: paidDateString,
    specialAgreementSettlementNotes: settlementNotes?.trim() || null,
    specialAgreementSettlementVersion: sql`${vendorsTable.specialAgreementSettlementVersion} + 1`,
  }).where(and(
    eq(vendorsTable.id, vendor.id),
    eq(vendorsTable.specialAgreementSettlementVersion, expectedSettlementVersion),
  )).returning();

  if (!updated) {
    res.status(409).json({ error: "This settlement was updated by another staff member. Refresh the page before saving your changes." });
    return;
  }

  await db.insert(activityLogTable).values({
    type: "special_agreement_settlement_updated",
    message: `Special Agreement settlement updated for ${updated.name} (${updated.businessName})`,
    entityType: "vendor",
    entityId: updated.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  res.json(UpdateSpecialAgreementSettlementResponse.parse(formatVendor(updated)));
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
  if (vendor.vendorType === "special_agreement") {
    res.status(409).json({ error: "Special Agreement Vendors do not have a fee category to change." });
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

router.post("/vendors/:id/resend-confirmation", requireStaff, async (req, res): Promise<void> => {
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

  sendApplicantConfirmation({
    to: vendor.email,
    applicantName: vendor.name,
    applicationType: "vendor",
    organizationOrBusiness: vendor.businessName,
    categoryOrTier: VENDOR_LABELS[vendor.vendorType] ?? vendor.vendorType,
  });

  await db.insert(activityLogTable).values({
    type: "email_resent",
    message: `Confirmation email resent to vendor ${vendor.name} (${vendor.businessName}) at ${vendor.email}`,
    entityType: "vendor",
    entityId: vendor.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  res.status(204).send();
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
