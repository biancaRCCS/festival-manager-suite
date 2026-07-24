import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./lib/stripeClient";
import app from "./app";
import { logger } from "./lib/logger";

/**
 * Initialize the Stripe schema and sync existing data on every startup.
 * Order matters: migrations → StripeSync instance → managed webhook → backfill.
 */
async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Stripe initialization.");
  }

  logger.info("Running Stripe schema migrations…");
  await runMigrations({ databaseUrl, schema: "stripe" });
  logger.info("Stripe schema ready.");

  const stripeSync = await getStripeSync();

  const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
  logger.info({ webhookBaseUrl }, "Configuring managed Stripe webhook…");
  const { webhook } = await stripeSync.findOrCreateManagedWebhook(
    `${webhookBaseUrl}/api/stripe/webhook`
  );
  logger.info({ url: webhook?.url }, "Stripe webhook configured.");

  // Backfill runs in background — don't await so the server starts immediately
  stripeSync.syncBackfill()
    .then(() => logger.info("Stripe backfill complete."))
    .catch((err) => logger.error({ err }, "Stripe backfill error."));
}

// Initialize Stripe before starting the HTTP server
await initStripe().catch((err) => {
  logger.error({ err }, "Stripe initialization failed — server will still start but payments may not work.");
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
