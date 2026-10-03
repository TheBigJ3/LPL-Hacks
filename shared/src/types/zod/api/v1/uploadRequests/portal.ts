import { z } from "zod";
import { UploadRequestTokenZod } from "../../../uploadRequests/uploadRequestToken.js";

export const ParamsZod = z.object({
  token: UploadRequestTokenZod,
});
