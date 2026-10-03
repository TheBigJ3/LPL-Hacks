export const noteColorTypes = ["yellow", "pink", "mint", "blue", "mauve", "gray"] as const;

export type NoteColor = typeof noteColorTypes[number];

export type Note = {
  id: string;
  clientId: string;
  memberId: string | null;
  title: string;
  html: string;
  text: string;
  color: NoteColor;
  createdAt: string;
  updatedAt: string;
};
