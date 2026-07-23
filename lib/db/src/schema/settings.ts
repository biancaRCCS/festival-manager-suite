import { pgTable, serial, integer, numeric, jsonb, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { festivalYearsTable } from "./festivalYears";

export const festivalSettingsTable = pgTable("festival_settings", {
  id: serial("id").primaryKey(),
  yearId: integer("year_id").notNull().references(() => festivalYearsTable.id),
  vendorPrice: numeric("vendor_price", { precision: 10, scale: 2 }).notNull().default("200.00"),
  sponsorPrice: numeric("sponsor_price", { precision: 10, scale: 2 }).notNull().default("500.00"),
  vendorSpotLimit: integer("vendor_spot_limit").notNull().default(50),
  sponsorSpotLimit: integer("sponsor_spot_limit").notNull().default(20),
  applicationDeadline: date("application_deadline", { mode: "string" }),
  vendorFormQuestions: jsonb("vendor_form_questions").notNull().default([]),
  sponsorFormQuestions: jsonb("sponsor_form_questions").notNull().default([]),
  volunteerFormQuestions: jsonb("volunteer_form_questions").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFestivalSettingsSchema = createInsertSchema(festivalSettingsTable).omit({ id: true, updatedAt: true });
export type InsertFestivalSettings = z.infer<typeof insertFestivalSettingsSchema>;
export type FestivalSettings = typeof festivalSettingsTable.$inferSelect;
