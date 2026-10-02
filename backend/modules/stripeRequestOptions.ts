import type Stripe from "stripe";

// A null account means the charge lives on the platform itself, so the call must not be scoped to any connected account.
export function stripeRequestOptions(stripeAccountId: string | null): Stripe.RequestOptions {
  return stripeAccountId ? { stripeAccount: stripeAccountId } : {};
}
