// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
// Sets IS_REACT_ACT_ENVIRONMENT before React loads — import it first.
import { mount, type Harness } from "./mountWidget";

// Drives `{ type: "captureScreenshot" }` through WidgetIframe's message
// listener — the seam nothing covered before. The capture itself is mocked; what
// is under test is the wiring around it: target routing, the pill, and the
// three-way save / cancel / fail reply.
//
// Mirrors the contract names in packages/api's widget-output.test.ts.

const capture = vi.fn();
vi.mock("../src/components/captureScreenshot", () => ({
  captureScreenshot: (...args: unknown[]) => capture(...args),
}));

/** Resolves/rejects the capture on demand, so mid-flight state is observable. */
function deferred() {
  let settle!: (v: ArrayBuffer | null) => void;
  let fail!: (e: Error) => void;
  const promise = new Promise<ArrayBuffer | null>((res, rej) => {
    settle = res;
    fail = rej;
  });
  capture.mockReturnValue(promise);
  return { settle, fail, promise };
}

const png = () => new Uint8Array([1, 2, 3]).buffer;

const replies = (h: Harness) =>
  h.posts.filter(
    (p) => p.type === "screenshotCaptured" || p.type === "screenshotFailed",
  );

async function open(): Promise<Harness> {
  const h = await mount();
  await h.click(h.button);
  h.posts.length = 0;
  return h;
}

beforeEach(() => {
  capture.mockReset();
  capture.mockResolvedValue(png());
});

describe("screenshot host flow", () => {
  it("round-trips the screenshot target instead of a global flag", async () => {
    for (const [sent, expected] of [
      ["feature", "feature"],
      ["main", "main"],
      [undefined, "main"],
      ["nonsense", "main"],
    ] as const) {
      const h = await open();
      await h.fromIframe({ type: "captureScreenshot", target: sent });
      await h.flush();

      const [reply] = replies(h);
      expect(reply?.type, `target=${sent}`).toBe("screenshotCaptured");
      expect(reply.target, `target=${sent}`).toBe(expected);
    }
  });

  it("keeps the widget as a pill during capture, then restores it", async () => {
    const h = await open();
    const d = deferred();

    await h.fromIframe({ type: "captureScreenshot", target: "main" });
    expect(h.width()).toBe("88px");
    expect(
      h.posts.filter((p) => p.type === "minimisedChanged").map((p) => p.minimised),
    ).toContain(true);

    d.settle(png());
    await h.flush();

    expect(h.width()).not.toBe("88px");
    expect(
      h.posts.filter((p) => p.type === "minimisedChanged").map((p) => p.minimised),
    ).toContain(false);
  });

  it("does not re-pill a widget the user had already minimised", async () => {
    const h = await open();
    await h.fromIframe({ type: "setMinimised", minimised: true });
    h.posts.length = 0;
    const d = deferred();

    await h.fromIframe({ type: "captureScreenshot", target: "main" });
    d.settle(png());
    await h.flush();

    // It must stay a pill: restoring here would undo the user's own choice.
    expect(h.width()).toBe("88px");
  });

  it("stays silent when a screenshot is cancelled", async () => {
    const h = await open();
    capture.mockResolvedValue(null);

    await h.fromIframe({ type: "captureScreenshot", target: "feature" });
    await h.flush();

    const [reply] = replies(h);
    // The message still goes out so the wire protocol matches embed.js; the
    // widget UI's `if (d.error)` is what keeps it quiet.
    expect(reply.type).toBe("screenshotFailed");
    expect(reply.target).toBe("feature");
    expect(reply.error).toBeFalsy();
  });

  it("passes a real failure's message through verbatim", async () => {
    const h = await open();
    capture.mockRejectedValue(new Error("Could not load screenshot tools"));

    await h.fromIframe({ type: "captureScreenshot", target: "main" });
    await h.flush();

    const [reply] = replies(h);
    expect(reply.type).toBe("screenshotFailed");
    expect(reply.error).toBe("Could not load screenshot tools");
    expect(reply.target).toBe("main");
  });

  it("drops a duplicate request while one is in flight", async () => {
    const h = await open();
    const d = deferred();

    await h.fromIframe({ type: "captureScreenshot", target: "main" });
    await h.fromIframe({ type: "captureScreenshot", target: "feature" });
    d.settle(png());
    await h.flush();

    expect(capture).toHaveBeenCalledOnce();
    expect(replies(h)).toHaveLength(1);
  });

  it("hands the capture the widget's position and theme", async () => {
    const h = await open();
    await h.fromIframe({ type: "captureScreenshot", target: "main" });
    await h.flush();

    expect(capture.mock.calls[0][1]).toMatchObject({
      position: "bottom-right",
      theme: expect.any(String),
    });
  });

  it("never navigates the iframe across a capture", async () => {
    // A reload mid-capture would discard whatever the user had typed — the same
    // invariant the size-change test guards, across the whole screenshot flow.
    const h = await open();
    const before = h.iframe.getAttribute("src");
    const d = deferred();

    await h.fromIframe({ type: "captureScreenshot", target: "main" });
    expect(h.iframe.getAttribute("src")).toBe(before);

    d.settle(png());
    await h.flush();

    expect(h.iframe.getAttribute("src")).toBe(before);
  });
});
