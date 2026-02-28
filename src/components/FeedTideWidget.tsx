import { useEffect, useMemo } from "react";
import { useFeedTideOptional, getAnonymousId } from "../provider";
import type { FeedTideConfig, WidgetPosition } from "../types";

export interface FeedTideWidgetProps extends Partial<FeedTideConfig> {
  position?: WidgetPosition;
}

export function FeedTideWidget({ position = "bottom-right", ...props }: FeedTideWidgetProps) {
  const ctx = useFeedTideOptional();

  const config = useMemo(() => {
    const { appId, userId, signature, userEmail, userName, baseUrl, timestamp, theme } = props;
    const propsConfig: Partial<FeedTideConfig> = {};
    if (appId !== undefined) propsConfig.appId = appId;
    if (userId !== undefined) propsConfig.userId = userId;
    if (signature !== undefined) propsConfig.signature = signature;
    if (userEmail !== undefined) propsConfig.userEmail = userEmail;
    if (userName !== undefined) propsConfig.userName = userName;
    if (baseUrl !== undefined) propsConfig.baseUrl = baseUrl;
    if (timestamp !== undefined) propsConfig.timestamp = timestamp;
    if (theme !== undefined) propsConfig.theme = theme;

    const merged: FeedTideConfig = {
      ...ctx?.config,
      ...propsConfig,
    } as FeedTideConfig;

    if (!merged.appId) {
      throw new Error(
        "FeedTideWidget requires appId — pass it as a prop or wrap in <FeedTideProvider>"
      );
    }

    if (!merged.userId) {
      merged.userId = getAnonymousId();
    }

    if (!merged.baseUrl) {
      merged.baseUrl = "https://feedtide.com";
    }

    return merged;
  }, [props.appId, props.userId, props.signature, props.userEmail, props.userName, props.baseUrl, props.timestamp, props.theme, ctx]);

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
