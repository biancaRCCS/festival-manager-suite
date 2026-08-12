import { pgTable, serial, integer, numeric, text, jsonb, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { festivalYearsTable } from "./festivalYears";

export const festivalSettingsTable = pgTable("festival_settings", {
  id: serial("id").primaryKey(),
  yearId: integer("year_id").notNull().references(() => festivalYearsTable.id),

  // ── Vendor categories (4) ──────────────────────────────────────────────────
  vendorTypeLabelMajorFood:    text("vendor_type_label_major_food").notNull().default("Major Food Vendor"),
  vendorTypeLabelSpecialtyFood: text("vendor_type_label_specialty_food").notNull().default("Specialty Food & Beverage Vendor"),
  vendorTypeLabelRetail:       text("vendor_type_label_retail").notNull().default("Retail, Artisan & Business Vendor"),
  vendorTypeLabelNonprofit:    text("vendor_type_label_nonprofit").notNull().default("Verified Nonprofit Organization"),

  vendorPriceMajorFood:    numeric("vendor_price_major_food",    { precision: 10, scale: 2 }).notNull().default("2000.00"),
  vendorPriceSpecialtyFood: numeric("vendor_price_specialty_food", { precision: 10, scale: 2 }).notNull().default("600.00"),
  vendorPriceRetail:       numeric("vendor_price_retail",        { precision: 10, scale: 2 }).notNull().default("300.00"),
  vendorPriceNonprofit:    numeric("vendor_price_nonprofit",     { precision: 10, scale: 2 }).notNull().default("150.00"),

  // Spot limits are soft targets — a full category never blocks an application
  vendorSpotLimitMajorFood:    integer("vendor_spot_limit_major_food").notNull().default(5),
  vendorSpotLimitSpecialtyFood: integer("vendor_spot_limit_specialty_food").notNull().default(15),
  vendorSpotLimitRetail:       integer("vendor_spot_limit_retail").notNull().default(30),
  vendorSpotLimitNonprofit:    integer("vendor_spot_limit_nonprofit").notNull().default(20),

  // ── Sponsor tiers — min and max (diamond max is null = no upper limit) ─────
  sponsorPriceBronze:   numeric("sponsor_price_bronze",   { precision: 10, scale: 2 }).notNull().default("750.00"),
  sponsorPriceSilver:   numeric("sponsor_price_silver",   { precision: 10, scale: 2 }).notNull().default("1500.00"),
  sponsorPriceGold:     numeric("sponsor_price_gold",     { precision: 10, scale: 2 }).notNull().default("3000.00"),
  sponsorPricePlatinum: numeric("sponsor_price_platinum", { precision: 10, scale: 2 }).notNull().default("5000.00"),
  sponsorPriceDiamond:  numeric("sponsor_price_diamond",  { precision: 10, scale: 2 }).notNull().default("10000.00"),

  sponsorPriceMaxBronze:   numeric("sponsor_price_max_bronze",   { precision: 10, scale: 2 }).notNull().default("1499.00"),
  sponsorPriceMaxSilver:   numeric("sponsor_price_max_silver",   { precision: 10, scale: 2 }).notNull().default("2999.00"),
  sponsorPriceMaxGold:     numeric("sponsor_price_max_gold",     { precision: 10, scale: 2 }).notNull().default("4999.00"),
  sponsorPriceMaxPlatinum: numeric("sponsor_price_max_platinum", { precision: 10, scale: 2 }).notNull().default("9999.00"),
  sponsorPriceMaxDiamond:  numeric("sponsor_price_max_diamond",  { precision: 10, scale: 2 }), // nullable — no upper limit

  sponsorSpotLimitBronze:   integer("sponsor_spot_limit_bronze").notNull().default(10),
  sponsorSpotLimitSilver:   integer("sponsor_spot_limit_silver").notNull().default(10),
  sponsorSpotLimitGold:     integer("sponsor_spot_limit_gold").notNull().default(10),
  sponsorSpotLimitPlatinum: integer("sponsor_spot_limit_platinum").notNull().default(5),
  sponsorSpotLimitDiamond:  integer("sponsor_spot_limit_diamond").notNull().default(3),

  // ── Dates & operational settings ──────────────────────────────────────────
  festivalDate:        date("festival_date",        { mode: "string" }),
  applicationDeadline: date("application_deadline", { mode: "string" }),
  documentDeadline:    date("document_deadline",    { mode: "string" }),
  paymentWindowDays:   integer("payment_window_days").notNull().default(7),
  notificationEmail:   text("notification_email"),

  // ── Form customisation ────────────────────────────────────────────────────
  vendorFormQuestions:    jsonb("vendor_form_questions").notNull().default([]),
  sponsorFormQuestions:   jsonb("sponsor_form_questions").notNull().default([]),
  volunteerFormQuestions: jsonb("volunteer_form_questions").notNull().default([]),
  sponsorFormDescription:  text("sponsor_form_description"),
  sponsorFormHeaderImage:  text("sponsor_form_header_image"),
  vendorFormDescription:   text("vendor_form_description"),
  vendorFormHeaderImage:   text("vendor_form_header_image"),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFestivalSettingsSchema = createInsertSchema(festivalSettingsTable).omit({ id: true, updatedAt: true });
export type InsertFestivalSettings = z.infer<typeof insertFestivalSettingsSchema>;
export type FestivalSettings = typeof festivalSettingsTable.$inferSelect;
