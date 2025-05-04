import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      include: ["src"],
      clean: true,
      provider: "istanbul",
      reporter: ["lcovonly", "text"],
      reportOnFailure: true,
    },
  },
});
