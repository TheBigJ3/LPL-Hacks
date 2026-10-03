import { z } from "zod";

export const CLIENT_NAME_MAX_LENGTH = 120;
export const CLIENT_HOUSEHOLD_MAX_MEMBERS = 12;

export const ClientNameZod = z.string().trim().min(1).max(CLIENT_NAME_MAX_LENGTH);

// Tagging finds a person on a document by first and last name, so a single-word name could never be matched.
export const ClientPersonNameZod = ClientNameZod.refine((name) => name.split(/\s+/).length >= 2);
