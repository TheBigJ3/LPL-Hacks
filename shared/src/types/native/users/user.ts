export const userRoleTypes = ["advisor"] as const;

export type UserRole = typeof userRoleTypes[number];

export type User = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
};
