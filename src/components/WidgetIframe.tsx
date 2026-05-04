import { useEffect, useRef, useCallback } from "react";
import { POSITION_STYLES } from "../constants";
import { getSizeStyles, isMobile } from "../utils";
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

  // Listen for postMessages from iframe
  useEffect(() => {
    function handler(event: MessageEvent) {
      if (event.origin !== origin) return;
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
        // captureScreenshot intentionally omitted — requires loading html2canvas
        // which is a remote script. Chrome extensions can't load it either.
        // Screenshot capture will gracefully fail (iframe handles the missing response).
      }
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [origin, onClose, onSetSize, onSetPinned, onSetTheme]);

  return (
    <iframe
      ref={iframeRef}
      id="feedback-widget-iframe"
      src={src}
      onLoad={handleLoad}
    />
  );
}
