import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Deliberately node, not a DOM env: the build-output suite asserts that
    // dist/ loads with no `document` in scope. Files needing a DOM opt in with
    // a `@vitest-environment happy-dom` docblock.
    environment: "node",
    environmentOptions: {
      happyDOM: {
        // happy-dom navigates iframes for real, so setting `iframe.src` fires a
        // live request to the widget origin that is then aborted on unmount and
        // logged as a DOMException. The widget tests stub `contentWindow` and
        // dispatch their own `load`, so the real navigation is only noise.
        // (Not the deprecated `disableIframePageLoading`: that logs a
        // NotSupportedError on every iframe connect instead, even about:blank.)
        settings: { navigation: { disableChildFrameNavigation: true } },
      },
    },
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/build-setup.ts"],
  },
});
