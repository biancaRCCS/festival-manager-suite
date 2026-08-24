import { runMigrations } from "stripe-replit-sync";
import { getStripeSync, persistWebhookSecret } from "./lib/stripeClient";
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
  await runMigrations({ databaseUrl });
  logger.info("Stripe schema ready.");

  const stripeSync = await getStripeSync();

  const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
  logger.info({ webhookBaseUrl }, "Configuring managed Stripe webhook…");
  const webhook = await stripeSync.findOrCreateManagedWebhook(
    `${webhookBaseUrl}/api/stripe/webhook`
  );
  logger.info({ url: webhook?.url }, "Stripe webhook configured.");

  // Stripe only includes the signing secret in the creation response (never on retrieval).
  // Persist it immediately so every subsequent server restart can verify webhook signatures.
  if (webhook?.secret) {
    logger.info("Persisting managed webhook signing secret to system_config…");
    await persistWebhookSecret(webhook.secret);
    logger.info("Webhook signing secret persisted.");
  }

  // Backfill runs in background — don't await so the server starts immediately
  stripeSync.syncBackfill()
    .then(() => logger.info("Stripe backfill complete."))
    .catch((err) => logger.error({ err }, "Stripe backfill error."));
}

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

  // Keep the readiness endpoint available during Stripe setup. Stripe failures were
  // already non-fatal, and checkout/webhook requests continue to use their existing
  // Stripe client handling once initialization completes.
  void initStripe().catch((err) => {
    logger.error({ err }, "Stripe initialization failed — server remains available but payments may not work.");
  });
});
