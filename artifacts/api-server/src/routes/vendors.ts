import { Router, type IRouter } from "express";
import { db, vendorsTable, festivalYearsTable, festivalSettingsTable, activityLogTable } from "@workspace/db";
import { eq, and, desc, sql, isNull, isNotNull } from "drizzle-orm";
import { requireAdmin, requireStaff } from "../lib/auth";
import {
  GetVendorParams,
  ListVendorsQueryParams,
  ReviewVendorParams,
  ReviewVendorBody,
  UpdateVendorCategoryParams,
  UpdateVendorCategoryBody,
  UpdateVendorDetailsParams,
  UpdateVendorDetailsBody,
  UpdateVendorDetailsResponse,
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
  RecordVendorManualPaymentParams,
  RecordVendorManualPaymentBody,
  RemoveVendorManualPaymentParams,
  UpdateVendorDiscountParams,
  UpdateVendorDiscountBody,
} from "@workspace/api-zod";
import { randomBytes } from "crypto";
import {
  sendApplicantConfirmation,
  sendVendorCategoryAdjustedEmail,
  sendVendorPortalInviteEmail,
  sendSpecialAgreementPortalInviteEmail,
  sendSpecialAgreementCreatedNotification,
  sendManualPaymentConfirmationEmail,
  VENDOR_LABELS,
} from "../lib/email";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { deriveSpecialAgreementSettlement } from "../lib/specialAgreementSettlement";
import { calculateVendorPricing, isVendorCategory } from "../lib/vendorPricing";
import {
  addDetailChange,
  applicationText,
  asApplicationData,
  type ApplicantDetailChange,
  isExactObjectWithKeys,
  isValidEmail,
  normalizeOptionalText,
  normalizeRequiredText,
} from "../lib/applicantDetails";

const router: IRouter = Router();

const VENDOR_STATUS_RANK: Record<string, number> = {
  pending: 0,
  rejected: -1,
  approved: 1,
  payment_pending: 2,
  payment_processing: 2,
  paid: 3,
  final_approved: 4,
};

function getVendorTimestampImpliedStatus(vendor: typeof vendorsTable.$inferSelect): string | null {
  return vendor.finalApprovedAt
    ? "final_approved"
    : vendor.approvedAt
      ? "approved"
      : null;
}

function vendorNeedsStatusRepair(vendor: typeof vendorsTable.$inferSelect): boolean {
  const impliedStatus = getVendorTimestampImpliedStatus(vendor);
  return Boolean(
    impliedStatus
    && (VENDOR_STATUS_RANK[vendor.status] ?? -1) < VENDOR_STATUS_RANK[impliedStatus],
  );
}

async function formatVendor(
  v: typeof vendorsTable.$inferSelect,
  settings?: typeof festivalSettingsTable.$inferSelect,
) {
  const settlement = deriveSpecialAgreementSettlement(v);
  const hasStripePayment = Boolean(v.stripePaidAt || (v.stripeSessionId && v.paidAt));
  const timestampImpliedStatus = getVendorTimestampImpliedStatus(v);
  const pricingSettings = isVendorCategory(v.vendorType)
    ? settings ?? (await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, v.yearId)).limit(1))[0]
    : undefined;
  const pricing = isVendorCategory(v.vendorType)
    ? calculateVendorPricing(v.vendorType, v.applicationData, pricingSettings, v.discountPercent)
    : null;
  return {
    id: v.id,
    yearId: v.yearId,
    name: v.name,
    businessName: v.businessName,
    email: v.email,
    phone: v.phone,
    vendorType: v.vendorType,
    status: v.status,
    statusNeedsRepair: vendorNeedsStatusRepair(v),
    timestampImpliedStatus,
    applicationData: v.applicationData,
    agreementSigned: v.agreementSigned,
    agreementSignedName: v.agreementSignedName ?? null,
    spotNumber: v.spotNumber ?? null,
    location: v.location ?? null,
    reviewNote: v.reviewNote ?? null,
    discountPercent: v.discountPercent,
    discountReason: v.discountReason ?? null,
    originalAmount: pricing?.originalAmount ?? null,
    amountDue: pricing?.amountDue ?? null,
    paidAt: v.paidAt ? v.paidAt.toISOString() : null,
    paymentSource: v.manualPaymentRecordedAt ? "manual" : (hasStripePayment ? "stripe" : null),
    paymentMethod: v.manualPaymentRecordedAt ? ({ cash: "Cash", check: "Check", bank_transfer: "Bank transfer", other: "Other" }[v.manualPaymentMethod ?? ""] ?? null) : (hasStripePayment ? "Stripe" : null),
    hasStripePayment,
    stripePaymentAmount: v.stripeSettledAmount === null
      ? (v.stripeSessionId && v.paidAt && v.settledAmount !== null ? Number(v.settledAmount) : null)
      : Number(v.stripeSettledAmount),
    stripePaidAt: v.stripePaidAt?.toISOString() ?? (v.stripeSessionId && v.paidAt ? v.paidAt.toISOString() : null),
    manualPaymentAmount: v.manualPaymentAmount === null ? null : Number(v.manualPaymentAmount),
    manualPaymentReceivedDate: v.manualPaymentReceivedDate ?? null,
    manualPaymentReference: v.manualPaymentReference ?? null,
    manualPaymentRecordedAt: v.manualPaymentRecordedAt?.toISOString() ?? null,
    manualPaymentRecordedBy: v.manualPaymentRecordedBy ?? null,
    manualPaymentPreviousStatus: v.manualPaymentPreviousStatus ?? null,
    paymentFailedAt: v.paymentFailedAt ? v.paymentFailedAt.toISOString() : null,
    paymentFailureReason: v.paymentFailureReason ?? null,
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

const MAX_SETTLEMENT_AMOUNT = 99_999_999.99;

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

function manualPaymentDate(value: Date): string | null {
  const text = value.toISOString().slice(0, 10);
  const received = new Date(`${text}T00:00:00.000Z`);
  const tomorrow = new Date(); tomorrow.setUTCHours(0, 0, 0, 0); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return received > tomorrow ? null : text;
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

  const settingsRows = await db.select().from(festivalSettingsTable);
  const settingsByYear = new Map(settingsRows.map((settings) => [settings.yearId, settings]));
  res.json(await Promise.all(rows.map((vendor) => formatVendor(vendor, settingsByYear.get(vendor.yearId)))));
});

router.get("/special-agreements", requireStaff, async (req, res): Promise<void> => {
  const parsed = ListSpecialAgreementVendorsQueryParams.safeParse(req.query);
  const yearId = parsed.success ? parsed.data.yearId : undefined;
  const conditions = [eq(vendorsTable.vendorType, "special_agreement")];
  if (yearId) conditions.push(eq(vendorsTable.yearId, yearId));
  const rows = await db.select().from(vendorsTable)
    .where(and(...conditions))
    .orderBy(desc(vendorsTable.createdAt));
  res.json(await Promise.all(rows.map((vendor) => formatVendor(vendor))));
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

  res.status(201).json(await formatVendor(created));
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
  res.json(await formatVendor(vendor));
});

router.patch("/vendors/:id/reconcile-status-from-timestamps", requireStaff, async (req, res): Promise<void> => {
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

  const impliedStatus = getVendorTimestampImpliedStatus(vendor);
  if (!impliedStatus) {
    res.status(409).json({ error: "This vendor has no stage timestamp that can restore their workflow status." });
    return;
  }
  if (!vendorNeedsStatusRepair(vendor)) {
    res.json(await formatVendor(vendor));
    return;
  }

  const [updated] = await db.update(vendorsTable)
    .set({ status: impliedStatus })
    .where(and(eq(vendorsTable.id, vendor.id), eq(vendorsTable.status, vendor.status)))
    .returning();
  if (!updated) {
    res.status(409).json({ error: "The vendor changed while their status was being reconciled. Refresh and try again." });
    return;
  }

  await db.insert(activityLogTable).values({
    type: "status_reconciled",
    message: `Vendor ${updated.name} (${updated.businessName}) status restored from ${vendor.status} to ${impliedStatus} using existing stage timestamps`,
    entityType: "vendor",
    entityId: updated.id,
    performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
  });

  res.json(await formatVendor(updated));
});

router.patch("/vendors/:id/details", requireStaff, async (req, res): Promise<void> => {
  const allowedKeys = [
    "name", "businessName", "email", "phone", "website", "social",
    "productsDescription", "businessDescription",
  ] as const;
  if (!isExactObjectWithKeys(req.body, allowedKeys)) {
    res.status(400).json({ error: "Only staff-editable vendor detail fields may be updated." });
    return;
  }

  const params = UpdateVendorDetailsParams.safeParse(req.params);
  const body = UpdateVendorDetailsBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Enter valid vendor details." });
    return;
  }

  const input = {
    name: normalizeRequiredText(body.data.name),
    businessName: normalizeRequiredText(body.data.businessName),
    email: normalizeRequiredText(body.data.email),
    phone: normalizeRequiredText(body.data.phone),
    website: normalizeOptionalText(body.data.website),
    social: normalizeOptionalText(body.data.social),
    productsDescription: normalizeOptionalText(body.data.productsDescription),
    businessDescription: normalizeOptionalText(body.data.businessDescription),
  };
  if (!input.name || !input.businessName || !input.phone || !isValidEmail(input.email)) {
    res.status(400).json({ error: "Enter a name, business name, valid email address, and phone number." });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    const [vendor] = await tx.select().from(vendorsTable).where(eq(vendorsTable.id, params.data.id));
    if (!vendor) return null;

    const nextApplicationData = asApplicationData(vendor.applicationData);
    const changes: ApplicantDetailChange[] = [];
    addDetailChange(changes, "Contact name", vendor.name, input.name);
    addDetailChange(changes, "Business name", vendor.businessName, input.businessName);
    addDetailChange(changes, "Email", vendor.email, input.email);
    addDetailChange(changes, "Phone", vendor.phone, input.phone);

    for (const [key, label, value] of [
      ["website", "Website", input.website],
      ["social", "Social media", input.social],
      ["productsDescription", "Products description", input.productsDescription],
      ["businessDescription", "Business description", input.businessDescription],
    ] as const) {
      const oldValue = applicationText(nextApplicationData[key]);
      if (addDetailChange(changes, label, oldValue, value)) nextApplicationData[key] = value;
    }

    if (changes.length === 0) return vendor;
    const [saved] = await tx.update(vendorsTable).set({
      name: input.name,
      businessName: input.businessName,
      email: input.email,
      phone: input.phone,
      applicationData: nextApplicationData,
    }).where(eq(vendorsTable.id, vendor.id)).returning();

    await tx.insert(activityLogTable).values(changes.map((change) => ({
      type: "details_updated",
      message: `Vendor details updated: ${change.fieldName}`,
      entityType: "vendor",
      entityId: vendor.id,
      performedBy: (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null,
      ...change,
    })));
    return saved;
  });

  if (!updated) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.json(UpdateVendorDetailsResponse.parse(await formatVendor(updated)));
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

  res.json(UpdateSpecialAgreementSettlementResponse.parse(await formatVendor(updated)));
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

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }

  const hasRecordedPayment = Boolean(
    vendor.manualPaymentRecordedAt
      || vendor.stripePaidAt
      || (vendor.stripeSessionId && vendor.paidAt),
  );
  if (status === "rejected" && !["pending", "approved"].includes(vendor.status)) {
    res.status(409).json({ error: "Only pending or unpaid approved vendors can be rejected." });
    return;
  }
  if (status === "rejected" && hasRecordedPayment) {
    res.status(409).json({ error: "Paid vendors cannot be rejected. Reverse or reconcile the payment first." });
    return;
  }

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
  if (status === "rejected") {
    // Rejection of a previously approved vendor must invalidate the approval
    // and its portal invite; otherwise the old portal link would remain usable.
    updates.approvedAt = null;
    updates.finalApprovedAt = null;
    updates.portalToken = null;
  }

  const [updated] = await db.update(vendorsTable)
    .set(updates)
    .where(eq(vendorsTable.id, id))
    .returning();

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

  res.json(await formatVendor(updated));
});

router.post("/vendors/:id/manual-payment", requireStaff, async (req, res): Promise<void> => {
  const params = RecordVendorManualPaymentParams.safeParse(req.params);
  const body = RecordVendorManualPaymentBody.safeParse(req.body);
  if (!params.success || !body.success || !isWholeCents(body.success ? body.data.amount : null) || (body.success && body.data.amount <= 0)) {
    res.status(400).json({ error: "Enter a positive amount in whole cents and a valid manual payment." }); return;
  }
  const receivedDate = manualPaymentDate(body.data.receivedDate);
  if (!receivedDate) { res.status(400).json({ error: "Received date cannot be unreasonably in the future." }); return; }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, params.data.id)).limit(1);
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (vendor.vendorType === "special_agreement") { res.status(409).json({ error: "Manual booth payments do not apply to Special Agreement Vendors." }); return; }
  if (vendor.manualPaymentRecordedAt) { res.status(409).json({ error: "Remove the active manual payment before recording another." }); return; }
  const hasStripe = Boolean(vendor.stripePaidAt || (vendor.stripeSessionId && vendor.paidAt));
  if (hasStripe && !body.data.confirmStripeOverlap) { res.status(409).json({ error: "This vendor already has a Stripe payment. Confirm the overlap to record a manual payment." }); return; }
  if (!hasStripe && !["approved", "payment_pending", "payment_processing"].includes(vendor.status)) { res.status(409).json({ error: "Manual payment can only be recorded while this vendor is payable." }); return; }
  const actor = (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null;
  const reference = body.data.reference?.trim() || null;
  const paidAt = new Date(`${receivedDate}T00:00:00.000Z`);
  const method = ({ cash: "Cash", check: "Check", bank_transfer: "Bank transfer", other: "Other" } as const)[body.data.method];
  const updated = await db.transaction(async (tx) => {
    const [saved] = await tx.update(vendorsTable).set({
    status: hasStripe ? vendor.status : "paid", paidAt: hasStripe ? vendor.paidAt : paidAt, settledAmount: hasStripe ? vendor.settledAmount : body.data.amount.toFixed(2),
    manualPaymentMethod: body.data.method, manualPaymentAmount: body.data.amount.toFixed(2), manualPaymentReceivedDate: receivedDate,
    manualPaymentReference: reference, manualPaymentRecordedAt: new Date(), manualPaymentRecordedBy: actor, manualPaymentPreviousStatus: vendor.status,
    }).where(and(eq(vendorsTable.id, vendor.id), isNull(vendorsTable.manualPaymentRecordedAt), eq(vendorsTable.status, vendor.status))).returning();
    if (!saved) return null;
    await tx.insert(activityLogTable).values({ type: "manual_payment_recorded", message: `Manual ${method} payment of $${body.data.amount.toFixed(2)} recorded for vendor ${saved.name}${reference ? ` (reference: ${reference})` : ""} by ${actor ?? "staff"}`, entityType: "vendor", entityId: saved.id, performedBy: actor });
    return saved;
  });
  if (!updated) { res.status(409).json({ error: "This vendor changed while recording payment. Refresh and try again." }); return; }
  if (body.data.sendConfirmationEmail) void sendManualPaymentConfirmationEmail({ to: updated.email, name: updated.name, entityType: "vendor", amount: body.data.amount, method: body.data.method, reference, receivedDate });
  res.json(await formatVendor(updated));
});

router.delete("/vendors/:id/manual-payment", requireStaff, async (req, res): Promise<void> => {
  const params = RemoveVendorManualPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, params.data.id)).limit(1);
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (!vendor.manualPaymentRecordedAt) { res.status(409).json({ error: "There is no active manual payment to remove." }); return; }
  const actor = (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null;
  const stripeSettled = Boolean(vendor.stripePaidAt || (vendor.stripeSessionId && vendor.paidAt));
  const stripePaidAt = vendor.stripePaidAt ?? (vendor.stripeSessionId ? vendor.paidAt : null);
  const stripeAmount = vendor.stripeSettledAmount ?? (vendor.stripeSessionId ? vendor.settledAmount : null);
  const restoredStatus = stripeSettled && ["approved", "payment_pending", "payment_processing"].includes(vendor.manualPaymentPreviousStatus ?? "")
    ? "paid"
    : vendor.manualPaymentPreviousStatus ?? (stripeSettled ? "paid" : "approved");
  const updated = await db.transaction(async (tx) => {
    const [saved] = await tx.update(vendorsTable).set({
      status: restoredStatus,
      paidAt: stripeSettled ? stripePaidAt : null,
      settledAmount: stripeSettled ? stripeAmount : null,
      manualPaymentMethod: null, manualPaymentAmount: null, manualPaymentReceivedDate: null, manualPaymentReference: null, manualPaymentRecordedAt: null, manualPaymentRecordedBy: null, manualPaymentPreviousStatus: null,
    }).where(and(eq(vendorsTable.id, vendor.id), isNotNull(vendorsTable.manualPaymentRecordedAt), eq(vendorsTable.status, vendor.status))).returning();
    if (!saved) return null;
    const labels: Record<string, string> = { cash: "Cash", check: "Check", bank_transfer: "Bank transfer", other: "Other" };
    await tx.insert(activityLogTable).values({ type: "manual_payment_removed", message: `Manual ${labels[vendor.manualPaymentMethod ?? ""] ?? "payment"} of $${Number(vendor.manualPaymentAmount).toFixed(2)} removed for vendor ${saved.name}${vendor.manualPaymentReference ? ` (reference: ${vendor.manualPaymentReference})` : ""} by ${actor ?? "staff"}`, entityType: "vendor", entityId: saved.id, performedBy: actor });
    return saved;
  });
  if (!updated) { res.status(409).json({ error: "This vendor payment changed while removing it. Refresh and try again." }); return; }
  res.json(await formatVendor(updated));
});

router.patch("/vendors/:id/discount", requireStaff, requireAdmin, async (req, res): Promise<void> => {
  const paramsParsed = UpdateVendorDiscountParams.safeParse(req.params);
  const bodyParsed = UpdateVendorDiscountBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success || !Number.isInteger(bodyParsed.data.discountPercent)) {
    res.status(400).json({ error: "Discount must be a whole-number percentage from 0 to 100." });
    return;
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, paramsParsed.data.id)).limit(1);
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  if (vendor.vendorType === "special_agreement") {
    res.status(409).json({ error: "Special Agreement Vendors do not have a booth fee to discount." });
    return;
  }
  if (["paid", "final_approved"].includes(vendor.status) || vendor.paidAt || vendor.stripePaidAt || vendor.manualPaymentRecordedAt) {
    res.status(409).json({ error: "This discount cannot be changed because payment has already been received." });
    return;
  }
  if (vendor.status === "payment_processing") {
    res.status(409).json({ error: "This discount cannot be changed while the vendor's payment is processing." });
    return;
  }

  const discountPercent = bodyParsed.data.discountPercent;
  const discountReason = discountPercent > 0 ? bodyParsed.data.discountReason?.trim() || null : null;
  if (vendor.discountPercent === discountPercent && (vendor.discountReason ?? null) === discountReason) {
    res.status(400).json({ error: "Enter a different percentage or reason to change this vendor's discount." });
    return;
  }

  let invalidateCheckout = false;
  if (vendor.stripeSessionId) {
    try {
      const stripe = await getUncachableStripeClient();
      let session = await stripe.checkout.sessions.retrieve(vendor.stripeSessionId);
      if (session.status === "open" && session.payment_status === "unpaid") {
        try {
          session = await stripe.checkout.sessions.expire(vendor.stripeSessionId);
        } catch {
          session = await stripe.checkout.sessions.retrieve(vendor.stripeSessionId);
        }
      }
      if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
        res.status(409).json({ error: "This discount cannot be changed because payment has already been received." });
        return;
      }
      if (session.status !== "expired") {
        res.status(409).json({ error: "This discount cannot be changed while the vendor's payment is processing." });
        return;
      }
      invalidateCheckout = true;
    } catch {
      res.status(409).json({ error: "RCCS could not verify or invalidate this vendor's Stripe Checkout. The discount was not changed." });
      return;
    }
  }

  const actor = (req as any).staffMember?.name?.trim() || (req as any).clerkUserId || null;
  const [updated] = await db.update(vendorsTable)
    .set({
      discountPercent,
      discountReason,
      pricingRevision: sql`${vendorsTable.pricingRevision} + 1`,
      ...(invalidateCheckout ? {
        stripeSessionId: null,
        status: vendor.status === "payment_pending" ? "approved" : vendor.status,
      } : {}),
    })
    .where(and(
      eq(vendorsTable.id, vendor.id),
      eq(vendorsTable.pricingRevision, vendor.pricingRevision),
      eq(vendorsTable.status, vendor.status),
      isNull(vendorsTable.paidAt),
      isNull(vendorsTable.stripePaidAt),
      isNull(vendorsTable.manualPaymentRecordedAt),
    ))
    .returning();
  if (!updated) {
    res.status(409).json({ error: "This vendor's pricing or payment state changed. The discount was not changed; refresh and try again." });
    return;
  }

  await db.insert(activityLogTable).values({
    type: "discount_changed",
    message: `Vendor ${updated.name} (${updated.businessName}) discount changed by ${actor ?? "staff"} from ${vendor.discountPercent}% to ${discountPercent}%. Reason: ${discountReason ?? "No reason provided"}`,
    entityType: "vendor",
    entityId: updated.id,
    performedBy: actor,
  });

  res.json(await formatVendor(updated));
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
  const newPricing = calculateVendorPricing(newVendorType, vendor.applicationData, settings, vendor.discountPercent);
  const oldPricing = isVendorCategory(previousVendorType)
    ? calculateVendorPricing(previousVendorType, vendor.applicationData, settings, vendor.discountPercent)
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

      if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required" && !isPaid && session.status === "open") {
        try {
          session = await stripe.checkout.sessions.expire(vendor.stripeSessionId);
        } catch {
          // Completion can win the race with expiry. Read the canonical Stripe
          // state once more instead of treating a paid Checkout as stale.
          session = await stripe.checkout.sessions.retrieve(vendor.stripeSessionId);
        }
      }

      if ((session.payment_status === "paid" || session.payment_status === "no_payment_required") && session.amount_total !== null) {
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

  const difference = settledAmount === null ? 0 : newPricing.amountDue - settledAmount;
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
      updates.pendingAdjustmentTargetAmount = newPricing.amountDue.toFixed(2);
    }
  } else if (invalidateCheckout) {
    updates.stripeSessionId = null;
    if (vendor.status === "payment_pending") updates.status = "approved";
  }

  const [updated] = await db.update(vendorsTable)
    .set(updates)
    .where(and(
      eq(vendorsTable.id, id),
      eq(vendorsTable.pricingRevision, vendor.pricingRevision),
      eq(vendorsTable.status, vendor.status),
    ))
    .returning();
  if (!updated) {
    res.status(409).json({ error: "This vendor's pricing or payment state changed. The category was not changed; refresh and try again." });
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

  const oldAmount = settledAmount ?? oldPricing?.amountDue ?? null;
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
      amountDue: newPricing.amountDue,
      originalAmount: newPricing.originalAmount,
      discountPercent: newPricing.discountPercent,
      boothDimensions: newPricing.boothDimensions,
      reason,
      festivalName: year?.eventName ?? "Romanian Festival",
    });
  }

  res.json({
    vendor: await formatVendor(updated, settings),
    previousVendorType,
    newVendorType,
    oldAmount,
    newAmount: newPricing.amountDue,
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

  res.json(await formatVendor(updated));
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

  res.json(await formatVendor(updated));
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

  res.json(await formatVendor(updated));
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
