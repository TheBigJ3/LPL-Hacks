import { z } from "zod";
import { UploadRequestTokenZod } from "../../../uploadRequests/uploadRequestToken.js";

export const ParamsZod = z.object({
  token: UploadRequestTokenZod,
  fileName: z.string().trim().min(1).max(255),
});
