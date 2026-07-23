import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { festivalYearsTable } from "./festivalYears";

export const volunteersTable = pgTable("volunteers", {
  id: serial("id").primaryKey(),
  yearId: integer("year_id").notNull().references(() => festivalYearsTable.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  availability: text("availability"),
  status: text("status").notNull().default("pending"),
  applicationData: jsonb("application_data").notNull().default({}),
  assignedRole: text("assigned_role"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVolunteerSchema = createInsertSchema(volunteersTable).omit({ id: true, createdAt: true });
export type InsertVolunteer = z.infer<typeof insertVolunteerSchema>;
export type Volunteer = typeof volunteersTable.$inferSelect;
