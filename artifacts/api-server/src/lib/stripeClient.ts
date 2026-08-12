import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';
import { db, systemConfigTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

/**
 * Read a single value from the system_config table.
 * Returns null if the key is not found or the table doesn't exist yet.
 */
async function readSystemConfig(key: string): Promise<string | null> {
  try {
    const rows = await db
      .select({ value: systemConfigTable.value })
      .from(systemConfigTable)
      .where(eq(systemConfigTable.key, key))
      .limit(1);
    return rows[0]?.value ?? null;
  } catch {
    // Table may not exist on very first startup before migrations run
    return null;
  }
}

/**
 * Fetches the Stripe secret key and webhook signing secret.
 *
 * Priority for secret key:
 *   1. STRIPE_SK_API_KEY env var (user-supplied key)
 *   2. Replit Stripe connector API (managed integration)
 *
 * Priority for webhook secret:
 *   1. STRIPE_WEBHOOK_SECRET env var (explicit override)
 *   2. system_config DB row with key = 'stripe_webhook_secret'
 *      (persisted at startup when findOrCreateManagedWebhook() first returned a secret)
 *   3. Replit connector's stored webhook_secret (fallback)
 */
async function getStripeCredentials(): Promise<{ secretKey: string; webhookSecret: string }> {
  const envWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
  const dbWebhookSecret = envWebhookSecret ? null : await readSystemConfig('stripe_webhook_secret');

  // 1. User-supplied secret key takes priority
  if (process.env.STRIPE_SK_API_KEY) {
    return {
      secretKey: process.env.STRIPE_SK_API_KEY,
      webhookSecret: envWebhookSecret || dbWebhookSecret || '',
    };
  }

  // 2. Fall back to Replit connector API
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      'Missing Stripe credentials. Set STRIPE_SK_API_KEY or connect Stripe via the Integrations tab.'
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json() as { items?: Array<{ settings?: { secret?: string; webhook_secret?: string } }> };
  const settings = data.items?.[0]?.settings;

  if (!settings?.secret) {
    throw new Error(
      'Stripe integration not connected or missing secret key. ' +
      'Set STRIPE_SK_API_KEY or connect Stripe via the Integrations tab.'
    );
  }

  // Prefer the DB-persisted managed webhook secret over the connector's stored value,
  // since the connector value may not match the managed webhook created at startup.
  const webhookSecret =
    envWebhookSecret ||
    dbWebhookSecret ||
    settings.webhook_secret ||
    '';

  return {
    secretKey: settings.secret,
    webhookSecret,
  };
}

/**
 * Returns the active webhook signing secret using the standard priority chain:
 *   1. STRIPE_WEBHOOK_SECRET env var (explicit override)
 *   2. system_config DB row with key = 'stripe_webhook_secret'
 *   3. Empty string (no verification — acceptable in dev without a webhook secret)
 *
 * Use this when you need the raw secret without a full StripeSync instance.
 */
export async function getWebhookSecret(): Promise<string> {
  const envSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
  if (envSecret) return envSecret;
  return (await readSystemConfig('stripe_webhook_secret')) ?? '';
}

/**
 * Returns a fresh authenticated Stripe client.
 * Not cached — fetches credentials on every call so rotated keys are picked up.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

/**
 * Returns a fresh StripeSync instance for webhook processing and data sync.
 * Not cached — fetches credentials on every call so rotated keys are picked up.
 */
export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret,
  });
}

/**
 * Persists the Stripe managed-webhook signing secret to system_config.
 * Called once at startup when findOrCreateManagedWebhook() returns a new secret.
 * The secret is only present in the Stripe API response at creation time.
 */
export async function persistWebhookSecret(secret: string): Promise<void> {
  await db
    .insert(systemConfigTable)
    .values({ key: 'stripe_webhook_secret', value: secret })
    .onConflictDoUpdate({
      target: systemConfigTable.key,
      set: { value: secret, updatedAt: new Date() },
    });
}
