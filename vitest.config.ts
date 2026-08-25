import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Deliberately node, not a DOM env: the build-output suite asserts that
    // dist/ loads with no `document` in scope. Files needing a DOM opt in with
    // a `@vitest-environment happy-dom` docblock.
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/build-setup.ts"],
  },
});
