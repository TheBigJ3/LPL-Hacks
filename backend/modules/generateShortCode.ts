import { randomBytes } from "crypto";

// Crockford base32 minus I, L, O and U: no character pair a person can confuse
// when reading a code back over the phone or typing one off a screen.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateShortCode(length: number): string {
  const bytes = randomBytes(length);

  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];

  return code;
}
