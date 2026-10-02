import type { User } from "@lpl-hacks/shared/src/types/native/users/user.js";
import requireEnv from "../../modules/requireEnv.js";

// Auth was cut for the demo, so every request acts as this one advisor until real sign-in replaces it.
const DEFAULT_USER: User = {
  userId: requireEnv("DEFAULT_USER_ID"),
  firstName: requireEnv("DEFAULT_USER_FIRST_NAME"),
  lastName: requireEnv("DEFAULT_USER_LAST_NAME"),
  email: requireEnv("DEFAULT_USER_EMAIL"),
  role: "advisor",
};

export function userGetCurrent(): User {
  return DEFAULT_USER;
}
