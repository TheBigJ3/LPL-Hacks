import { z } from "zod";
import { UploadRequestTokenZod } from "../../zod/uploadRequests/uploadRequestToken.js";

export type UploadRequestToken = z.infer<typeof UploadRequestTokenZod>;
