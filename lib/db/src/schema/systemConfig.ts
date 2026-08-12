import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Generic key-value store for application-level configuration that must
 * survive restarts and cannot live in environment variables alone.
 *
 * Example use: the Stripe managed-webhook signing secret, which Stripe
 * returns only once (at creation time) and must therefore be persisted.
 */
export const systemConfigTable = pgTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type SystemConfig = typeof systemConfigTable.$inferSelect;
