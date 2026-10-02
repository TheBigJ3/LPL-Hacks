import { loadStripe } from '@stripe/stripe-js'

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string

const STRIPE_ACCOUNT_ID = import.meta.env.VITE_STRIPE_ACCOUNT_ID as string

export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY, { stripeAccount: STRIPE_ACCOUNT_ID })
