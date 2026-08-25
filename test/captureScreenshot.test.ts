// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  captureScreenshot,
  type CaptureOptions,
  type ScreenshotContext,
} from "../src/components/captureScreenshot";

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
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  delete (window as unknown as { html2canvas?: unknown }).html2canvas;

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

// Each test gets its own origin so the module-level remote-load cache can't
// leak between them; one test deliberately reuses a URL to assert the caching.
let nextBase = 0;
const freshBase = () => `https://cdn-${++nextBase}.example.com`;

const run = (options: Partial<CaptureOptions> = {}) =>
  captureScreenshot(get, { baseUrl: freshBase(), ...options });

/** Stubs script injection: happy-dom neither fetches nor executes them. */
function stubScriptLoad(outcome: "load" | "error", expose?: unknown) {
  const scripts: HTMLScriptElement[] = [];
  const spy = vi
    .spyOn(document.head, "appendChild")
    .mockImplementation(((node: HTMLScriptElement) => {
      scripts.push(node);
      queueMicrotask(() => {
        if (outcome === "load") {
          (window as unknown as { html2canvas?: unknown }).html2canvas = expose;
          node.onload?.(new Event("load"));
        } else {
          node.onerror?.(new Event("error"));
        }
      });
      return node;
    }) as typeof document.head.appendChild);
  return { scripts, restore: () => spy.mockRestore() };
}

describe("captureScreenshot", () => {
  it("captures the body as a PNG ArrayBuffer", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));

    const buffer = await run();

    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(buffer)).toEqual(new Uint8Array([1, 2, 3]));
    expect(html2canvas).toHaveBeenCalledWith(document.body, expect.anything());
  });

  it("passes embed.js's options through, with scale clamped at 2", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));
    window.devicePixelRatio = 3;

    await run();

    expect(html2canvas.mock.calls[0][1]).toMatchObject({
      useCORS: true,
      allowTaint: false,
      logging: false,
      scale: 2,
    });
  });

  it("excludes the whole widget from the capture", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));

    await run();
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

    await run();
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
    await run();
    expect(html2canvas.mock.calls[0][0]).toBe(document.body);

    modals.mockImplementation((sel: string) =>
      sel === "dialog:modal"
        ? ([ctx.dialogHost, hostModal] as unknown as NodeListOf<Element>)
        : real(sel),
    );

    await run();
    expect(html2canvas.mock.calls[1][0]).toBe(hostModal);

    modals.mockRestore();
  });

  it("falls back to the body where :modal is unsupported", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));
    const modals = vi.spyOn(document, "querySelectorAll").mockImplementation(() => {
      throw new SyntaxError("unsupported pseudo-class");
    });

    await run();

    expect(html2canvas.mock.calls[0][0]).toBe(document.body);
    modals.mockRestore();
  });

  // These strings are surfaced verbatim as toasts by the widget UI and must stay
  // identical to embed.js's — nothing else would catch them drifting apart.
  it("reports a capture failure", async () => {
    html2canvas.mockRejectedValue(new Error("boom"));
    await expect(run()).rejects.toThrow("Screenshot capture failed");
  });

  it("reports a null blob", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(null)));
    await expect(run()).rejects.toThrow("Failed to capture screenshot");
  });

  it("reports a tainted canvas", async () => {
    html2canvas.mockResolvedValue(
      fakeCanvas(() => {
        throw new Error("SecurityError");
      }),
    );
    await expect(run()).rejects.toThrow("Failed to capture screenshot");
  });

  it("reports an unreadable blob", async () => {
    const blob = pngBlob();
    vi.spyOn(blob, "arrayBuffer").mockRejectedValue(new Error("nope"));
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(blob)));
    await expect(run()).rejects.toThrow("Failed to read screenshot");
  });
});

describe("captureScreenshot library loading", () => {
  it("injects no script by default", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));
    const { scripts, restore } = stubScriptLoad("load");

    await run();

    expect(scripts).toHaveLength(0);
    expect(html2canvas).toHaveBeenCalledOnce();
    restore();
  });

  it("loads the server copy when remoteCaptureLibrary is set", async () => {
    const remote = vi.fn().mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));
    const { scripts, restore } = stubScriptLoad("load", remote);
    const baseUrl = freshBase();

    const buffer = await captureScreenshot(get, { baseUrl, remoteLibrary: true });

    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(`${baseUrl}/widget/html2canvas.min.js`);
    expect(remote).toHaveBeenCalledOnce();
    expect(html2canvas).not.toHaveBeenCalled();
    restore();
  });

  it("reuses one script tag across captures on the same origin", async () => {
    const remote = vi.fn().mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));
    const { scripts, restore } = stubScriptLoad("load", remote);
    const baseUrl = freshBase();

    await captureScreenshot(get, { baseUrl, remoteLibrary: true });
    await captureScreenshot(get, { baseUrl, remoteLibrary: true });

    expect(scripts).toHaveLength(1);
    expect(remote).toHaveBeenCalledTimes(2);
    restore();
  });

  it("falls back to the bundled copy when the script fails to load", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { scripts, restore } = stubScriptLoad("error");

    const buffer = await captureScreenshot(get, {
      baseUrl: freshBase(),
      remoteLibrary: true,
    });

    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(scripts).toHaveLength(1);
    expect(html2canvas).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("remoteCaptureLibrary");
    restore();
  });

  it("falls back when the script loads but exposes no global", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { restore } = stubScriptLoad("load", undefined);

    await captureScreenshot(get, { baseUrl: freshBase(), remoteLibrary: true });

    expect(html2canvas).toHaveBeenCalledOnce();
    restore();
  });

  it("retries the remote load after a failure rather than caching it", async () => {
    html2canvas.mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const baseUrl = freshBase();

    const first = stubScriptLoad("error");
    await captureScreenshot(get, { baseUrl, remoteLibrary: true });
    expect(first.scripts).toHaveLength(1);
    first.restore();

    const remote = vi.fn().mockResolvedValue(fakeCanvas((cb) => cb(pngBlob())));
    const second = stubScriptLoad("load", remote);
    await captureScreenshot(get, { baseUrl, remoteLibrary: true });

    expect(second.scripts).toHaveLength(1);
    expect(remote).toHaveBeenCalledOnce();
    second.restore();
  });
});
