import { z } from "zod";
import { ParamsZod } from "../../../../zod/api/v1/uploadRequests/upload.js";

export type Params = z.infer<typeof ParamsZod>;

export type Response = {
  success: true;
  fileName: string;
};
