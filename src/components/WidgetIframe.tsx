import { useEffect, useRef, useCallback } from "react";
import { POSITION_STYLES } from "../constants";
import { getSizeStyles, isMobile } from "../utils";
import { captureScreenshot } from "./captureScreenshot";
import { getPortalHosts } from "./WidgetPortal";
import type { WidgetPosition, WidgetSize } from "../types";

interface WidgetIframeProps {
  src: string;
  baseUrl: string;
  position: WidgetPosition;
  size: WidgetSize;
  isOpen: boolean;
  isPinned: boolean;
  theme: string;
  onClose: () => void;
  onSetSize: (size: WidgetSize) => void;
  onSetPinned: (pinned: boolean) => void;
  onSetTheme: (theme: string) => void;
}

export function WidgetIframe({
  src,
  baseUrl,
  position,
  size,
  isOpen,
  isPinned,
  theme,
  onClose,
  onSetSize,
  onSetPinned,
  onSetTheme,
}: WidgetIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const capturingRef = useRef(false);
  const origin = baseUrl.replace(/\/$/, "");

  // Apply cssText directly via ref (embed.js uses cssText strings, not React style objects)
  useEffect(() => {
    if (!iframeRef.current) return;
    const mobile = isMobile();
    const posStyles = POSITION_STYLES[position];
    const sizeCSS = getSizeStyles(size, position, posStyles.container);

    const height = mobile ? "100vh" : size === "small" ? "500px" : size === "centered" ? "80vh" : "95vh";
    const maxWidth = mobile ? "100vw" : "calc(100vw - 40px)";
    const borderRadius = mobile ? "0" : "16px";
    const boxShadow = mobile ? "none" : "0 4px 24px rgba(0, 0, 0, 0.12)";

    iframeRef.current.style.cssText =
      sizeCSS +
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
  }, [position, size, isOpen]);

  // Send initial messages to iframe on load
  const handleLoad = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: "sizeChanged", size }, origin);
    win.postMessage({ type: "pinnedChanged", pinned: isPinned }, origin);
    win.postMessage({ type: "themeChanged", theme }, origin);
  }, [size, isPinned, theme, origin]);

  // Send refresh + size on open
  useEffect(() => {
    if (isOpen && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: "refreshFeatures" }, origin);
      iframeRef.current.contentWindow.postMessage({ type: "sizeChanged", size }, origin);
    }
  }, [isOpen, size, origin]);

  // html2canvas is pulled in lazily here (never at module scope) so consumers
  // that don't screenshot never download it, and SSR never touches it.
  const handleCaptureScreenshot = useCallback(async () => {
    // Drop duplicates rather than replying screenshotFailed: the iframe sets
    // window._screenshotTarget before posting and resets it to 'main' on
    // failure, so a reply here would misroute the in-flight capture from the
    // feature form back to the main one and toast an error the user didn't earn.
    if (capturingRef.current) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    capturingRef.current = true;
    try {
      const buffer = await captureScreenshot(() => ({
        iframe,
        button: document.getElementById("feedback-widget-button"),
        ...getPortalHosts(),
      }));
      // Re-read contentWindow: an unmount mid-capture should be a no-op, not a
      // post into a dead window. Transferring detaches `buffer` — don't reuse it.
      iframeRef.current?.contentWindow?.postMessage(
        { type: "screenshotCaptured", data: buffer },
        origin,
        [buffer],
      );
    } catch (err) {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "screenshotFailed",
          error: err instanceof Error ? err.message : "Screenshot capture failed",
        },
        origin,
      );
    } finally {
      capturingRef.current = false;
    }
  }, [origin]);

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
        case "captureScreenshot":
          void handleCaptureScreenshot();
          break;
      }
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [origin, onClose, onSetSize, onSetPinned, onSetTheme, handleCaptureScreenshot]);

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
