import { z } from "zod";
import { NoteFieldsZod } from "../../../notes/note.js";

export const ParamsZod = NoteFieldsZod.extend({
  clientId: z.uuid(),
});
