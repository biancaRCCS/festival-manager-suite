import { pgTable, serial, integer, text, boolean, jsonb, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { festivalYearsTable } from "./festivalYears";

export const vendorsTable = pgTable("vendors", {
  id: serial("id").primaryKey(),
  yearId: integer("year_id").notNull().references(() => festivalYearsTable.id),
  name: text("name").notNull(),
  businessName: text("business_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  vendorType: text("vendor_type").notNull().default("other"),
  status: text("status").notNull().default("pending"),
  applicationData: jsonb("application_data").notNull().default({}),
  agreementSigned: boolean("agreement_signed").notNull().default(false),
  agreementSignedName: text("agreement_signed_name"),
  spotNumber: text("spot_number"),
  location: text("location"),
  reviewNote: text("review_note"),
  portalToken: text("portal_token"),
  stripeSessionId: text("stripe_session_id"),
  // Stripe settlement data is deliberately separate from staff-recorded
  // offline payments. This makes an erroneous manual entry reversible.
  stripePaidAt: timestamp("stripe_paid_at", { withTimezone: true }),
  stripeSettledAmount: numeric("stripe_settled_amount", { precision: 10, scale: 2 }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  // Set when an async payment method (e.g. ACH bank transfer) fails to settle
  // after checkout completed. Cleared again on the next successful payment.
  paymentFailedAt: timestamp("payment_failed_at", { withTimezone: true }),
  paymentFailureReason: text("payment_failure_reason"),
  // The amount fully settled against the vendor's current category. Stripe
  // establishes the initial value; staff update it only after resolving a
  // recorded manual category adjustment.
  settledAmount: numeric("settled_amount", { precision: 10, scale: 2 }),
  manualPaymentMethod: text("manual_payment_method"),
  manualPaymentAmount: numeric("manual_payment_amount", { precision: 10, scale: 2 }),
  manualPaymentReceivedDate: date("manual_payment_received_date", { mode: "string" }),
  manualPaymentReference: text("manual_payment_reference"),
  manualPaymentRecordedAt: timestamp("manual_payment_recorded_at", { withTimezone: true }),
  manualPaymentRecordedBy: text("manual_payment_recorded_by"),
  manualPaymentPreviousStatus: text("manual_payment_previous_status"),
  pendingManualAdjustment: numeric("pending_manual_adjustment", { precision: 10, scale: 2 }),
  pendingAdjustmentTargetAmount: numeric("pending_adjustment_target_amount", { precision: 10, scale: 2 }),
  // Incremented whenever a category recalculates a vendor's amount due. A
  // Checkout is attached only if this remains unchanged while Stripe creates it.
  pricingRevision: integer("pricing_revision").notNull().default(0),
  // Special Agreement Vendors are created by staff, do not pay a booth fee,
  // and use a signed revenue-share agreement instead of Stripe Checkout.
  specialAgreementOperationType: text("special_agreement_operation_type"),
  specialAgreementRevenueSharePercentage: numeric("special_agreement_revenue_share_percentage", { precision: 5, scale: 2 }),
  specialAgreementInternalNotes: text("special_agreement_internal_notes"),
  specialAgreementDayOfContactName: text("special_agreement_day_of_contact_name"),
  specialAgreementDayOfContactPhone: text("special_agreement_day_of_contact_phone"),
  specialAgreementBackupContactName: text("special_agreement_backup_contact_name"),
  specialAgreementBackupContactPhone: text("special_agreement_backup_contact_phone"),
  specialAgreementAcknowledgements: jsonb("special_agreement_acknowledgements").notNull().default({}),
  specialAgreementSignedDate: date("special_agreement_signed_date", { mode: "string" }),
  specialAgreementSignedAt: timestamp("special_agreement_signed_at", { withTimezone: true }),
  specialAgreementGrossSales: numeric("special_agreement_gross_sales", { precision: 12, scale: 2 }),
  specialAgreementDeductions: numeric("special_agreement_deductions", { precision: 12, scale: 2 }),
  specialAgreementDeductionsNotes: text("special_agreement_deductions_notes"),
  specialAgreementAmountPaid: numeric("special_agreement_amount_paid", { precision: 12, scale: 2 }),
  specialAgreementPaidDate: date("special_agreement_paid_date", { mode: "string" }),
  specialAgreementSettlementNotes: text("special_agreement_settlement_notes"),
  specialAgreementSettlementVersion: integer("special_agreement_settlement_version").notNull().default(0),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  finalApprovedAt: timestamp("final_approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVendorSchema = createInsertSchema(vendorsTable).omit({ id: true, createdAt: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendorsTable.$inferSelect;
