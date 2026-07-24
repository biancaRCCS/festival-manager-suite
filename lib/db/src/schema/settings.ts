import { pgTable, serial, integer, numeric, text, jsonb, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { festivalYearsTable } from "./festivalYears";

export const festivalSettingsTable = pgTable("festival_settings", {
  id: serial("id").primaryKey(),
  yearId: integer("year_id").notNull().references(() => festivalYearsTable.id),
  vendorTypeLabelFood: text("vendor_type_label_food").notNull().default("Food & Beverage"),
  vendorTypeLabelCrafts: text("vendor_type_label_crafts").notNull().default("Crafts & Art"),
  vendorTypeLabelMerchandise: text("vendor_type_label_merchandise").notNull().default("Merchandise"),
  vendorTypeLabelCultural: text("vendor_type_label_cultural").notNull().default("Cultural"),
  vendorTypeLabelOther: text("vendor_type_label_other").notNull().default("Other"),
  vendorPriceFood: numeric("vendor_price_food", { precision: 10, scale: 2 }).notNull().default("200.00"),
  vendorPriceCrafts: numeric("vendor_price_crafts", { precision: 10, scale: 2 }).notNull().default("150.00"),
  vendorPriceMerchandise: numeric("vendor_price_merchandise", { precision: 10, scale: 2 }).notNull().default("150.00"),
  vendorPriceCultural: numeric("vendor_price_cultural", { precision: 10, scale: 2 }).notNull().default("100.00"),
  vendorPriceOther: numeric("vendor_price_other", { precision: 10, scale: 2 }).notNull().default("100.00"),
  sponsorPriceBronze: numeric("sponsor_price_bronze", { precision: 10, scale: 2 }).notNull().default("250.00"),
  sponsorPriceSilver: numeric("sponsor_price_silver", { precision: 10, scale: 2 }).notNull().default("500.00"),
  sponsorPriceGold: numeric("sponsor_price_gold", { precision: 10, scale: 2 }).notNull().default("1000.00"),
  sponsorPricePlatinum: numeric("sponsor_price_platinum", { precision: 10, scale: 2 }).notNull().default("2000.00"),
  sponsorPriceDiamond: numeric("sponsor_price_diamond", { precision: 10, scale: 2 }).notNull().default("5000.00"),
  vendorSpotLimitFood: integer("vendor_spot_limit_food").notNull().default(20),
  vendorSpotLimitCrafts: integer("vendor_spot_limit_crafts").notNull().default(15),
  vendorSpotLimitMerchandise: integer("vendor_spot_limit_merchandise").notNull().default(15),
  vendorSpotLimitCultural: integer("vendor_spot_limit_cultural").notNull().default(10),
  vendorSpotLimitOther: integer("vendor_spot_limit_other").notNull().default(10),
  sponsorSpotLimitBronze: integer("sponsor_spot_limit_bronze").notNull().default(10),
  sponsorSpotLimitSilver: integer("sponsor_spot_limit_silver").notNull().default(8),
  sponsorSpotLimitGold: integer("sponsor_spot_limit_gold").notNull().default(5),
  sponsorSpotLimitPlatinum: integer("sponsor_spot_limit_platinum").notNull().default(3),
  sponsorSpotLimitDiamond: integer("sponsor_spot_limit_diamond").notNull().default(1),
  applicationDeadline: date("application_deadline", { mode: "string" }),
  vendorFormQuestions: jsonb("vendor_form_questions").notNull().default([]),
  sponsorFormQuestions: jsonb("sponsor_form_questions").notNull().default([]),
  volunteerFormQuestions: jsonb("volunteer_form_questions").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFestivalSettingsSchema = createInsertSchema(festivalSettingsTable).omit({ id: true, updatedAt: true });
export type InsertFestivalSettings = z.infer<typeof insertFestivalSettingsSchema>;
export type FestivalSettings = typeof festivalSettingsTable.$inferSelect;
