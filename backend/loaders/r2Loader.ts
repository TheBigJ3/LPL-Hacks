import requireEnv from "../modules/requireEnv.js";
import { StorageService } from "../services/storage/StorageService.js";

const R2_ACCOUNT_ID = requireEnv("R2_ACCOUNT_ID");
const R2_ACCESS_KEY_ID = requireEnv("R2_ACCESS_KEY_ID");
const R2_SECRET_ACCESS_KEY = requireEnv("R2_SECRET_ACCESS_KEY");
const R2_PUBLIC_BUCKET = requireEnv("R2_PUBLIC_BUCKET");
const R2_PUBLIC_BASE_URL = requireEnv("R2_PUBLIC_BASE_URL");
const R2_PRIVATE_BUCKET = requireEnv("R2_PRIVATE_BUCKET");

export const PUBLIC_STORAGE = new StorageService({
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_PUBLIC_BUCKET,
    publicBaseUrl: R2_PUBLIC_BASE_URL,
});

export const PRIVATE_STORAGE = new StorageService({
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_PRIVATE_BUCKET,
});
