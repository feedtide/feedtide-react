// Port of embed.js `captureScreenshot`, minus the remote script tag.
//
// embed.js hides the widget by mutating the live DOM (display:none on the
// iframe and button, then dialogHost.close() / popoverHost.hidePopover()).
// That is unworkable here: closing the dialog trips WidgetPortal's own
// MutationObserver mid-capture, the invisible widget gets closed by
// EmbeddedWidget's outside-click handler (which then fights the restore via
// WidgetIframe's cssText effect), and focus is stolen from the textarea the
// user was typing in. html2canvas's `ignoreElements` runs against its offscreen
// clone instead, so the live DOM is never touched and none of that can happen.

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

/**
 * Captures the host page as a PNG, resolving with a transferable ArrayBuffer.
 *
 * Rejects with an Error whose message is one of embed.js's four strings — the
 * widget UI surfaces it verbatim as a toast, so both paths must read alike.
 *
 * `getContext` is a thunk called once, synchronously, before any await:
 * WidgetPortal creates and destroys the dialog host as host-page modals come
 * and go, so a context passed by value could already be stale.
 */
export async function captureScreenshot(
  getContext: () => ScreenshotContext,
): Promise<ArrayBuffer> {
  const ctx = getContext();
  const excluded = new Set<Element>(
    [ctx.iframe, ctx.button, ctx.popoverHost, ctx.dialogHost, ctx.wrapper].filter(
      (el): el is HTMLElement => el != null,
    ),
  );

  let html2canvas: Html2Canvas;
  try {
    const mod = await import("html2canvas");
    // Bundlers disagree about whether the callable is the namespace or its
    // default export, depending on how they interop the UMD build.
    html2canvas = ((mod as unknown as { default?: Html2Canvas }).default ??
      mod) as Html2Canvas;
    if (typeof html2canvas !== "function") throw new Error("not callable");
  } catch {
    throw new Error("Could not load screenshot library");
  }

  // Same intent as embed.js, but it closes its own dialog host first so
  // `dialog:modal` can never match it. We leave ours open, so skip it by hand.
  let root: Element = document.body;
  try {
    const modal = Array.from(
      document.querySelectorAll<HTMLDialogElement>("dialog:modal"),
    ).find((d) => d !== ctx.dialogHost);
    if (modal) root = modal;
  } catch { /* :modal unsupported */ }

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(root, {
      useCORS: true,
      allowTaint: false,
      logging: false,
      scale: Math.min(window.devicePixelRatio || 1, 2),
      ignoreElements: (el: Element) => excluded.has(el),
    });
  } catch {
    throw new Error("Screenshot capture failed");
  }

  let blob: Blob | null;
  try {
    // A tainted canvas makes toBlob throw SecurityError rather than pass null.
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
  } catch {
    throw new Error("Failed to capture screenshot");
  }
  if (!blob) throw new Error("Failed to capture screenshot");

  try {
    return await blob.arrayBuffer();
  } catch {
    throw new Error("Failed to read screenshot");
  }
}
