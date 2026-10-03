import { z } from "zod";
import { ParamsZod } from "../../../../zod/api/v1/uploadRequests/list.js";
import type { UploadRequest } from "../../../uploadRequests/uploadRequest.js";

export type Params = z.infer<typeof ParamsZod>;

export type Response = {
  success: true;
  uploadRequests: UploadRequest[];
};
