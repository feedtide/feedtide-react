import { useEffect } from "react";
import { useFeedTide } from "../provider";
import type { WidgetPosition } from "../types";

export interface FeedTideWidgetProps {
  position?: WidgetPosition;
}

export function FeedTideWidget({ position = "bottom-right" }: FeedTideWidgetProps) {
  const { config } = useFeedTide();

  useEffect(() => {
    const baseUrl = config.baseUrl!;
    const script = document.createElement("script");
    script.src = `${baseUrl.replace(/\/$/, "")}/widget/embed.js`;
    script.onload = () => {
      (window as any).FeedbackWidget?.init({
        app_id: config.appId,
        user_id: config.userId,
        signature: config.signature,
        timestamp: config.timestamp || Date.now(),
        position,
        iframe: true,
        theme: typeof config.theme === "string" ? config.theme : config.theme?.preset,
        user_email: config.userEmail,
        user_name: config.userName,
      });
    };
    document.head.appendChild(script);

    return () => {
      document.getElementById("feedback-widget-button")?.remove();
      document.getElementById("feedback-widget-iframe")?.remove();
      // Remove the style tag injected by the embed script
      document.querySelectorAll("style").forEach((el) => {
        if (el.textContent?.includes("#feedback-widget-button")) el.remove();
      });
      script.remove();
    };
  }, [config.appId, config.userId, config.signature, config.timestamp, config.baseUrl, config.theme, config.userEmail, config.userName, position]);

  return null;
}
