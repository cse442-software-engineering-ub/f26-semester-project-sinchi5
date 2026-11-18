import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/frontend/unit/**/*.test.ts"], environment: "node" },
});
