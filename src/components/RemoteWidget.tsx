import { useEffect } from "react";
import type { FeedTideConfig, WidgetPosition } from "../types";

interface RemoteWidgetProps {
  config: FeedTideConfig;
  position: WidgetPosition;
}

// Extracted so the capture_loader branch is unit-testable without rendering.
export function buildInitConfig(config: FeedTideConfig, position: WidgetPosition) {
  return {
    app_id: config.appId,
    user_id: config.userId,
    signature: config.signature,
    timestamp: config.timestamp || Date.now(),
    position,
    theme: typeof config.theme === "string" ? config.theme : config.theme?.preset,
    user_email: config.userEmail,
    user_name: config.userName,
    // Hand embed.js the bundled html2canvas instead of letting it fetch
    // {baseUrl}/widget/html2canvas.min.js. Still lazy — embed.js only calls
    // this on the first screenshot request. Omitting it (remoteCaptureLibrary)
    // leaves embed.js to load its own script, which is also what older
    // embed.js builds do: they ignore the key with a console warning.
    ...(config.remoteCaptureLibrary
      ? {}
      : { capture_loader: () => import("html2canvas") }),
  };
}

export function RemoteWidget({ config, position }: RemoteWidgetProps) {
  useEffect(() => {
    let cancelled = false;

    const baseUrl = config.baseUrl!;
    const script = document.createElement("script");
    script.src = `${baseUrl.replace(/\/$/, "")}/widget/embed.js`;
    script.onload = () => {
      if (!cancelled) {
        (window as any).Feedtide?.init(buildInitConfig(config, position));
      }
    };
    script.onerror = () => {
      console.error(
        "[FeedTideWidget] Failed to load remote embed.js — this is likely a CSP (Content Security Policy) restriction. " +
        "Use <FeedTideWidget native /> for a CSP-safe self-contained widget that works in Chrome extensions and restricted environments."
      );
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      document.getElementById("feedback-widget-button")?.remove();
      document.getElementById("feedback-widget-iframe")?.remove();
      document.querySelectorAll("style").forEach((el) => {
        if (el.textContent?.includes("#feedback-widget-button")) el.remove();
      });
      script.remove();
    };
  }, [config.appId, config.userId, config.signature, config.timestamp, config.baseUrl, config.theme, config.userEmail, config.userName, config.remoteCaptureLibrary, position]);

  return null;
}
