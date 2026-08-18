import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "plugins/**/*.test.ts", "plugins/**/*.test.tsx", "electron/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@src": resolve(__dirname, "src"),
      "@": resolve(__dirname, "src"),
    },
  },
});
