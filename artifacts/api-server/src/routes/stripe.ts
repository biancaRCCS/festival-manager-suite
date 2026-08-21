import Stripe from "stripe";
import { db, vendorsTable, sponsorsTable, contributionsTable, festivalYearsTable, festivalSettingsTable, activityLogTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { sendContributionReceipt } from "../lib/email";
import { logger } from "../lib/logger";

/**
 * Creates a Stripe Checkout session for vendor or sponsor portal payment.
 * Called from routes/portal.ts after the applicant signs their agreement.
 */
export async function createCheckoutSession(params: {
  token: string;
  entity: { id: number; name: string; yearId: number };
  entityType: "vendor" | "sponsor";
}): Promise<string> {
  const { token, entity, entityType } = params;

  const stripe = await getUncachableStripeClient();

  const [settingsRow] = await db
    .select()
    .from(festivalSettingsTable)
    .where(eq(festivalSettingsTable.yearId, entity.yearId))
    .limit(1);

  const [year] = await db
    .select()
    .from(festivalYearsTable)
    .where(eq(festivalYearsTable.id, entity.yearId))
    .limit(1);

  const vendorTypeLabels: Record<string, string> = {
    major_food:    "Major Food Vendor",
    specialty_food: "Specialty Food & Beverage Vendor",
    retail:        "Retail, Artisan & Business Vendor",
    nonprofit:     "Verified Nonprofit Organization",
  };

  let price: number;
  let lineItemDescription: string;
  let vendorPricingRevision: number | null = null;
  if (entityType === "vendor") {
    const [vendorRow] = await db
      .select({
        vendorType: vendorsTable.vendorType,
        applicationData: vendorsTable.applicationData,
        status: vendorsTable.status,
        stripeSessionId: vendorsTable.stripeSessionId,
        pricingRevision: vendorsTable.pricingRevision,
      })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, entity.id))
      .limit(1);
    if (vendorRow?.status === "payment_pending" && vendorRow.stripeSessionId) {
      const existingSession = await stripe.checkout.sessions.retrieve(vendorRow.stripeSessionId);
      if (existingSession.status === "open" && existingSession.url) {
        return existingSession.url;
      }
    }
    if (!vendorRow || vendorRow.status !== "approved") {
      throw new Error(
        `[stripe] Cannot create checkout for vendor ${entity.id}: status is '${vendorRow?.status ?? "missing"}', expected 'approved'`,
      );
    }
    const vendorType = vendorRow.vendorType;
    vendorPricingRevision = vendorRow.pricingRevision;
    const vendorPriceMap: Record<string, string> = {
      major_food:    settingsRow?.vendorPriceMajorFood    ?? "2000",
      specialty_food: settingsRow?.vendorPriceSpecialtyFood ?? "600",
      retail:        settingsRow?.vendorPriceRetail        ?? "300",
      nonprofit:     settingsRow?.vendorPriceNonprofit     ?? "150",
    };
    const basePrice = parseFloat(vendorPriceMap[vendorType] ?? "300");

    // Read spacesRequested from applicationData; treat missing/unknown as single
    const appData = (vendorRow?.applicationData ?? {}) as Record<string, unknown>;
    const spacesRequested = typeof appData.spacesRequested === "string" ? appData.spacesRequested : null;
    if (spacesRequested === null) {
      console.warn(`[stripe] spacesRequested missing for vendor ${entity.id} — treating as single`);
    }
    const isDouble = spacesRequested === "double";
    const multiplier = isDouble ? 2 : 1;
    price = basePrice * multiplier;

    const typeLabel = vendorTypeLabels[vendorType] ?? vendorType;
    lineItemDescription = isDouble
      ? `${typeLabel} — double space (2 × $${basePrice.toLocaleString()})`
      : `${typeLabel} — single space · $${basePrice.toLocaleString()}`;
  } else {
    // Require settings to be present — we must not invent a price if the record is missing
    if (!settingsRow) {
      throw new Error(
        `[stripe] Festival settings not found for year ${entity.yearId} — cannot determine tier minimum for sponsor ${entity.id}`
      );
    }

    const [sponsor] = await db
      .select({ tier: sponsorsTable.tier, sponsorshipAmount: sponsorsTable.sponsorshipAmount, status: sponsorsTable.status })
      .from(sponsorsTable)
      .where(eq(sponsorsTable.id, entity.id))
      .limit(1);

    // Belt-and-suspenders guard: portal.ts should have already refused, but
    // reject here too if the sponsor hasn't had their details approved yet.
    const sponsorStatus = sponsor?.status ?? "";
    if (!["details_approved", "payment_pending", "paid"].includes(sponsorStatus)) {
      throw new Error(
        `[stripe] Cannot create checkout for sponsor ${entity.id}: status is '${sponsorStatus}', expected 'details_approved'`
      );
    }
    const tier = sponsor?.tier ?? "bronze";

    // Tier minimums come exclusively from Settings
    const tierMinMap: Record<string, string> = {
      bronze:   settingsRow.sponsorPriceBronze,
      silver:   settingsRow.sponsorPriceSilver,
      gold:     settingsRow.sponsorPriceGold,
      platinum: settingsRow.sponsorPricePlatinum,
      diamond:  settingsRow.sponsorPriceDiamond,
    };
    const tierMin = parseFloat(tierMinMap[tier] ?? "0");

    // Charge what the sponsor actually entered; fall back to the tier minimum if missing or invalid
    const rawAmount = sponsor?.sponsorshipAmount != null ? parseFloat(sponsor.sponsorshipAmount) : null;
    if (rawAmount === null) {
      console.warn(`[stripe] sponsorshipAmount missing for sponsor ${entity.id} (tier: ${tier}) — falling back to tier minimum $${tierMin}`);
      price = tierMin;
    } else if (rawAmount < tierMin) {
      console.warn(`[stripe] sponsorshipAmount $${rawAmount} is below tier minimum $${tierMin} for sponsor ${entity.id} (tier: ${tier}) — falling back to tier minimum`);
      price = tierMin;
    } else {
      price = rawAmount;
    }

    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    lineItemDescription = `${tierLabel} Sponsor — $${price.toLocaleString()}`;
  }

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost";
  const successUrl = `https://${domain}/portal/${token}/success`;
  const cancelUrl  = `https://${domain}/portal/${token}`;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: Math.round(price * 100),
          product_data: {
            name: lineItemDescription,
            description: `${entity.name} — ${year?.eventName ?? "Romanian Festival"}`,
          },
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      token,
      entityType,
      entityId: entity.id.toString(),
        ...(entityType === "vendor" ? { pricingRevision: String(vendorPricingRevision) } : {}),
    },
  });

  // Mark the entity as payment-pending and store the session ID
  if (entityType === "vendor") {
    const [attachedVendor] = await db
      .update(vendorsTable)
      .set({ stripeSessionId: session.id, status: "payment_pending" })
      .where(
        and(
          eq(vendorsTable.id, entity.id),
          eq(vendorsTable.status, "approved"),
          eq(vendorsTable.pricingRevision, vendorPricingRevision!),
        ),
      )
      .returning({ id: vendorsTable.id });
    if (!attachedVendor) {
      await stripe.checkout.sessions.expire(session.id);
      throw new Error(
        `[stripe] Vendor ${entity.id} changed category or payment state before Checkout could be attached; expired stale Checkout.`,
      );
    }
  } else {
    await db
      .update(sponsorsTable)
      .set({ stripeSessionId: session.id, status: "payment_pending" })
      .where(eq(sponsorsTable.id, entity.id));
  }

  return session.url ?? cancelUrl;
}

/**
 * Creates a one-time public contribution checkout without writing an application
 * record. The contribution is persisted only after Stripe's verified webhook.
 */
export async function createContributionCheckout(params: {
  name: string;
  email: string;
  amount: number;
  yearId: number;
}): Promise<string> {
  const { name, email, amount, yearId } = params;
  const stripe = await getUncachableStripeClient();
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || cents < 500) {
    throw new Error("Contribution amount must be at least $5.00");
  }

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost";
  const successUrl = `https://${domain}/support/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `https://${domain}/support`;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: cents,
          product_data: {
            name: "Contribution to the Romanian Community Center of Sacramento",
            description: "Supporting the Romanian Festival and community events",
          },
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      entityType: "contribution",
      contributorName: name,
      contributorEmail: email,
      yearId: String(yearId),
    },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }
  return session.url;
}

/**
 * Post-payment fulfillment: called from webhookHandlers after stripe-replit-sync
 * processes a checkout.session.completed event.
 *
 * stripe-replit-sync handles signature verification and event parsing;
 * this function performs the application-level state transitions.
 */
export async function handleCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
  const { entityType, entityId } = session.metadata ?? {};

  if (entityType === "contribution") {
    await handleContributionCheckoutComplete(session);
    return;
  }

  if (!entityId || !entityType) return;

  const id = parseInt(entityId, 10);
  if (isNaN(id)) return;

  if (entityType === "vendor") {
    if (session.payment_status !== "paid" || session.amount_total === null) {
      logger.warn({ sessionId: session.id, paymentStatus: session.payment_status }, "Ignoring unpaid vendor checkout");
      return;
    }
    const [updated] = await db
      .update(vendorsTable)
      .set({
        status: "paid",
        paidAt: new Date(),
        settledAmount: (session.amount_total / 100).toFixed(2),
      })
      .where(
        and(
          eq(vendorsTable.id, id),
          eq(vendorsTable.stripeSessionId, session.id),
          eq(vendorsTable.status, "payment_pending"),
        ),
      )
      .returning();

    if (updated) {
      await db.insert(activityLogTable).values({
        type: "paid",
        message: `Vendor ${updated.name} completed payment`,
        entityType: "vendor",
        entityId: updated.id,
      });
    }
  } else if (entityType === "sponsor") {
    await db
      .update(sponsorsTable)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(sponsorsTable.id, id));

    const [s] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, id));
    if (s) {
      await db.insert(activityLogTable).values({
        type: "paid",
        message: `Sponsor ${s.name} completed payment`,
        entityType: "sponsor",
        entityId: s.id,
      });
    }
  }
}

async function handleContributionCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid" || !session.amount_total) {
    logger.warn(
      { sessionId: session.id, paymentStatus: session.payment_status },
      "Ignoring contribution checkout that is not paid",
    );
    return;
  }

  const metadata = session.metadata ?? {};
  const yearId = Number.parseInt(metadata.yearId ?? "", 10);
  const email = session.customer_details?.email ?? session.customer_email ?? metadata.contributorEmail;
  const name = metadata.contributorName?.trim() || "Friend";
  const amount = session.amount_total / 100;

  if (!Number.isSafeInteger(yearId) || yearId <= 0 || !email || amount < 5) {
    logger.error(
      { sessionId: session.id, hasEmail: !!email, yearId, amount },
      "Contribution checkout is missing required fulfillment data",
    );
    return;
  }

  const paidAt = new Date();
  const inserted = await db
    .insert(contributionsTable)
    .values({
      yearId,
      name,
      email,
      amount: amount.toFixed(2),
      stripeSessionId: session.id,
      paidAt,
    })
    .onConflictDoNothing()
    .returning({ id: contributionsTable.id });

  // Stripe retries webhook delivery; the unique session ID makes fulfillment
  // idempotent and ensures donors never receive duplicate receipts.
  if (inserted.length === 0) return;

  const [settings] = await db
    .select({ notificationEmail: festivalSettingsTable.notificationEmail })
    .from(festivalSettingsTable)
    .where(eq(festivalSettingsTable.yearId, yearId))
    .limit(1);

  await sendContributionReceipt({
    to: email,
    name,
    amount,
    paidAt,
    notificationEmail: settings?.notificationEmail,
  });
}
