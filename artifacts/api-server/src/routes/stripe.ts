import { Router, type IRouter } from "express";
import { db, vendorsTable, sponsorsTable, festivalYearsTable, festivalSettingsTable, activityLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export const stripeWebhookRouter: IRouter = Router();

// Stripe checkout session creation (called from portal route)
export async function createCheckoutSession(params: {
  token: string;
  entity: { id: number; name: string; yearId: number };
  entityType: "vendor" | "sponsor";
}): Promise<string> {
  const { token, entity, entityType } = params;

  // Get Stripe client
  const stripeClient = await import("../lib/stripeClient").catch(() => null);
  if (!stripeClient) {
    throw new Error("Stripe not configured");
  }

  const stripe = await stripeClient.getUncachableStripeClient();
  const settingsRows = await db.select().from(festivalSettingsTable).where(eq(festivalSettingsTable.yearId, entity.yearId)).limit(1);
  const years = await db.select().from(festivalYearsTable).where(eq(festivalYearsTable.id, entity.yearId)).limit(1);

  const price = entityType === "vendor"
    ? parseFloat(settingsRows[0]?.vendorPrice ?? "200")
    : parseFloat(settingsRows[0]?.sponsorPrice ?? "500");

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost";
  const successUrl = `https://${domain}/portal/${token}/success`;
  const cancelUrl = `https://${domain}/portal/${token}`;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: Math.round(price * 100),
          product_data: {
            name: `${entityType === "vendor" ? "Vendor" : "Sponsor"} Fee — ${years[0]?.eventName ?? "Romanian Festival"}`,
            description: `${entity.name} — ${years[0]?.eventName ?? ""}`,
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

  if (entityType === "vendor") {
    await db.update(vendorsTable).set({ stripeSessionId: session.id, status: "payment_pending" }).where(eq(vendorsTable.id, entity.id));
  } else {
    await db.update(sponsorsTable).set({ stripeSessionId: session.id, status: "payment_pending" }).where(eq(sponsorsTable.id, entity.id));
  }

  return session.url ?? cancelUrl;
}

// Stripe webhook handler for payment completion
stripeWebhookRouter.post("/api/stripe/webhook", async (req, res): Promise<void> => {
  const stripeClient = await import("../lib/stripeClient").catch(() => null);
  if (!stripeClient) {
    res.status(503).json({ error: "Stripe not configured" });
    return;
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  try {
    const stripe = await stripeClient.getUncachableStripeClient();
    const sig = Array.isArray(signature) ? signature[0] : signature;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: any;
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // Dev fallback: parse raw body
      event = JSON.parse(req.body.toString());
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const { token, entityType, entityId } = session.metadata ?? {};

      if (entityId && entityType) {
        const id = parseInt(entityId, 10);
        if (entityType === "vendor") {
          await db.update(vendorsTable).set({ status: "paid", paidAt: new Date() }).where(eq(vendorsTable.id, id));
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
          await db.update(sponsorsTable).set({ status: "paid", paidAt: new Date() }).where(eq(sponsorsTable.id, id));
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
    }

    res.json({ received: true });
  } catch (err) {
    logger.error({ err }, "Stripe webhook error");
    res.status(400).json({ error: "Webhook error" });
  }
});
