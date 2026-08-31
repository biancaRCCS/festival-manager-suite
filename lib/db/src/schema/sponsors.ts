import { pgTable, serial, integer, numeric, text, boolean, jsonb, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { festivalYearsTable } from "./festivalYears";

export const sponsorsTable = pgTable("sponsors", {
  id: serial("id").primaryKey(),
  yearId: integer("year_id").notNull().references(() => festivalYearsTable.id),
  name: text("name").notNull(),
  orgName: text("org_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  tier: text("tier").notNull().default("bronze"),
  isInKind: boolean("is_in_kind").notNull().default(false),
  inKindDescription: text("in_kind_description"),
  // Amount the sponsor actually chooses within the tier range
  sponsorshipAmount: numeric("sponsorship_amount", { precision: 10, scale: 2 }),
  inKindValue: numeric("in_kind_value", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("pending"),
  applicationData: jsonb("application_data").notNull().default({}),
  agreementSigned: boolean("agreement_signed").notNull().default(false),
  agreementSignedName: text("agreement_signed_name"),
  spotNumber: text("spot_number"),
  location: text("location"),
  reviewNote: text("review_note"),
  portalToken: text("portal_token"),
  stripeSessionId: text("stripe_session_id"),
  stripePaidAt: timestamp("stripe_paid_at", { withTimezone: true }),
  stripeSettledAmount: numeric("stripe_settled_amount", { precision: 10, scale: 2 }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  // Set when an async payment method (e.g. ACH bank transfer) fails to settle
  // after checkout completed. Cleared again on the next successful payment.
  paymentFailedAt: timestamp("payment_failed_at", { withTimezone: true }),
  paymentFailureReason: text("payment_failure_reason"),
  manualPaymentMethod: text("manual_payment_method"),
  manualPaymentAmount: numeric("manual_payment_amount", { precision: 10, scale: 2 }),
  manualPaymentReceivedDate: date("manual_payment_received_date", { mode: "string" }),
  manualPaymentReference: text("manual_payment_reference"),
  manualPaymentRecordedAt: timestamp("manual_payment_recorded_at", { withTimezone: true }),
  manualPaymentRecordedBy: text("manual_payment_recorded_by"),
  manualPaymentPreviousStatus: text("manual_payment_previous_status"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  detailsSubmittedAt: timestamp("details_submitted_at", { withTimezone: true }),
  finalApprovedAt: timestamp("final_approved_at", { withTimezone: true }), // repurposed: set when status → details_approved
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSponsorSchema = createInsertSchema(sponsorsTable).omit({ id: true, createdAt: true });
export type InsertSponsor = z.infer<typeof insertSponsorSchema>;
export type Sponsor = typeof sponsorsTable.$inferSelect;
