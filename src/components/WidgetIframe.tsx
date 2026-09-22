import { useEffect, useRef, useCallback } from "react";
import { PILL_H, PILL_R, POSITION_STYLES } from "../constants";
import { getMinimisedStyles, getSizeStyles, isMobile } from "../utils";
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
      const buffer = await captureScreenshot(
        () => ({
          iframe,
          button: document.getElementById("feedback-widget-button"),
          ...getPortalHosts(),
        }),
        // baseUrl, not `origin`: loadRemote strips the trailing slash itself.
        { baseUrl, remoteLibrary: remoteCaptureLibrary },
      );
      // post() re-reads contentWindow: an unmount mid-capture should be a no-op,
      // not a post into a dead window. Transferring detaches `buffer` — don't reuse it.
      post({ type: "screenshotCaptured", data: buffer }, [buffer]);
    } catch (err) {
      post({
        type: "screenshotFailed",
        error: err instanceof Error ? err.message : "Screenshot capture failed",
      });
    } finally {
      capturingRef.current = false;
    }
  }, [post, baseUrl, remoteCaptureLibrary]);

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
          void handleCaptureScreenshot();
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
