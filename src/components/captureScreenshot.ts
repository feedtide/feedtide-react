// Port of embed.js `captureScreenshot`. The screenshot library is bundled and
// lazily imported by default; `remoteCaptureLibrary` opts back into embed.js's
// server-hosted scripts.
//
// This whole module is reached only through WidgetIframe's lazy
// `import("./captureScreenshot")`, so it and the vendored capture editor it
// pulls in form one chunk that is fetched on the first Screenshot click —
// the same bargain as embed.js's pair of loadScript() calls.
//
// embed.js used to hide the widget by mutating the live DOM (display:none on
// the iframe and button, then dialogHost.close() / popoverHost.hidePopover()).
// That was unworkable here: closing the dialog trips WidgetPortal's own
// MutationObserver mid-capture, the invisible widget gets closed by
// EmbeddedWidget's outside-click handler (which then fights the restore via
// WidgetIframe's cssText effect), and focus is stolen from the textarea the
// user was typing in. html2canvas's `ignoreElements` runs against its offscreen
// clone instead, so the live DOM is never touched and none of that can happen.
// Upstream has since moved to `ignoreElements` too.

import { openCaptureEditor } from "./captureEditor";
import { foreignModal } from "../utils";
import type { WidgetPosition } from "../types";

// Hand-written rather than `typeof import("html2canvas")` so no html2canvas
// type can reach the published declarations. See tsdown.config.ts.
type Html2Canvas = (
  element: Element,
  options?: Record<string, unknown>,
) => Promise<HTMLCanvasElement>;

export interface ScreenshotContext {
  /** The widget iframe. Excluded from the capture. */
  iframe: HTMLIFrameElement;
  /** The launcher button. Excluded. Null before it mounts. */
  button: HTMLElement | null;
  /** WidgetPortal's popover host, or null when popover is unsupported. Excluded. */
  popoverHost: HTMLElement | null;
  /** WidgetPortal's dialog host — only exists while escalated. Excluded. */
  dialogHost: HTMLDialogElement | null;
  /** The portal wrapper. Excluded: on the no-popover fallback path it is a
   *  direct body child with no popover host wrapping it. */
  wrapper: HTMLElement | null;
}

export interface CaptureOptions {
  /** Origin the remote scripts would be served from. */
  baseUrl: string;
  /**
   * Prefer `{baseUrl}/widget/*.js` over the bundled copies. Falls back to the
   * bundled copy if a script fails to load.
   */
  remoteLibrary?: boolean;
  /** Widget position — the editor's toolbox docks away from the pill. */
  position: WidgetPosition;
  /** Resolved theme, so the editor's chrome matches the widget. */
  theme: string;
  /** Called once the editor is in the top layer (embed.js restacks the pill). */
  onEditorOpen?: () => void;
}

async function loadBundled(): Promise<Html2Canvas> {
  const mod = await import("html2canvas");
  // Bundlers disagree about whether the callable is the namespace or its
  // default export, depending on how they interop the UMD build.
  const fn = ((mod as unknown as { default?: Html2Canvas }).default ??
    mod) as Html2Canvas;
  if (typeof fn !== "function") throw new Error("not callable");
  return fn;
}

// Keyed by full URL so repeat captures reuse one script tag, and so a second
// origin isn't served a promise for the first one's script.
const remoteLoads = new Map<string, Promise<void>>();

/** Injects `{baseUrl}/widget/{name}`, resolving once it has run. */
function loadRemoteScript(baseUrl: string, name: string): Promise<void> {
  const src = `${baseUrl.replace(/\/$/, "")}/widget/${name}`;
  const cached = remoteLoads.get(src);
  if (cached) return cached;

  const pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(script);
  });

  // Don't let one transient failure poison every later attempt.
  pending.catch(() => remoteLoads.delete(src));
  remoteLoads.set(src, pending);
  return pending;
}

function warnRemote(baseUrl: string, name: string): void {
  console.warn(
    "[FeedTideWidget] remoteCaptureLibrary is set but " +
      `${baseUrl.replace(/\/$/, "")}/widget/${name} could not be loaded — ` +
      "falling back to the bundled copy.",
  );
}

async function loadHtml2Canvas(options: CaptureOptions): Promise<Html2Canvas> {
  if (options.remoteLibrary) {
    try {
      await loadRemoteScript(options.baseUrl, "html2canvas.min.js");
      // The UMD bundle assigns itself to the global; same as embed.js.
      const fn = (window as unknown as { html2canvas?: Html2Canvas }).html2canvas;
      if (typeof fn === "function") return fn;
      throw new Error("not callable");
    } catch {
      warnRemote(options.baseUrl, "html2canvas.min.js");
    }
  }
  return loadBundled();
}

/**
 * Makes the editor available. The bundled path is already loaded — importing
 * this module ran the vendored IIFE — so this only has work to do when
 * `remoteLibrary` asks for the server's copy, which registers the same
 * `window.FeedtideCapture` global the vendored file does.
 */
async function loadEditor(options: CaptureOptions): Promise<void> {
  if (!options.remoteLibrary) return;
  try {
    await loadRemoteScript(options.baseUrl, "capture.js");
  } catch {
    warnRemote(options.baseUrl, "capture.js");
  }
}

/** embed.js's "Preparing screenshot…" card, with its cssText verbatim. */
function progressCard(): HTMLElement {
  const card = document.createElement("div");
  card.style.cssText =
    "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:10px;padding:14px 18px;border-radius:12px;background:#111827;color:#fff;font:600 14px/1 system-ui,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.3);z-index:2147483647;";
  card.innerHTML =
    '<span style="width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:ft-spin .8s linear infinite"></span>Preparing screenshot…';
  return card;
}

/** Hands the canvas to the editor and waits for the user to save or cancel. */
function editCanvas(
  canvas: HTMLCanvasElement,
  options: CaptureOptions,
): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve, reject) => {
    const opened = openCaptureEditor({
      canvas,
      position: options.position,
      theme: options.theme,
      onOpen: options.onEditorOpen,
      onSave: resolve,
      // capture.js calls onCancel() bare for a user cancel, and with a string
      // when its own export failed.
      onCancel: (error) => (error ? reject(new Error(error)) : resolve(null)),
    });
    // Already open, or the vendored script never registered itself. Treat it as
    // a cancel rather than hanging on callbacks that will never fire.
    if (!opened) resolve(null);
  });
}

/**
 * Captures the host page, lets the user annotate it, and resolves with a
 * transferable ArrayBuffer of the result — or `null` if they cancelled.
 *
 * Cancelling is deliberately not an exception: embed.js distinguishes "saved"
 * from "cancelled" from "failed" (its three-valued `done`), and the widget UI
 * stays silent on a cancel. Keeping cancel off the throw path means the caller
 * never has to invent an error message for it.
 *
 * Rejects with an Error whose message is one of embed.js's strings — the widget
 * UI surfaces it verbatim as a toast, so both paths must read alike:
 * "Could not load screenshot tools", "Screenshot capture failed",
 * "Failed to export screenshot", "Failed to read screenshot".
 *
 * `getContext` is a thunk called once, synchronously, before any await:
 * WidgetPortal creates and destroys the dialog host as host-page modals come
 * and go, so a context passed by value could already be stale.
 */
export async function captureScreenshot(
  getContext: () => ScreenshotContext,
  options: CaptureOptions,
): Promise<ArrayBuffer | null> {
  const ctx = getContext();

  const card = progressCard();
  const excluded = new Set<Element>(
    [
      ctx.iframe,
      ctx.button,
      ctx.popoverHost,
      ctx.dialogHost,
      ctx.wrapper,
      card,
    ].filter((el): el is HTMLElement => el != null),
  );
  (ctx.dialogHost ?? ctx.popoverHost ?? document.body).appendChild(card);

  try {
    let html2canvas: Html2Canvas;
    try {
      // Both in flight at once, like embed.js's `pending = 2` barrier.
      [html2canvas] = await Promise.all([
        loadHtml2Canvas(options),
        loadEditor(options),
      ]);
    } catch {
      throw new Error("Could not load screenshot tools");
    }

    // Resolve the capture target before opening anything of our own.
    const modal = foreignModal(ctx.dialogHost);
    const opts: Record<string, unknown> = {
      useCORS: true,
      allowTaint: false,
      logging: false,
      scale: Math.min(window.devicePixelRatio || 1, 2),
      ignoreElements: (el: Element) => excluded.has(el),
    };
    let root: Element = document.body;
    if (modal) {
      root = modal;
    } else {
      // Viewport only: crop the document at the current scroll offset.
      opts.x = window.scrollX;
      opts.y = window.scrollY;
      opts.width = window.innerWidth;
      opts.height = window.innerHeight;
    }

    let canvas: HTMLCanvasElement;
    try {
      canvas = await html2canvas(root, opts);
    } catch {
      throw new Error("Screenshot capture failed");
    }

    // The editor replaces the card, rather than painting over it.
    card.remove();
    const blob = await editCanvas(canvas, options);
    if (!blob) return null;

    try {
      return await blob.arrayBuffer();
    } catch {
      throw new Error("Failed to read screenshot");
    }
  } finally {
    // Safe after an earlier remove(); no path may leak the card.
    card.remove();
  }
}
