import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DEV_BRANCH: "true",
      DEFAULT_USER_ID: "00000000-0000-4000-8000-000000000001",
      DEFAULT_USER_FIRST_NAME: "Demo",
      DEFAULT_USER_LAST_NAME: "Advisor",
      DEFAULT_USER_EMAIL: "demo.advisor@example.com",
    },
  },
});
