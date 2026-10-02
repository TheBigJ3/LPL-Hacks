import twilio from "twilio";
import requireEnv from "../modules/requireEnv.js";

const TWILLIO_API_SID = requireEnv("TWILLIO_API_SID");
const TWILLIO_SECRET = requireEnv("TWILLIO_SECRET");
const TWILLIO_ACCOUNT_SID = requireEnv("TWILLIO_ACCOUNT_SID");
export const TWILLIO_VERIFY_SERVICE_SID = requireEnv("TWILLIO_VERIFY_SERVICE_SID");

export const twilio_client = twilio(TWILLIO_API_SID, TWILLIO_SECRET, {
    accountSid: TWILLIO_ACCOUNT_SID,
});
