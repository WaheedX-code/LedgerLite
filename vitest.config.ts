import { defineConfig } from "vitest/config";
import path from "path";

// Deliverable 8 (Project 2): regression test suite configuration.
// Mirrors tsconfig.json's "@/*" path alias so test files can import route
// handlers and lib modules exactly the way application code does.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
