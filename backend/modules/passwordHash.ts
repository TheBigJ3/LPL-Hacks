import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
    return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedPassword: string): Promise<boolean> {
    const [salt, storedHash] = storedPassword.split(":");
    if (!salt || !storedHash || !/^[a-f0-9]+$/i.test(storedHash)) return false;

    const expectedHash = Buffer.from(storedHash, "hex");
    const actualHash = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;

    return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
}
