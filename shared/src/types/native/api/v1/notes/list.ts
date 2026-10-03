import { z } from "zod";
import { ParamsZod } from "../../../../zod/api/v1/notes/list.js";
import type { Note } from "../../../notes/note.js";

export type Params = z.infer<typeof ParamsZod>;

export type Response = {
  success: true;
  notes: Note[];
};
