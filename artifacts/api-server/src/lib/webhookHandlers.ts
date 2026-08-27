import Stripe from 'stripe';
import { getStripeSync, getUncachableStripeClient, getWebhookSecret } from './stripeClient';
import { handleCheckoutComplete, handleCheckoutAsyncPaymentFailed } from '../routes/stripe';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    // stripe-replit-sync handles signature verification and syncs data to the stripe schema.
    // getStripeSync() reads the webhook secret from system_config (persisted at startup when
    // findOrCreateManagedWebhook() first returned the secret) or STRIPE_WEBHOOK_SECRET env var,
    // so it will always match the managed webhook that was registered.
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // Additionally parse the event ourselves to run application-level side effects
    // (marking vendors/sponsors as paid in our public schema tables).
    // We re-verify the signature using the same persisted secret so both paths
    // use the same source of truth (system_config or STRIPE_WEBHOOK_SECRET).
    try {
      const stripe = await getUncachableStripeClient();
      const webhookSecret = await getWebhookSecret();

      let event: Stripe.Event;
      if (webhookSecret) {
        // Verify signature when a webhook secret is configured
        event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      } else {
        // No webhook secret available — parse raw JSON.
        // Acceptable in dev/test mode where stripe-replit-sync already verified above.
        event = JSON.parse(payload.toString()) as Stripe.Event;
      }

      // checkout.session.completed: fires as soon as checkout finishes. Card
      // payments are already paid_status "paid" by then; async payment methods
      // (e.g. ACH) fire this with "unpaid" and settle later via one of the two
      // events below.
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
      }

      // checkout.session.async_payment_succeeded: an async payment method
      // finished settling. By this point payment_status reads "paid", so the
      // same fulfillment path used for synchronous payments applies here too.
      if (event.type === 'checkout.session.async_payment_succeeded') {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
      }

      // checkout.session.async_payment_failed: an async payment method did
      // not settle. Must never be treated as paid — see handleCheckoutAsyncPaymentFailed.
      if (event.type === 'checkout.session.async_payment_failed') {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutAsyncPaymentFailed(session);
      }
    } catch (err: any) {
      // Log but don't re-throw: stripe-replit-sync already verified the signature above.
      // A parse/fulfillment error shouldn't cause a 400 back to Stripe.
      console.error('Webhook application fulfillment error:', err?.message ?? err);
    }
  }
}
