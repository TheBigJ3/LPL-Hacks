import { z } from "zod";
import { ParamsZod } from "../../../../zod/api/v1/uploadRequests/portal.js";
import type { UploadRequestPortal } from "../../../uploadRequests/uploadRequestPortal.js";

export type Params = z.infer<typeof ParamsZod>;

export type Response = {
  success: true;
  portal: UploadRequestPortal;
};
