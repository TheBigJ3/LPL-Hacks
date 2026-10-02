import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import ts from "typescript";
import { defineConfig } from "vitest/config";

const srcPath = (folder: string) => fileURLToPath(new URL(`./src/${folder}`, import.meta.url));

const dotfileTypeScript = {
  name: "dotfile-typescript-tests",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    const filePath = id.split("?", 1)[0];
    if (!filePath.endsWith("/.ts")) return null;

    const result = ts.transpileModule(code, {
      fileName: `${filePath}/logic.ts`,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
      },
    });

    return { code: result.outputText, map: null };
  },
};

export default defineConfig({
  plugins: [dotfileTypeScript, react()],
  resolve: {
    alias: {
      "@api": srcPath("api"),
      "@assets": srcPath("assets"),
      "@components": srcPath("components"),
      "@features": srcPath("features"),
      "@hooks": srcPath("hooks"),
      "@stores": srcPath("stores"),
      "@typings": srcPath("types"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
