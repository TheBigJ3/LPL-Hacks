import { z } from "zod";
import { noteColorTypes } from "../../native/notes/note.js";

export const NoteFieldsZod = z.object({
  memberId: z.uuid().nullable(),
  title: z.string().trim().min(1).max(200),
  html: z.string().max(200_000),
  text: z.string().max(100_000),
  color: z.enum(noteColorTypes),
});
