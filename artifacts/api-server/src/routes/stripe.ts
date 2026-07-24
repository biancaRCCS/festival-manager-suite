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

  let price: number;
  if (entityType === "vendor") {
    price = parseFloat(settingsRow?.vendorPrice ?? "200");
  } else {
    // Look up the sponsor's chosen tier and charge the matching price
    const [sponsor] = await db
      .select({ tier: sponsorsTable.tier })
      .from(sponsorsTable)
      .where(eq(sponsorsTable.id, entity.id))
      .limit(1);
    const tier = sponsor?.tier ?? "bronze";
    const tierPriceMap: Record<string, string> = {
      bronze:   settingsRow?.sponsorPriceBronze   ?? "250",
      silver:   settingsRow?.sponsorPriceSilver   ?? "500",
      gold:     settingsRow?.sponsorPriceGold     ?? "1000",
      platinum: settingsRow?.sponsorPricePlatinum ?? "2000",
    };
    price = parseFloat(tierPriceMap[tier] ?? "250");
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
            name: `${entityType === "vendor" ? "Vendor" : "Sponsor"} Fee — ${year?.eventName ?? "Romanian Festival"}`,
            description: `${entity.name} — ${year?.eventName ?? ""}`,
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
