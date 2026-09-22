import { describe, it, expect } from "vitest";
import { getMinimisedStyles, buildIframeSrc } from "../src/utils";
import { PILL_W, POSITION_STYLES, VALID_SIZES } from "../src/constants";

describe("getMinimisedStyles", () => {
  it("docks at the configured corner at pill width", () => {
    const css = getMinimisedStyles(POSITION_STYLES["bottom-right"].container);
    expect(css).toBe("position:fixed; bottom: 80px; right: 20px; width:88px;");
  });

  it("uses the position's own container offsets for every position", () => {
    for (const position of Object.keys(POSITION_STYLES) as (keyof typeof POSITION_STYLES)[]) {
      const container = POSITION_STYLES[position].container;
      const css = getMinimisedStyles(container);
      expect(css, position).toContain(container);
      expect(css, position).toContain(`width:${PILL_W};`);
    }
  });

  it("ignores the size mode — centered/maximise centre themselves, the pill does not", () => {
    // Same output regardless of size, because size is not an input at all.
    const css = getMinimisedStyles(POSITION_STYLES.left.container);
    expect(css).not.toContain("translate(-50%");
    expect(css).not.toContain("95vw");
  });
});

describe("minimised is not a size mode", () => {
  it("stays out of VALID_SIZES, so it can never be restored from storage or config", () => {
    expect(VALID_SIZES).toEqual(["small", "centered", "maximise"]);
    expect(VALID_SIZES).not.toContain("minimised");
  });
});

describe("buildIframeSrc", () => {
  const params = {
    userId: "user_456",
    timestamp: 1234567890,
    anonymous: false,
    position: "bottom-right",
    theme: "dark",
    size: "centered",
  };

  it("sends size so the widget hides the matching button on first paint", () => {
    const qs = new URL(buildIframeSrc("https://feedtide.com", "app_abc", params)).searchParams;
    expect(qs.get("size")).toBe("centered");
  });

  it("keeps sending the params it sent before", () => {
    const qs = new URL(buildIframeSrc("https://feedtide.com/", "app_abc", params)).searchParams;
    expect(qs.get("theme")).toBe("dark");
    expect(qs.get("position")).toBe("bottom-right");
    expect(qs.get("user_id")).toBe("user_456");
    expect(qs.get("anonymous")).toBe("false");
  });
});
