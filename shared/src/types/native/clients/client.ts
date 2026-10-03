export const clientKindTypes = ["household", "individual"] as const;

export type ClientKind = typeof clientKindTypes[number];

export type ClientMember = {
  id: string;
  slug: string;
  name: string;
};

export type Client = {
  id: string;
  slug: string;
  name: string;
  kind: ClientKind;
  members: ClientMember[];
};
