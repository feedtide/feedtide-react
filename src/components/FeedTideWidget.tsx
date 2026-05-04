import { useState, useEffect, useMemo, useCallback } from "react";
import { useFeedTideOptional, getAnonymousId } from "../provider";
import { POSITION_STYLES, VALID_SIZES, VALID_THEMES, DEFAULT_BASE_URL } from "../constants";
import {
  isMobile,
  resolveTheme,
  getStoredPosition,
  storePosition,
  getStoredSize,
  storeSize,
  getStoredPin,
  storePin,
  buildIframeSrc,
} from "../utils";
import { WidgetButton } from "./WidgetButton";
import { WidgetIframe } from "./WidgetIframe";
import { WidgetPortal } from "./WidgetPortal";
import { RemoteWidget } from "./RemoteWidget";
import { useProximity } from "./useProximity";
import type { FeedTideConfig, WidgetMode, WidgetPosition, WidgetSize } from "../types";

export interface FeedTideWidgetProps extends Partial<FeedTideConfig> {
  mode?: WidgetMode;
  position?: WidgetPosition;
}

export function FeedTideWidget({ mode = "remote", position: configPosition = "bottom-right", ...props }: FeedTideWidgetProps) {
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

    const merged: FeedTideConfig = { ...ctx?.config, ...propsConfig } as FeedTideConfig;
    if (!merged.appId) throw new Error("FeedTideWidget requires appId — pass it as a prop or wrap in <FeedTideProvider>");
    if (!merged.userId) merged.userId = getAnonymousId();
    if (!merged.baseUrl) merged.baseUrl = DEFAULT_BASE_URL;
    return merged;
  }, [props.appId, props.userId, props.signature, props.userEmail, props.userName, props.baseUrl, props.timestamp, props.theme, ctx]);

  if (mode === "remote") {
    return <RemoteWidget config={config} position={configPosition} />;
  }

  return (
    <EmbeddedWidget
      config={config}
      configPosition={configPosition}
      hasExplicitUserId={!!(props.userId || ctx?.config.userId)}
    />
  );
}

// Internal component — self-contained widget rendering (CSP-safe, no remote scripts)

interface EmbeddedWidgetProps {
  config: FeedTideConfig;
  configPosition: WidgetPosition;
  hasExplicitUserId: boolean;
}

function EmbeddedWidget({ config, configPosition, hasExplicitUserId }: EmbeddedWidgetProps) {
  const resolvedPosition = useMemo<WidgetPosition>(() => {
    const stored = getStoredPosition();
    if (stored) return stored;
    return configPosition;
  }, [configPosition]);

  useEffect(() => {
    if (!getStoredPosition()) storePosition(configPosition);
  }, [configPosition]);

  const [size, setSize] = useState<WidgetSize>(() => {
    if (isMobile()) return "maximise";
    const stored = getStoredSize();
    return stored || "small";
  });

  const [isPinned, setIsPinned] = useState(() => getStoredPin() ?? false);

  const themeStr = typeof config.theme === "string" ? config.theme : config.theme?.preset;
  const resolvedTheme = resolveTheme(themeStr);

  const [isOpen, setIsOpen] = useState(false);

  const iframeSrc = useMemo(
    () =>
      buildIframeSrc(config.baseUrl!, config.appId, {
        userId: config.userId!,
        timestamp: config.timestamp || Date.now(),
        signature: config.signature,
        anonymous: !hasExplicitUserId,
        userEmail: config.userEmail,
        userName: config.userName,
        position: resolvedPosition,
        theme: resolvedTheme,
      }),
    [config, resolvedPosition, resolvedTheme, hasExplicitUserId],
  );

  useProximity(resolvedPosition, isOpen, isPinned);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      const btn = document.getElementById("feedback-widget-button");
      const posStyles = POSITION_STYLES[resolvedPosition];
      const mobile = isMobile();

      if (next) {
        if (!mobile && btn) {
          btn.style[posStyles.hideAxis] = posStyles.visibleVal;
          btn.classList.remove("ft-peeking", "ft-peeking-h");
          btn.classList.add("ft-visible");
        }
        trackEvent(config, "widget_open");
      } else {
        if (!mobile && !isPinned && btn) {
          btn.style[posStyles.hideAxis] = posStyles.hiddenVal;
          btn.classList.remove("ft-peeking", "ft-peeking-h", "ft-visible");
        }
        trackEvent(config, "widget_close");
      }
      return next;
    });
  }, [resolvedPosition, isPinned, config]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    const btn = document.getElementById("feedback-widget-button");
    const posStyles = POSITION_STYLES[resolvedPosition];
    if (!isMobile() && !isPinned && btn) {
      btn.style[posStyles.hideAxis] = posStyles.hiddenVal;
      btn.classList.remove("ft-peeking", "ft-peeking-h", "ft-visible");
    }
    trackEvent(config, "widget_close");
  }, [resolvedPosition, isPinned, config]);

  const handleSetSize = useCallback((newSize: WidgetSize) => {
    if (isMobile()) return;
    if (!(VALID_SIZES as readonly string[]).includes(newSize)) return;
    setSize(newSize);
    storeSize(newSize);
  }, []);

  const handleSetPinned = useCallback((pinned: boolean) => {
    setIsPinned(pinned);
    storePin(pinned);
    if (pinned) {
      const btn = document.getElementById("feedback-widget-button");
      const posStyles = POSITION_STYLES[resolvedPosition];
      if (btn) {
        btn.style[posStyles.hideAxis] = posStyles.visibleVal;
        btn.classList.remove("ft-peeking", "ft-peeking-h");
        btn.classList.add("ft-visible");
      }
    }
  }, [resolvedPosition]);

  const [activeTheme, setActiveTheme] = useState(resolvedTheme);
  useEffect(() => { setActiveTheme(resolvedTheme); }, [resolvedTheme]);
  const handleSetTheme = useCallback((newTheme: string) => {
    if (!(VALID_THEMES as readonly string[]).includes(newTheme)) return;
    setActiveTheme(newTheme === "system" ? resolveTheme("system") : newTheme);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!isOpen || isPinned) return;
      const iframe = document.getElementById("feedback-widget-iframe");
      const btn = document.getElementById("feedback-widget-button");
      if (e.target === iframe || iframe?.contains(e.target as Node)) return;
      if (e.target === btn || btn?.contains(e.target as Node)) return;
      handleClose();
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [isOpen, isPinned, handleClose]);

  useEffect(() => {
    if (isPinned) {
      const btn = document.getElementById("feedback-widget-button");
      const posStyles = POSITION_STYLES[resolvedPosition];
      if (btn) {
        btn.style[posStyles.hideAxis] = posStyles.visibleVal;
        btn.classList.add("ft-visible");
      }
    }
  }, []);

  return (
    <WidgetPortal isOpen={isOpen}>
      <WidgetButton position={resolvedPosition} onClick={toggle} />
      <WidgetIframe
        src={iframeSrc}
        baseUrl={config.baseUrl!}
        position={resolvedPosition}
        size={size}
        isOpen={isOpen}
        isPinned={isPinned}
        theme={activeTheme}
        onClose={handleClose}
        onSetSize={handleSetSize}
        onSetPinned={handleSetPinned}
        onSetTheme={handleSetTheme}
      />
    </WidgetPortal>
  );
}

function trackEvent(config: FeedTideConfig, eventType: string): void {
  const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  fetch(`${baseUrl}/api/analytics`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Id": config.appId,
      "X-User-Id": config.userId || "",
      "X-Timestamp": (config.timestamp || Date.now()).toString(),
      "X-Signature": config.signature || "",
    },
    body: JSON.stringify({ event_type: eventType }),
  }).catch(() => {});
}
