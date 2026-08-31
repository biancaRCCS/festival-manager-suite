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
/**
 * Given a Stripe Checkout session already attached to a sponsor, decides whether
 * it's still safe to hand back a payable URL for it.
 *
 * - Still `open`: return its URL — the sponsor can keep using this link.
 * - Already paid (`payment_status === "paid"`, regardless of Stripe's session
 *   `status`): the sponsor already completed payment. Our own webhook may just
 *   not have landed yet, so reconcile immediately via the same idempotent
 *   handler the webhook uses, then throw — callers must NOT fall through to
 *   creating a second payable session, or the sponsor could be charged twice.
 * - Otherwise (definitively `expired`/`canceled`, never paid): return null so
 *   the caller knows it's safe to create a fresh replacement session.
 */
async function reconcilePayableSessionOrThrow(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  sponsorId: number,
): Promise<string | null> {
  if (session.status === "open" && session.url) {
    return session.url;
  }
  if (session.payment_status === "paid") {
    await handleCheckoutComplete(session);
    throw new Error(
      `[stripe] Sponsor ${sponsorId} has already completed payment via Checkout session ${session.id}; refresh to see the updated status instead of issuing a new payment link.`,
    );
  }
  return null;
}

export async function getOrCreateSponsorCheckoutUrl(sponsorId: number): Promise<string> {
  const stripe = await getUncachableStripeClient();

  const [sponsor] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsorId)).limit(1);
  if (!sponsor) {
    throw new Error(`[stripe] Sponsor ${sponsorId} not found`);
  }
  if (sponsor.isInKind) {
    throw new Error(`[stripe] Cannot create checkout for in-kind sponsor ${sponsorId}`);
  }
  if (sponsor.status !== "pending_payment") {
    throw new Error(
      `[stripe] Cannot create checkout for sponsor ${sponsorId}: status is '${sponsor.status}', expected 'pending_payment'`,
    );
  }

  if (sponsor.stripeSessionId) {
    const existingSession = await stripe.checkout.sessions.retrieve(sponsor.stripeSessionId);
    const url = await reconcilePayableSessionOrThrow(stripe, existingSession, sponsor.id);
    if (url) {
      return url;
    }
    // existing session is definitively expired/canceled (not paid) — safe to replace below.
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
      const url = await reconcilePayableSessionOrThrow(stripe, winningSession, sponsor.id);
      if (url) return url;
    }
    throw new Error(
      `[stripe] Sponsor ${sponsor.id} Checkout session was claimed concurrently and the winning session could not be retrieved.`,
    );
  }

  return session.url ?? cancelUrl;
}

/** Invalidates a payable sponsor Checkout before staff records an in-kind gift. */
export async function invalidateSponsorCheckoutForInKind(sponsor: typeof sponsorsTable.$inferSelect): Promise<void> {
  if (!sponsor.stripeSessionId) return;
  const stripe = await getUncachableStripeClient();
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sponsor.stripeSessionId);
  } catch (err: any) {
    // A deleted/missing session cannot be paid and is safe to detach.
    if (err?.code === "resource_missing" || err?.statusCode === 404) return;
    throw new Error("Unable to verify the existing Stripe Checkout session; the sponsor was not marked in-kind.");
  }
  if (session.payment_status === "paid" || session.status === "complete" || sponsor.status === "payment_processing" || sponsor.stripePaidAt || sponsor.paidAt) {
    throw new Error("This sponsor has a paid or processing payment and cannot be marked in-kind.");
  }
  if (session.status === "open") {
    try {
      await stripe.checkout.sessions.expire(session.id);
    } catch {
      throw new Error("Unable to expire the open Stripe Checkout session; the sponsor was not marked in-kind.");
    }
  } else if (session.status !== "expired") {
    throw new Error("The existing Stripe Checkout session cannot be safely invalidated; the sponsor was not marked in-kind.");
  }
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
 * processes a checkout.session.completed or checkout.session.async_payment_succeeded
 * event.
 *
 * stripe-replit-sync handles signature verification and event parsing;
 * this function performs the application-level state transitions.
 *
 * Card payments settle synchronously, so `checkout.session.completed` already
 * carries `payment_status: "paid"` and fulfillment happens immediately below.
 * Bank-debit methods (e.g. ACH) settle asynchronously: `checkout.session.completed`
 * fires first with `payment_status: "unpaid"`, which we surface as a
 * "payment_processing" state, and the final outcome arrives later as its own
 * `checkout.session.async_payment_succeeded` (also routed here — by then
 * `payment_status` reads "paid") or `checkout.session.async_payment_failed`
 * event (handled by handleCheckoutAsyncPaymentFailed below).
 */
export async function handleCheckoutComplete(
  session: Stripe.Checkout.Session,
  stripeEventCreatedAt?: Date,
): Promise<void> {
  const { entityType, entityId } = session.metadata ?? {};

  if (entityType === "contribution") {
    await handleContributionCheckoutComplete(session);
    return;
  }

  if (!entityId || !entityType) return;

  const id = parseInt(entityId, 10);
  if (isNaN(id)) return;

  if (entityType === "vendor") {
    if (session.amount_total === null) {
      logger.warn({ sessionId: session.id }, "Ignoring vendor checkout with no amount_total");
      return;
    }

    if (session.payment_status !== "paid") {
      // Async payment method still settling. Only transition out of the
      // pre-payment status so this stays idempotent against webhook retries.
      const [updated] = await db
        .update(vendorsTable)
        .set({ status: "payment_processing" })
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
          type: "payment_processing",
          message: `Vendor ${updated.name}'s bank payment is processing`,
          entityType: "vendor",
          entityId: updated.id,
        });
      }
      return;
    }
    const [current] = await db.select().from(vendorsTable).where(
      and(eq(vendorsTable.id, id), eq(vendorsTable.stripeSessionId, session.id)),
    ).limit(1);
    if (!current) return;

    const shouldAdvanceToPaid = ["payment_pending", "payment_processing"].includes(current.status);
    if (current.stripePaidAt && !shouldAdvanceToPaid) return;
    const settledAt = stripeEventCreatedAt ?? new Date();
    const settledAmount = (session.amount_total / 100).toFixed(2);
    const [updated] = await db
      .update(vendorsTable)
      .set({
        status: shouldAdvanceToPaid ? "paid" : current.status,
        paidAt: current.paidAt ?? settledAt,
        stripePaidAt: current.stripePaidAt ?? settledAt,
        stripeSettledAmount: settledAmount,
        settledAmount: current.settledAmount ?? settledAmount,
        paymentFailedAt: null,
        paymentFailureReason: null,
      })
      .where(
        and(
          eq(vendorsTable.id, id),
          eq(vendorsTable.stripeSessionId, session.id),
          eq(vendorsTable.status, current.status),
          ...(current.stripePaidAt ? [] : [isNull(vendorsTable.stripePaidAt)]),
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
    if (session.amount_total === null) {
      logger.warn({ sessionId: session.id }, "Ignoring sponsor checkout with no amount_total");
      return;
    }

    if (session.payment_status !== "paid") {
      const [updated] = await db
        .update(sponsorsTable)
        .set({ status: "payment_processing" })
        .where(
          and(
            eq(sponsorsTable.id, id),
            eq(sponsorsTable.stripeSessionId, session.id),
            eq(sponsorsTable.status, "pending_payment"),
            eq(sponsorsTable.isInKind, false),
          ),
        )
        .returning();

      if (updated) {
        await db.insert(activityLogTable).values({
          type: "payment_processing",
          message: `Sponsor ${updated.name} (${updated.orgName})'s bank payment is processing`,
          entityType: "sponsor",
          entityId: updated.id,
        });
      }
      return;
    }
    const [current] = await db.select().from(sponsorsTable).where(
      and(eq(sponsorsTable.id, id), eq(sponsorsTable.stripeSessionId, session.id)),
    ).limit(1);
    if (!current) return;
    if (current.isInKind) return;

    const shouldAdvanceToPaid = ["pending_payment", "payment_processing"].includes(current.status);
    if (current.stripePaidAt && !shouldAdvanceToPaid) return;
    const settledAt = stripeEventCreatedAt ?? new Date();
    const [updated] = await db
      .update(sponsorsTable)
      .set({
        status: shouldAdvanceToPaid ? "paid" : current.status,
        paidAt: current.paidAt ?? settledAt,
        stripePaidAt: current.stripePaidAt ?? settledAt,
        stripeSettledAmount: (session.amount_total / 100).toFixed(2),
        paymentFailedAt: null,
        paymentFailureReason: null,
      })
      .where(
        and(
          eq(sponsorsTable.id, id),
          eq(sponsorsTable.stripeSessionId, session.id),
          eq(sponsorsTable.status, current.status),
          eq(sponsorsTable.isInKind, false),
          ...(current.stripePaidAt ? [] : [isNull(sponsorsTable.stripePaidAt)]),
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

/**
 * Handles `checkout.session.async_payment_failed`: an async payment method
 * (e.g. ACH bank transfer) did not settle. This never marks anything paid —
 * vendors/sponsors revert to their pre-payment status so the existing
 * retry/resend flows apply, and the failure is recorded for staff follow-up.
 * Contributions have no pre-payment status to revert to, so the row (created
 * as "processing" by the earlier checkout.session.completed event) is simply
 * marked failed in place.
 */
export async function handleCheckoutAsyncPaymentFailed(session: Stripe.Checkout.Session): Promise<void> {
  const { entityType, entityId } = session.metadata ?? {};
  const stripe = await getUncachableStripeClient();
  const reason = await describePaymentFailureReason(stripe, session);

  if (entityType === "contribution") {
    await upsertContributionFromSession(session, { status: "failed", paidAt: null, failureReason: reason });
    logger.warn({ sessionId: session.id, reason }, "Contribution bank payment failed");
    return;
  }

  if (!entityId || !entityType) return;
  const id = parseInt(entityId, 10);
  if (isNaN(id)) return;

  if (entityType === "vendor") {
    const [current] = await db.select().from(vendorsTable).where(
      and(eq(vendorsTable.id, id), eq(vendorsTable.stripeSessionId, session.id)),
    ).limit(1);
    if (!current || current.paymentFailedAt) return;
    const shouldRevertToApproved = ["payment_pending", "payment_processing"].includes(current.status);
    const [updated] = await db
      .update(vendorsTable)
      .set({
        status: shouldRevertToApproved ? "approved" : current.status,
        paymentFailedAt: new Date(),
        paymentFailureReason: reason,
      })
      .where(
        and(
          eq(vendorsTable.id, id),
          eq(vendorsTable.stripeSessionId, session.id),
          eq(vendorsTable.status, current.status),
          isNull(vendorsTable.paymentFailedAt),
        ),
      )
      .returning();

    if (updated) {
      logger.warn({ sessionId: session.id, vendorId: updated.id, reason }, "Vendor bank payment failed");
      await db.insert(activityLogTable).values({
        type: "payment_failed",
        message: `Vendor ${updated.name}'s bank payment failed: ${reason}`,
        entityType: "vendor",
        entityId: updated.id,
      });
    }
  } else if (entityType === "sponsor") {
    const [current] = await db.select().from(sponsorsTable).where(
      and(eq(sponsorsTable.id, id), eq(sponsorsTable.stripeSessionId, session.id)),
    ).limit(1);
    if (!current || current.isInKind || current.paymentFailedAt) return;
    const shouldRevertToPending = ["pending_payment", "payment_processing"].includes(current.status);
    const [updated] = await db
      .update(sponsorsTable)
      .set({
        status: shouldRevertToPending ? "pending_payment" : current.status,
        paymentFailedAt: new Date(),
        paymentFailureReason: reason,
      })
      .where(
        and(
          eq(sponsorsTable.id, id),
          eq(sponsorsTable.stripeSessionId, session.id),
          eq(sponsorsTable.status, current.status),
          eq(sponsorsTable.isInKind, false),
          isNull(sponsorsTable.paymentFailedAt),
        ),
      )
      .returning();

    if (updated) {
      logger.warn({ sessionId: session.id, sponsorId: updated.id, reason }, "Sponsor bank payment failed");
      await db.insert(activityLogTable).values({
        type: "payment_failed",
        message: `Sponsor ${updated.name} (${updated.orgName})'s bank payment failed: ${reason}`,
        entityType: "sponsor",
        entityId: updated.id,
      });
    }
  }
}

/**
 * The Checkout Session object carries no failure-reason field of its own —
 * the underlying PaymentIntent does. Best-effort lookup; a description is
 * always returned even if the retrieval fails.
 */
async function describePaymentFailureReason(stripe: Stripe, session: Stripe.Checkout.Session): Promise<string> {
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) return "Bank payment failed to settle (no additional details available).";

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.last_payment_error?.message) return intent.last_payment_error.message;
  } catch (err) {
    logger.warn({ err, paymentIntentId, sessionId: session.id }, "Failed to retrieve payment intent for failure reason");
  }
  return "Bank payment failed to settle (no additional details available).";
}

async function handleContributionCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
  if (!session.amount_total) {
    logger.warn({ sessionId: session.id }, "Ignoring contribution checkout with no amount_total");
    return;
  }

  if (session.payment_status === "paid") {
    await fulfillPaidContribution(session);
    return;
  }

  // Async payment method still settling (e.g. ACH): create/keep the row in a
  // "processing" state so staff and the donor list can see it, rather than
  // the donation silently vanishing until the bank transfer clears.
  await upsertContributionFromSession(session, { status: "processing", paidAt: null, failureReason: null });
}

async function fulfillPaidContribution(session: Stripe.Checkout.Session): Promise<void> {
  const paidAt = new Date();
  const result = await upsertContributionFromSession(session, { status: "paid", paidAt, failureReason: null });
  // Stripe retries webhook delivery; only send the receipt the first time a
  // given session actually transitions into "paid" so donors never receive
  // duplicate receipts.
  if (!result || !result.justSettled) return;

  const { row } = result;
  const [settings] = await db
    .select({ notificationEmail: festivalSettingsTable.notificationEmail })
    .from(festivalSettingsTable)
    .where(eq(festivalSettingsTable.yearId, row.yearId))
    .limit(1);

  await sendContributionReceipt({
    to: row.email,
    name: row.name,
    amount: Number(row.amount),
    paidAt,
    notificationEmail: settings?.notificationEmail,
  });
}

/**
 * Creates or updates the contribution row for a Checkout Session, keyed on
 * the session's unique ID so the same donation can move from "processing" to
 * "paid"/"failed" as later webhook events arrive. Never downgrades a row
 * that has already settled as "paid" — Stripe can redeliver webhooks out of
 * order, and a settled donation must stay settled.
 */
async function upsertContributionFromSession(
  session: Stripe.Checkout.Session,
  opts: { status: "processing" | "paid" | "failed"; paidAt: Date | null; failureReason: string | null },
): Promise<{ row: typeof contributionsTable.$inferSelect; justSettled: boolean } | null> {
  const [existing] = await db
    .select()
    .from(contributionsTable)
    .where(eq(contributionsTable.stripeSessionId, session.id))
    .limit(1);

  if (existing?.status === "paid") {
    return { row: existing, justSettled: false };
  }

  const setValues = {
    status: opts.status,
    paidAt: opts.paidAt,
    paymentFailedAt: opts.status === "failed" ? new Date() : null,
    paymentFailureReason: opts.status === "failed" ? opts.failureReason : null,
  };

  if (existing) {
    const [updated] = await db
      .update(contributionsTable)
      .set(setValues)
      .where(eq(contributionsTable.id, existing.id))
      .returning();
    return updated ? { row: updated, justSettled: opts.status === "paid" } : null;
  }

  const metadata = session.metadata ?? {};
  const yearId = Number.parseInt(metadata.yearId ?? "", 10);
  const email = session.customer_details?.email ?? session.customer_email ?? metadata.contributorEmail;
  const name = metadata.contributorName?.trim() || "Friend";
  const amount = session.amount_total != null ? session.amount_total / 100 : null;

  if (!Number.isSafeInteger(yearId) || yearId <= 0 || !email || amount === null || amount < 5) {
    logger.error(
      { sessionId: session.id, hasEmail: !!email, yearId, amount },
      "Contribution checkout is missing required fulfillment data",
    );
    return null;
  }

  const [inserted] = await db
    .insert(contributionsTable)
    .values({
      yearId,
      name,
      email,
      amount: amount.toFixed(2),
      stripeSessionId: session.id,
      ...setValues,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) return { row: inserted, justSettled: opts.status === "paid" };

  // Lost a race against a concurrent webhook delivery for the same session.
  const [race] = await db
    .select()
    .from(contributionsTable)
    .where(eq(contributionsTable.stripeSessionId, session.id))
    .limit(1);
  return race ? { row: race, justSettled: false } : null;
}
