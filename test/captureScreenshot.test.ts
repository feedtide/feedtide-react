// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  captureScreenshot,
  type CaptureOptions,
  type ScreenshotContext,
} from "../src/components/captureScreenshot";
import { openCaptureEditor } from "../src/components/captureEditor";

const html2canvas = vi.fn();
vi.mock("html2canvas", () => ({ default: (...args: unknown[]) => html2canvas(...args) }));

// The editor itself is characterised in test/captureEditor.test.ts; here it is
// a seam, so each test can drive save / cancel / export-failure directly.
vi.mock("../src/components/captureEditor", () => ({
  openCaptureEditor: vi.fn(),
}));
const editor = vi.mocked(openCaptureEditor);

/** Makes the mocked editor save `blob` (default) or cancel. */
function editorSaves(blob: Blob | null = pngBlob()) {
  editor.mockImplementation((o) => {
    o.onOpen?.();
    if (blob) o.onSave(blob);
    else o.onCancel();
    return true;
  });
}

/** A stand-in for the canvas html2canvas resolves with. */
const fakeCanvas = () => ({}) as unknown as HTMLCanvasElement;

const pngBlob = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

let ctx: ScreenshotContext;

beforeEach(() => {
  html2canvas.mockReset();
  editor.mockReset();
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
  editorSaves();
});

const get = () => ctx;

// Each test gets its own origin so the module-level remote-load cache can't
// leak between them; one test deliberately reuses a URL to assert the caching.
let nextBase = 0;
const freshBase = () => `https://cdn-${++nextBase}.example.com`;

const base: Omit<CaptureOptions, "baseUrl"> = {
  position: "bottom-right",
  theme: "light",
};

const run = (options: Partial<CaptureOptions> = {}) =>
  captureScreenshot(get, { baseUrl: freshBase(), ...base, ...options });

/**
 * happy-dom parses `:modal` but always reports false, so foreignModal would
 * never find anything. Treat an `open` attribute as modal — the filtering is
 * what's under test, not the selector engine.
 */
function stubModalMatching() {
  const real = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (
    this: Element,
    sel: string,
  ) {
    if (sel === ":modal") return this.hasAttribute("open");
    return real.call(this, sel);
  });
}

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
  const srcs = () => scripts.map((s) => s.src);
  return { scripts, srcs, restore: () => spy.mockRestore() };
}

describe("captureScreenshot", () => {
  it("captures the viewport and returns the annotated PNG as an ArrayBuffer", async () => {
    html2canvas.mockResolvedValue(fakeCanvas());

    const buffer = await run();

    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(buffer!)).toEqual(new Uint8Array([1, 2, 3]));
    expect(html2canvas).toHaveBeenCalledWith(document.body, expect.anything());
  });

  it("hands the captured canvas to the editor, not straight to the caller", async () => {
    const canvas = fakeCanvas();
    html2canvas.mockResolvedValue(canvas);

    await run({ position: "top-left", theme: "dark" });

    expect(editor).toHaveBeenCalledOnce();
    expect(editor.mock.calls[0][0]).toMatchObject({
      canvas,
      position: "top-left",
      theme: "dark",
    });
  });

  it("resolves null when the user cancels the editor, without throwing", async () => {
    html2canvas.mockResolvedValue(fakeCanvas());
    editorSaves(null);

    // Cancel is deliberately not an exception: the caller must be able to tell
    // it apart from a failure so the widget UI can stay silent.
    await expect(run()).resolves.toBeNull();
  });

  it("resolves null rather than hanging when an editor is already open", async () => {
    html2canvas.mockResolvedValue(fakeCanvas());
    editor.mockReturnValue(false);

    await expect(run()).resolves.toBeNull();
  });

  it("crops to the viewport at the current scroll offset", async () => {
    html2canvas.mockResolvedValue(fakeCanvas());
    window.scrollX = 40;
    window.scrollY = 120;

    await run();

    expect(html2canvas.mock.calls[0][0]).toBe(document.body);
    expect(html2canvas.mock.calls[0][1]).toMatchObject({
      x: 40,
      y: 120,
      width: window.innerWidth,
      height: window.innerHeight,
    });
  });

  it("passes embed.js's options through, with scale clamped at 2", async () => {
    html2canvas.mockResolvedValue(fakeCanvas());
    window.devicePixelRatio = 3;

    await run();

    expect(html2canvas.mock.calls[0][1]).toMatchObject({
      useCORS: true,
      allowTaint: false,
      logging: false,
      scale: 2,
    });
  });

  it("excludes the whole widget, and the progress card, from the capture", async () => {
    html2canvas.mockResolvedValue(fakeCanvas());

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
    html2canvas.mockResolvedValue(fakeCanvas());
    ctx = { ...ctx, button: null, popoverHost: null, dialogHost: null, wrapper: null };

    await run();
    const { ignoreElements } = html2canvas.mock.calls[0][1] as {
      ignoreElements: (el: Element) => boolean;
    };

    expect(ignoreElements(ctx.iframe)).toBe(true);
    expect(ignoreElements(document.createElement("p"))).toBe(false);
  });

  describe("progress card", () => {
    // The card carries no id (embed.js's doesn't either), while every portal
    // host does — which matters, because textContent is recursive and a host
    // wrapping the card would otherwise match first and win on document order.
    const card = () =>
      Array.from(document.querySelectorAll("div")).find(
        (d) => !d.id && d.textContent?.includes("Preparing screenshot"),
      );

    // The card is removed before these assertions run, so record its parent at
    // call time — reading `.parentElement` afterwards would always see null.
    // Assert outside the mocks too: a failure thrown inside the html2canvas
    // stub would be swallowed and resurface as "Screenshot capture failed".
    const hostDuringCapture = () => {
      let host: Element | null | undefined;
      html2canvas.mockImplementation(() => {
        host = card()?.parentElement;
        return Promise.resolve(fakeCanvas());
      });
      return () => host;
    };

    it("shows in the top-layer host while capturing, then makes way for the editor", async () => {
      const host = hostDuringCapture();
      let cardDuringEditor: HTMLElement | undefined;
      editor.mockImplementation((o) => {
        cardDuringEditor = card();
        o.onSave(pngBlob());
        return true;
      });

      await run();

      expect(host()).toBe(ctx.dialogHost);
      // The editor replaces the card rather than painting over it.
      expect(cardDuringEditor).toBeUndefined();
      expect(card()).toBeUndefined();
    });

    it("falls back to the popover host, then the body", async () => {
      ctx = { ...ctx, dialogHost: null };
      const withPopover = hostDuringCapture();
      await run();
      expect(withPopover()).toBe(ctx.popoverHost);

      ctx = { ...ctx, popoverHost: null };
      const withNeither = hostDuringCapture();
      await run();
      expect(withNeither()).toBe(document.body);
    });

    it("is removed even when the capture fails", async () => {
      html2canvas.mockRejectedValue(new Error("boom"));
      await expect(run()).rejects.toThrow();
      expect(card()).toBeUndefined();
    });
  });

  describe("capture root", () => {
    it("prefers a host-page modal over the body, and does not crop to the viewport", async () => {
      html2canvas.mockResolvedValue(fakeCanvas());
      stubModalMatching();
      const hostModal = document.createElement("dialog");
      hostModal.setAttribute("open", "");
      document.body.appendChild(hostModal);

      await run();

      expect(html2canvas.mock.calls[0][0]).toBe(hostModal);
      expect(html2canvas.mock.calls[0][1]).not.toHaveProperty("x");
      expect(html2canvas.mock.calls[0][1]).not.toHaveProperty("width");
    });

    it("never treats our own dialog host as a host modal", async () => {
      html2canvas.mockResolvedValue(fakeCanvas());
      stubModalMatching();
      ctx.dialogHost!.setAttribute("open", "");

      await run();

      expect(html2canvas.mock.calls[0][0]).toBe(document.body);
    });

    it("never treats the capture editor as a host modal", async () => {
      // Without this, opening the editor would read as a host-page modal:
      // WidgetPortal would escalate, re-parenting and so reloading the iframe
      // mid-capture and destroying whatever the user had typed.
      html2canvas.mockResolvedValue(fakeCanvas());
      stubModalMatching();
      const own = document.createElement("dialog");
      own.id = "feedtide-capture";
      own.setAttribute("open", "");
      document.body.appendChild(own);

      await run();

      expect(html2canvas.mock.calls[0][0]).toBe(document.body);
    });

    it("falls back to the body where :modal is unsupported", async () => {
      html2canvas.mockResolvedValue(fakeCanvas());
      vi.spyOn(Element.prototype, "matches").mockImplementation(() => {
        throw new SyntaxError("unsupported pseudo-class");
      });

      await run();

      expect(html2canvas.mock.calls[0][0]).toBe(document.body);
    });
  });

  // These strings are surfaced verbatim as toasts by the widget UI and must stay
  // identical to embed.js's — nothing else would catch them drifting apart.
  describe("error strings", () => {
    it("reports a capture failure", async () => {
      html2canvas.mockRejectedValue(new Error("boom"));
      await expect(run()).rejects.toThrow("Screenshot capture failed");
    });

    it("reports an editor export failure", async () => {
      html2canvas.mockResolvedValue(fakeCanvas());
      editor.mockImplementation((o) => {
        o.onCancel("Failed to export screenshot");
        return true;
      });
      await expect(run()).rejects.toThrow("Failed to export screenshot");
    });

    it("reports an unreadable blob", async () => {
      const blob = pngBlob();
      vi.spyOn(blob, "arrayBuffer").mockRejectedValue(new Error("nope"));
      html2canvas.mockResolvedValue(fakeCanvas());
      editorSaves(blob);
      await expect(run()).rejects.toThrow("Failed to read screenshot");
    });
  });
});

describe("captureScreenshot library loading", () => {
  it("injects no script by default", async () => {
    html2canvas.mockResolvedValue(fakeCanvas());
    const { scripts, restore } = stubScriptLoad("load");

    await run();

    expect(scripts).toHaveLength(0);
    expect(html2canvas).toHaveBeenCalledOnce();
    restore();
  });

  it("loads both server copies when remoteCaptureLibrary is set", async () => {
    const remote = vi.fn().mockResolvedValue(fakeCanvas());
    const { srcs, restore } = stubScriptLoad("load", remote);
    const baseUrl = freshBase();

    const buffer = await captureScreenshot(get, { baseUrl, ...base, remoteLibrary: true });

    expect(buffer).toBeInstanceOf(ArrayBuffer);
    // Both, like embed.js's pending = 2 barrier.
    expect(srcs()).toEqual([
      `${baseUrl}/widget/html2canvas.min.js`,
      `${baseUrl}/widget/capture.js`,
    ]);
    expect(remote).toHaveBeenCalledOnce();
    expect(html2canvas).not.toHaveBeenCalled();
    restore();
  });

  it("reuses script tags across captures on the same origin", async () => {
    const remote = vi.fn().mockResolvedValue(fakeCanvas());
    const { scripts, restore } = stubScriptLoad("load", remote);
    const baseUrl = freshBase();

    await captureScreenshot(get, { baseUrl, ...base, remoteLibrary: true });
    await captureScreenshot(get, { baseUrl, ...base, remoteLibrary: true });

    expect(scripts).toHaveLength(2);
    expect(remote).toHaveBeenCalledTimes(2);
    restore();
  });

  it("falls back to the bundled copies when the scripts fail to load", async () => {
    html2canvas.mockResolvedValue(fakeCanvas());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { scripts, restore } = stubScriptLoad("error");

    const buffer = await captureScreenshot(get, {
      baseUrl: freshBase(),
      ...base,
      remoteLibrary: true,
    });

    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(scripts).toHaveLength(2);
    expect(html2canvas).toHaveBeenCalledOnce();
    // The bundled editor is already loaded, so a failed capture.js is survivable.
    expect(editor).toHaveBeenCalledOnce();
    expect(warn.mock.calls.flat().join(" ")).toContain("remoteCaptureLibrary");
    restore();
  });

  it("falls back when the script loads but exposes no global", async () => {
    html2canvas.mockResolvedValue(fakeCanvas());
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { restore } = stubScriptLoad("load", undefined);

    await captureScreenshot(get, { baseUrl: freshBase(), ...base, remoteLibrary: true });

    expect(html2canvas).toHaveBeenCalledOnce();
    restore();
  });

  it("retries the remote load after a failure rather than caching it", async () => {
    html2canvas.mockResolvedValue(fakeCanvas());
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const baseUrl = freshBase();

    const first = stubScriptLoad("error");
    await captureScreenshot(get, { baseUrl, ...base, remoteLibrary: true });
    expect(first.scripts).toHaveLength(2);
    first.restore();

    const remote = vi.fn().mockResolvedValue(fakeCanvas());
    const second = stubScriptLoad("load", remote);
    await captureScreenshot(get, { baseUrl, ...base, remoteLibrary: true });

    expect(second.scripts).toHaveLength(2);
    expect(remote).toHaveBeenCalledOnce();
    second.restore();
  });

  it("reports both loaders failing as one error", async () => {
    html2canvas.mockResolvedValue(fakeCanvas());
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // Bundled html2canvas is unusable too, so there is no fallback left.
    const mod = await import("html2canvas");
    vi.spyOn(mod, "default", "get").mockReturnValue(undefined as never);

    await expect(run()).rejects.toThrow("Could not load screenshot tools");
  });
});
