// Stripe client — loaded lazily so the server starts without Stripe configured.
// Once the Stripe integration is connected, this will use the Replit connector SDK
// to fetch credentials. Replace this stub with the real implementation from the
// Stripe skill after connecting the Stripe integration.

let stripeInstance: import("stripe").default | null = null;

export async function getUncachableStripeClient(): Promise<import("stripe").default> {
  // Dynamic import to avoid crashing if stripe package is missing
  const Stripe = (await import("stripe")).default;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Please connect the Stripe integration."
    );
  }

  return new Stripe(secretKey, { apiVersion: "2024-06-20" as any });
}
