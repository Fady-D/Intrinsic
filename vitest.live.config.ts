import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/live-sec.test.ts"],
    testTimeout: 180000,
    sequence: { concurrent: false },
  },
});
