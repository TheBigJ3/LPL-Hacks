import Stripe from "stripe";
import dotenv from "dotenv";
import requireEnv from "../modules/requireEnv.js";

dotenv.config();

const STRIPE_SECRET_KEY: string = requireEnv("STRIPE_SECRET_KEY");
export const STRIPE_WEBHOOK_SECRET: string = requireEnv("STRIPE_WEBHOOK_SECRET");
export const STRIPE_CONNECT_WEBHOOK_SECRET: string = requireEnv("STRIPE_CONNECT_WEBHOOK_SECRET");
export const STRIPE_CONNECTED_ACCOUNT_ID: string = requireEnv("STRIPE_CONNECTED_ACCOUNT_ID");

export const stripe = new Stripe(STRIPE_SECRET_KEY);
