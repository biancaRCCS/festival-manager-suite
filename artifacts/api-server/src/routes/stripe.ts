import Stripe from "stripe";
import { db, vendorsTable, sponsorsTable, contributionsTable, festivalYearsTable, festivalSettingsTable, activityLogTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { sendContributionReceipt, sendSponsorPaymentReceiptEmail, sendNewApplicationNotification, TIER_LABELS } from "../lib/email";
import { logger } from "../lib/logger";

/**
 * Creates a Stripe Checkout session for vendor portal payment.
 * Called from routes/portal.ts after the vendor signs their agreement.
 * Sponsors pay at the public application stage instead — see
 * getOrCreateSponsorCheckoutUrl below.
 */
export async function createCheckoutSession(params: {
  token: string;
  entity: { id: number; name: string; yearId: number };
  entityType: "vendor";
}): Promise<string> {
  const { token, entity } = params;

  const stripe = await getUncachableStripeClient();

  const settingsRows = await db
    .select()
    .from(festivalSettingsTable)
    .where(eq(festivalSettingsTable.yearId, entity.yearId))
    .limit(1);
  const settingsRow = settingsRows[0];

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
  const vendorPricingRevision = vendorRow.pricingRevision;
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
  const price = basePrice * multiplier;

  const typeLabel = vendorTypeLabels[vendorType] ?? vendorType;
  const lineItemDescription = isDouble
    ? `${typeLabel} — double space (2 × $${basePrice.toLocaleString()})`
    : `${typeLabel} — single space · $${basePrice.toLocaleString()}`;

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
      entityType: "vendor",
      entityId: entity.id.toString(),
      pricingRevision: String(vendorPricingRevision),
    },
  });

  // Mark the vendor as payment-pending and store the session ID
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

  return session.url ?? cancelUrl;
}

/**
 * Creates (or reuses an open) Stripe Checkout session for a sponsor's
 * pay-first application. Called both from the public apply route (initial
 * payment) and from the staff-triggered resend-payment-link route.
 */
export async function getOrCreateSponsorCheckoutUrl(sponsorId: number): Promise<string> {
  const stripe = await getUncachableStripeClient();

  const [sponsor] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsorId)).limit(1);
  if (!sponsor) {
    throw new Error(`[stripe] Sponsor ${sponsorId} not found`);
  }
  if (sponsor.status !== "pending_payment") {
    throw new Error(
      `[stripe] Cannot create checkout for sponsor ${sponsorId}: status is '${sponsor.status}', expected 'pending_payment'`,
    );
  }

  if (sponsor.stripeSessionId) {
    const existingSession = await stripe.checkout.sessions.retrieve(sponsor.stripeSessionId);
    if (existingSession.status === "open" && existingSession.url) {
      return existingSession.url;
    }
  }

  const [settingsRow] = await db
    .select()
    .from(festivalSettingsTable)
    .where(eq(festivalSettingsTable.yearId, sponsor.yearId))
    .limit(1);
  if (!settingsRow) {
    throw new Error(
      `[stripe] Festival settings not found for year ${sponsor.yearId} — cannot determine tier minimum for sponsor ${sponsorId}`
    );
  }
  const [year] = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, sponsor.yearId)).limit(1);

  const tier = sponsor.tier ?? "bronze";
  const tierMinMap: Record<string, string> = {
    bronze:   settingsRow.sponsorPriceBronze,
    silver:   settingsRow.sponsorPriceSilver,
    gold:     settingsRow.sponsorPriceGold,
    platinum: settingsRow.sponsorPricePlatinum,
    diamond:  settingsRow.sponsorPriceDiamond,
  };
  const tierMin = parseFloat(tierMinMap[tier] ?? "0");

  // Charge what the sponsor actually entered; fall back to the tier minimum if missing or invalid
  const rawAmount = sponsor.sponsorshipAmount != null ? parseFloat(sponsor.sponsorshipAmount) : null;
  let price: number;
  if (rawAmount === null) {
    console.warn(`[stripe] sponsorshipAmount missing for sponsor ${sponsorId} (tier: ${tier}) — falling back to tier minimum $${tierMin}`);
    price = tierMin;
  } else if (rawAmount < tierMin) {
    console.warn(`[stripe] sponsorshipAmount $${rawAmount} is below tier minimum $${tierMin} for sponsor ${sponsorId} (tier: ${tier}) — falling back to tier minimum`);
    price = tierMin;
  } else {
    price = rawAmount;
  }

  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  const lineItemDescription = `${tierLabel} Sponsor — $${price.toLocaleString()}`;

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost";
  const successUrl = `https://${domain}/apply/sponsor/success`;
  const cancelUrl  = `https://${domain}/apply/sponsor`;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: Math.round(price * 100),
          product_data: {
            name: lineItemDescription,
            description: `${sponsor.orgName} — ${year?.eventName ?? "Romanian Festival"}`,
          },
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      entityType: "sponsor",
      entityId: sponsor.id.toString(),
    },
  });

  // Atomically claim this new session for the sponsor. The WHERE clause requires
  // stripeSessionId to still equal whatever we read at the top of this function
  // (or still be null). This guards against a concurrent call (e.g. two
  // simultaneous "Resend Payment Link" clicks, or a resend racing the original
  // apply-time creation) each creating their own Stripe session and one silently
  // clobbering the other's session id in the DB — which would orphan whichever
  // session the sponsor actually pays through, since handleCheckoutComplete's
  // webhook match requires the stored stripeSessionId to equal the paid session.
  const claimCondition = sponsor.stripeSessionId
    ? eq(sponsorsTable.stripeSessionId, sponsor.stripeSessionId)
    : isNull(sponsorsTable.stripeSessionId);

  const [claimed] = await db
    .update(sponsorsTable)
    .set({ stripeSessionId: session.id })
    .where(and(eq(sponsorsTable.id, sponsor.id), eq(sponsorsTable.status, "pending_payment"), claimCondition))
    .returning({ stripeSessionId: sponsorsTable.stripeSessionId });

  if (!claimed) {
    // Lost the race — another call already attached a different session first.
    // Discard the session we just created and hand back the winning one instead
    // of leaving two live, payable Checkout sessions for the same sponsor.
    await stripe.checkout.sessions.expire(session.id);
    const [current] = await db
      .select({ stripeSessionId: sponsorsTable.stripeSessionId })
      .from(sponsorsTable)
      .where(eq(sponsorsTable.id, sponsor.id))
      .limit(1);
    if (current?.stripeSessionId) {
      const winningSession = await stripe.checkout.sessions.retrieve(current.stripeSessionId);
      if (winningSession.url) return winningSession.url;
    }
    throw new Error(
      `[stripe] Sponsor ${sponsor.id} Checkout session was claimed concurrently and the winning session could not be retrieved.`,
    );
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
    if (session.payment_status !== "paid" || session.amount_total === null) {
      logger.warn({ sessionId: session.id, paymentStatus: session.payment_status }, "Ignoring unpaid sponsor checkout");
      return;
    }
    const [updated] = await db
      .update(sponsorsTable)
      .set({ status: "paid", paidAt: new Date() })
      .where(
        and(
          eq(sponsorsTable.id, id),
          eq(sponsorsTable.stripeSessionId, session.id),
          eq(sponsorsTable.status, "pending_payment"),
        ),
      )
      .returning();

    if (!updated) return;

    await db.insert(activityLogTable).values({
      type: "paid",
      message: `Sponsor ${updated.name} (${updated.orgName}) completed payment`,
      entityType: "sponsor",
      entityId: updated.id,
    });

    const amount = session.amount_total / 100;
    const [year] = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, updated.yearId)).limit(1);
    const [settings] = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, updated.yearId)).limit(1);
    const notificationEmail = settings?.notificationEmail ?? "vendors@romaniancenter.org";
    const festivalName = year?.eventName ?? "Romanian Festival";
    const tierLabel = TIER_LABELS[updated.tier] ?? updated.tier;

    void Promise.all([
      sendSponsorPaymentReceiptEmail({
        to: updated.email,
        name: updated.name,
        orgName: updated.orgName,
        tier: updated.tier,
        amount,
        festivalName,
      }),
      sendNewApplicationNotification({
        notificationEmail,
        applicationType: "sponsor",
        applicantName: updated.name,
        organizationOrBusiness: updated.orgName,
        categoryOrTier: tierLabel,
        contactEmail: updated.email,
        contactPhone: updated.phone,
        adminPath: `/sponsors/${updated.id}`,
        extra: `$${amount.toLocaleString()}`,
      }),
    ]);
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
