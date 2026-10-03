import { z } from "zod";

export const UploadRequestTokenZod = z.string().regex(/^[A-Za-z0-9_-]{32}$/);
