import { describe, it, expect } from "vitest";
import { buildInitConfig } from "../src/components/RemoteWidget";
import type { FeedTideConfig } from "../src/types";

const base: FeedTideConfig = {
  appId: "app_abc123",
  userId: "user_456",
  signature: "sig",
  userEmail: "a@b.c",
  userName: "A B",
  baseUrl: "https://feedtide.com",
  timestamp: 1234567890,
  theme: "dark",
};

describe("buildInitConfig", () => {
  it("hands embed.js the bundled loader by default", () => {
    expect(buildInitConfig(base, "bottom-right").capture_loader).toBeTypeOf("function");
  });

  it("omits the loader when remoteCaptureLibrary is set, leaving embed.js to fetch its own", () => {
    const cfg = buildInitConfig({ ...base, remoteCaptureLibrary: true }, "bottom-right");
    expect(cfg).not.toHaveProperty("capture_loader");
  });

  it("maps the rest of the config to embed.js's snake_case keys either way", () => {
    for (const remoteCaptureLibrary of [false, true]) {
      expect(buildInitConfig({ ...base, remoteCaptureLibrary }, "top-left")).toMatchObject({
        app_id: "app_abc123",
        user_id: "user_456",
        signature: "sig",
        timestamp: 1234567890,
        position: "top-left",
        theme: "dark",
        user_email: "a@b.c",
        user_name: "A B",
      });
    }
  });

  it("reads the theme preset out of a theme object", () => {
    expect(buildInitConfig({ ...base, theme: { preset: "light" } }, "bottom").theme).toBe("light");
  });
});
