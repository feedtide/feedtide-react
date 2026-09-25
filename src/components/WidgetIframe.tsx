import { useEffect, useRef, useCallback } from "react";
import { PILL_H, PILL_R, POSITION_STYLES } from "../constants";
import { getMinimisedStyles, getSizeStyles, isMobile } from "../utils";
import { getPortalHosts, restackHost } from "./WidgetPortal";
import type { WidgetPosition, WidgetSize } from "../types";

interface WidgetIframeProps {
  src: string;
  baseUrl: string;
  position: WidgetPosition;
  size: WidgetSize;
  isOpen: boolean;
  isPinned: boolean;
  isMinimised: boolean;
  theme: string;
  onClose: () => void;
  onSetSize: (size: WidgetSize) => void;
  onSetPinned: (pinned: boolean) => void;
  onSetTheme: (theme: string) => void;
  onSetMinimised: (minimised: boolean) => void;
  remoteCaptureLibrary?: boolean;
}

export function WidgetIframe({
  src,
  baseUrl,
  position,
  size,
  isOpen,
  isPinned,
  isMinimised,
  theme,
  onClose,
  onSetSize,
  onSetPinned,
  onSetTheme,
  onSetMinimised,
  remoteCaptureLibrary,
}: WidgetIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const capturingRef = useRef(false);
  const origin = baseUrl.replace(/\/$/, "");

  // Read through a ref inside the capture flow: putting `isMinimised` in
  // handleCaptureScreenshot's deps would re-register the message listener on
  // every minimise toggle — including the one the capture itself performs.
  const isMinimisedRef = useRef(isMinimised);
  isMinimisedRef.current = isMinimised;

  // A new iframe starts on about:blank, which inherits the *parent's* origin, so
  // posting with the widget origin as targetOrigin throws and the message is lost.
  // Effects fire on React's schedule, not the iframe's, so every send is routed
  // through post() and held until the widget URL has actually committed. handleLoad
  // re-sends the full state immediately after, so nothing skipped here is dropped.
  const loadedRef = useRef(false);
  useEffect(() => {
    loadedRef.current = false; // src changed → navigating again
  }, [src]);

  const post = useCallback(
    (message: Record<string, unknown>, transfer?: Transferable[]) => {
      const win = iframeRef.current?.contentWindow;
      if (!win || !loadedRef.current) return false;
      try {
        win.postMessage(message, origin, transfer);
        return true;
      } catch {
        // Lost a navigation race; handleLoad will resend the full state.
        return false;
      }
    },
    [origin],
  );

  // Apply cssText directly via ref (embed.js uses cssText strings, not React style objects)
  useEffect(() => {
    if (!iframeRef.current) return;
    const mobile = isMobile();
    const min = isMinimised;
    const posStyles = POSITION_STYLES[position];
    const baseCSS = min
      ? getMinimisedStyles(posStyles.container)
      : getSizeStyles(size, position, posStyles.container);

    const height = min
      ? PILL_H
      : mobile ? "100vh" : size === "small" ? "500px" : size === "centered" ? "80vh" : "95vh";
    const maxWidth = mobile && !min ? "100vw" : "calc(100vw - 40px)";
    const borderRadius = min ? PILL_R : mobile ? "0" : "16px";
    const boxShadow = mobile && !min ? "none" : "0 4px 24px rgba(0, 0, 0, 0.12)";

    iframeRef.current.style.cssText =
      baseCSS +
      `height: ${height};` +
      `max-width: ${maxWidth};` +
      "max-height: 100vh;" +
      "border: none;" +
      `border-radius: ${borderRadius};` +
      `box-shadow: ${boxShadow};` +
      "z-index: 2147483647;" +
      `display: ${isOpen ? "block" : "none"};` +
      "background: #ffffff;" +
      "transition: width 0.3s ease, height 0.3s ease, top 0.3s ease, left 0.3s ease, right 0.3s ease, bottom 0.3s ease, transform 0.3s ease, min-width 0.3s ease, min-height 0.3s ease;";
  }, [position, size, isOpen, isMinimised]);

  // Send initial messages to iframe on load
  const handleLoad = useCallback(() => {
    loadedRef.current = true;
    post({ type: "sizeChanged", size });
    post({ type: "pinnedChanged", pinned: isPinned });
    post({ type: "themeChanged", theme });
    post({ type: "minimisedChanged", minimised: isMinimised });
  }, [size, isPinned, theme, isMinimised, post]);

  // Send refresh + size on open
  useEffect(() => {
    if (isOpen) {
      post({ type: "refreshFeatures" });
      post({ type: "sizeChanged", size });
    }
  }, [isOpen, size, post]);

  // Level-triggered, like sizeChanged: re-asserted on every open as well as on
  // every change, so a host/iframe desync repairs itself on the next open rather
  // than persisting. Edge-triggering this on isMinimised alone is not enough —
  // the iframe owns a second copy of the flag and only clears it when told, so a
  // close that produces no state transition leaves it minimised indefinitely.
  //
  // Deliberately kept out of the refreshFeatures effect above: adding isMinimised
  // to that effect's deps would re-fetch the feature list on every minimise toggle.
  useEffect(() => {
    post({ type: "minimisedChanged", minimised: isMinimised });
  }, [isOpen, isMinimised, post]);

  // The whole capture flow — html2canvas and the vendored annotation editor —
  // is pulled in lazily here (never at module scope) so consumers that don't
  // screenshot never download it, and SSR never touches it.
  const handleCaptureScreenshot = useCallback(
    async (target: "main" | "feature") => {
      // embed.js's `_capturing`: drop duplicate requests rather than replying
      // screenshotFailed, which would toast an error the user didn't earn.
      if (capturingRef.current) return;
      const iframe = iframeRef.current;
      if (!iframe) return;
      capturingRef.current = true;

      // Collapse to the pill for the duration, as embed.js does, so the user can
      // see where their feedback went while the editor is up. Mobile has no
      // restore control on the pill and is full-screen anyway, so the card and
      // editor simply paint over it there.
      const pill = !isMobile() && !isMinimisedRef.current;
      if (pill) onSetMinimised(true);

      try {
        const { captureScreenshot } = await import("./captureScreenshot").catch(
          () => {
            throw new Error("Could not load screenshot tools");
          },
        );
        const buffer = await captureScreenshot(
          () => ({
            iframe,
            button: document.getElementById("feedback-widget-button"),
            ...getPortalHosts(),
          }),
          {
            // baseUrl, not `origin`: the loader strips the trailing slash itself.
            baseUrl,
            remoteLibrary: remoteCaptureLibrary,
            position,
            theme,
            // Lift the pill above the editor. Only when there is a pill: on
            // mobile the host holds the full-screen iframe, which would cover it.
            onEditorOpen: () => {
              if (pill) restackHost();
            },
          },
        );
        if (buffer) {
          // post() re-reads contentWindow: an unmount mid-capture should be a
          // no-op, not a post into a dead window. Transferring detaches
          // `buffer` — don't reuse it.
          post({ type: "screenshotCaptured", data: buffer, target }, [buffer]);
        } else {
          // Cancelled. The message still goes out so the wire protocol matches
          // embed.js; the widget UI's `if (d.error)` is what keeps it silent.
          post({ type: "screenshotFailed", target, error: null });
        }
      } catch (err) {
        post({
          type: "screenshotFailed",
          target,
          error: err instanceof Error ? err.message : "Screenshot capture failed",
        });
      } finally {
        if (pill) onSetMinimised(false);
        capturingRef.current = false;
      }
    },
    [post, baseUrl, remoteCaptureLibrary, position, theme, onSetMinimised],
  );

  // Listen for postMessages from iframe
  useEffect(() => {
    function handler(event: MessageEvent) {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow) return;
      if (event.origin !== origin || event.source !== iframeWindow) return;
      const data = event.data;
      if (!data?.type) return;

      switch (data.type) {
        case "closeWidget":
          onClose();
          break;
        case "setSizeMode":
          onSetSize(data.size);
          break;
        case "setPinned":
          onSetPinned(data.pinned);
          break;
        case "setTheme":
          onSetTheme(data.theme);
          break;
        case "setMinimised":
          onSetMinimised(data.minimised);
          break;
        case "captureScreenshot":
          // `target` names the form the image goes back to; it rides the
          // round-trip so two forms never share a flag. Normalised here exactly
          // as embed.js does at its own message handler.
          void handleCaptureScreenshot(
            data.target === "feature" ? "feature" : "main",
          );
          break;
      }
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [origin, onClose, onSetSize, onSetPinned, onSetTheme, onSetMinimised, handleCaptureScreenshot]);

  return (
    <iframe
      ref={iframeRef}
      id="feedback-widget-iframe"
      title="Feedback widget"
      src={src}
      onLoad={handleLoad}
    />
  );
}
