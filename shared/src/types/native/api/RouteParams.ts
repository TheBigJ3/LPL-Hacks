import { z } from "zod";
import { PaginationParamsZod } from "../../zod/api/RouteParams.js";

export type PaginationParams = z.infer<typeof PaginationParamsZod>;
