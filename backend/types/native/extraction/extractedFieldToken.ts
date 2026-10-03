export type ExtractedFieldToken =
  | { kind: "word"; text: string }
  | { kind: "selection"; selected: boolean };
