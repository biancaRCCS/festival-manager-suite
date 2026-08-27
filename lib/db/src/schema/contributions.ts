import { pgTable, serial, integer, text, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { festivalYearsTable } from "./festivalYears";

export const contributionsTable = pgTable("contributions", {
  id: serial("id").primaryKey(),
  yearId: integer("year_id").notNull().references(() => festivalYearsTable.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  stripeSessionId: text("stripe_session_id").unique(),
  // "processing": checkout completed via an async payment method (e.g. ACH)
  // and settlement is pending. "paid": settled. "failed": the async payment
  // did not settle. Existing rows predate this column and are all genuinely
  // settled, hence the "paid" default.
  status: text("status").notNull().default("paid"),
  // Null while a bank payment is still processing.
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paymentFailedAt: timestamp("payment_failed_at", { withTimezone: true }),
  paymentFailureReason: text("payment_failure_reason"),
  manualPaymentMethod: text("manual_payment_method"),
  manualPaymentReference: text("manual_payment_reference"),
  manualPaymentReceivedDate: date("manual_payment_received_date", { mode: "string" }),
  manualPaymentRecordedAt: timestamp("manual_payment_recorded_at", { withTimezone: true }),
  manualPaymentRecordedBy: text("manual_payment_recorded_by"),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  removedBy: text("removed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertContributionSchema = createInsertSchema(contributionsTable).omit({ id: true, createdAt: true });
export type InsertContribution = z.infer<typeof insertContributionSchema>;
export type Contribution = typeof contributionsTable.$inferSelect;