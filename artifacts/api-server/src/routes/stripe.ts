import { db, vendorsTable, sponsorsTable, festivalYearsTable, festivalSettingsTable, activityLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient";

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
  if (entityType === "vendor") {
    const [vendorRow] = await db
      .select({ vendorType: vendorsTable.vendorType, applicationData: vendorsTable.applicationData })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, entity.id))
      .limit(1);
    const vendorType = vendorRow?.vendorType ?? "retail";
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
      .select({ tier: sponsorsTable.tier, sponsorshipAmount: sponsorsTable.sponsorshipAmount })
      .from(sponsorsTable)
      .where(eq(sponsorsTable.id, entity.id))
      .limit(1);
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
    },
  });

  // Mark the entity as payment-pending and store the session ID
  if (entityType === "vendor") {
    await db
      .update(vendorsTable)
      .set({ stripeSessionId: session.id, status: "payment_pending" })
      .where(eq(vendorsTable.id, entity.id));
  } else {
    await db
      .update(sponsorsTable)
      .set({ stripeSessionId: session.id, status: "payment_pending" })
      .where(eq(sponsorsTable.id, entity.id));
  }

  return session.url ?? cancelUrl;
}

/**
 * Post-payment fulfillment: called from webhookHandlers after stripe-replit-sync
 * processes a checkout.session.completed event.
 *
 * stripe-replit-sync handles signature verification and event parsing;
 * this function performs the application-level state transitions.
 */
export async function handleCheckoutComplete(sessionMetadata: {
  token?: string;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  const { entityType, entityId } = sessionMetadata;
  if (!entityId || !entityType) return;

  const id = parseInt(entityId, 10);
  if (isNaN(id)) return;

  if (entityType === "vendor") {
    await db
      .update(vendorsTable)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(vendorsTable.id, id));

    const [v] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id));
    if (v) {
      await db.insert(activityLogTable).values({
        type: "paid",
        message: `Vendor ${v.name} completed payment`,
        entityType: "vendor",
        entityId: v.id,
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
