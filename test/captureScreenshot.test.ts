// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { captureScreenshot, type ScreenshotContext } from "../src/components/captureScreenshot";

const html2canvas = vi.fn();
vi.mock("html2canvas", () => ({ default: (...args: unknown[]) => html2canvas(...args) }));

/** A stand-in for the canvas html2canvas resolves with. */
function fakeCanvas(toBlob: HTMLCanvasElement["toBlob"]) {
  return { toBlob } as unknown as HTMLCanvasElement;
}

const pngBlob = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

let ctx: ScreenshotContext;

beforeEach(() => {
  html2canvas.mockReset();
  document.body.innerHTML = "";

  const mk = <T extends HTMLElement>(tag: string, id: string): T => {
    const el = document.createElement(tag) as T;
    el.id = id;
    document.body.appendChild(el);
    return el;
  };

  ctx = {
    iframe: mk<HTMLIFrameElement>("iframe", "feedback-widget-iframe"),
    button: mk("button", "feedback-widget-button"),
    popoverHost: mk("div", "feedtide-popover-host"),
    dialogHost: mk<HTMLDialogElement>("dialog", "feedtide-dialog-host"),
    wrapper: mk("div", "feedtide-portal-wrapper"),
  };
});

const get = () => ctx;

describe("captureScreenshot", () => {
  it("captures the body as a PNG ArrayBuffer", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));

    const buffer = await captureScreenshot(get);

    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(buffer)).toEqual(new Uint8Array([1, 2, 3]));
    expect(html2canvas).toHaveBeenCalledWith(document.body, expect.anything());
  });

  it("passes embed.js's options through, with scale clamped at 2", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));
    window.devicePixelRatio = 3;

    await captureScreenshot(get);

    expect(html2canvas.mock.calls[0][1]).toMatchObject({
      useCORS: true,
      allowTaint: false,
      logging: false,
      scale: 2,
    });
  });

  it("excludes the whole widget from the capture", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));

    await captureScreenshot(get);
    const { ignoreElements } = html2canvas.mock.calls[0][1] as {
      ignoreElements: (el: Element) => boolean;
    };

    for (const el of [ctx.iframe, ctx.button, ctx.popoverHost, ctx.dialogHost, ctx.wrapper]) {
      expect(ignoreElements(el!), `${el!.id} should be excluded`).toBe(true);
    }
    expect(ignoreElements(document.createElement("p"))).toBe(false);
  });

  it("tolerates a context with no button or hosts yet", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));
    ctx = { ...ctx, button: null, popoverHost: null, dialogHost: null, wrapper: null };

    await captureScreenshot(get);
    const { ignoreElements } = html2canvas.mock.calls[0][1] as {
      ignoreElements: (el: Element) => boolean;
    };

    expect(ignoreElements(ctx.iframe)).toBe(true);
    expect(ignoreElements(document.createElement("p"))).toBe(false);
  });

  it("captures a host-page modal in preference to the body, but never our own", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));
    const hostModal = document.createElement("dialog");
    document.body.appendChild(hostModal);

    // happy-dom doesn't implement the :modal pseudo-class, so drive the query
    // directly — the filtering is what's under test, not the selector engine.
    const real = document.querySelectorAll.bind(document);
    const modals = vi
      .spyOn(document, "querySelectorAll")
      .mockImplementation((sel: string) =>
        sel === "dialog:modal"
          ? ([ctx.dialogHost] as unknown as NodeListOf<Element>)
          : real(sel),
      );

    // Ours is the only modal: fall back to the body rather than screenshotting
    // the widget's own top-layer host.
    await captureScreenshot(get);
    expect(html2canvas.mock.calls[0][0]).toBe(document.body);

    modals.mockImplementation((sel: string) =>
      sel === "dialog:modal"
        ? ([ctx.dialogHost, hostModal] as unknown as NodeListOf<Element>)
        : real(sel),
    );

    await captureScreenshot(get);
    expect(html2canvas.mock.calls[1][0]).toBe(hostModal);

    modals.mockRestore();
  });

  it("falls back to the body where :modal is unsupported", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));
    const modals = vi.spyOn(document, "querySelectorAll").mockImplementation(() => {
      throw new SyntaxError("unsupported pseudo-class");
    });

    await captureScreenshot(get);

    expect(html2canvas.mock.calls[0][0]).toBe(document.body);
    modals.mockRestore();
  });

  // These strings are surfaced verbatim as toasts by the widget UI and must stay
  // identical to embed.js's — nothing else would catch them drifting apart.
  it("reports a capture failure", async () => {
    html2canvas.mockRejectedValue(new Error("boom"));
    await expect(captureScreenshot(get)).rejects.toThrow("Screenshot capture failed");
  });

  it("reports a null blob", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(null)));
    await expect(captureScreenshot(get)).rejects.toThrow("Failed to capture screenshot");
  });

  it("reports a tainted canvas", async () => {
    html2canvas.mockResolvedValue(
      fakeCanvas(() => {
        throw new Error("SecurityError");
      }),
    );
    await expect(captureScreenshot(get)).rejects.toThrow("Failed to capture screenshot");
  });

  it("reports an unreadable blob", async () => {
    const blob = pngBlob();
    vi.spyOn(blob, "arrayBuffer").mockRejectedValue(new Error("nope"));
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(blob)));
    await expect(captureScreenshot(get)).rejects.toThrow("Failed to read screenshot");
  });
});
