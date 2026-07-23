import { pgTable, serial, integer, text, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const festivalYearsTable = pgTable("festival_years", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  eventName: text("event_name").notNull(),
  eventDate: date("event_date", { mode: "string" }).notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFestivalYearSchema = createInsertSchema(festivalYearsTable).omit({ id: true, createdAt: true });
export type InsertFestivalYear = z.infer<typeof insertFestivalYearSchema>;
export type FestivalYear = typeof festivalYearsTable.$inferSelect;
