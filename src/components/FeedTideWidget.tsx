import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import type { FeedTideConfig, WidgetPosition, WidgetSize } from "../types";

export interface FeedTideWidgetProps extends Partial<FeedTideConfig> {
  native?: boolean;
  position?: WidgetPosition;
}

export function FeedTideWidget({ native = false, position: configPosition = "bottom-right", ...props }: FeedTideWidgetProps) {
  const ctx = useFeedTideOptional();

  const config = useMemo(() => {
    const { appId, userId, signature, userEmail, userName, baseUrl, timestamp, theme, remoteCaptureLibrary } = props;
    const propsConfig: Partial<FeedTideConfig> = {};
    if (appId !== undefined) propsConfig.appId = appId;
    if (userId !== undefined) propsConfig.userId = userId;
    if (signature !== undefined) propsConfig.signature = signature;
    if (userEmail !== undefined) propsConfig.userEmail = userEmail;
    if (userName !== undefined) propsConfig.userName = userName;
    if (baseUrl !== undefined) propsConfig.baseUrl = baseUrl;
    if (timestamp !== undefined) propsConfig.timestamp = timestamp;
    if (theme !== undefined) propsConfig.theme = theme;
    if (remoteCaptureLibrary !== undefined) propsConfig.remoteCaptureLibrary = remoteCaptureLibrary;

    const merged: FeedTideConfig = { ...ctx?.config, ...propsConfig } as FeedTideConfig;
    if (!merged.appId) throw new Error("FeedTideWidget requires appId — pass it as a prop or wrap in <FeedTideProvider>");
    if (!merged.userId) merged.userId = getAnonymousId();
    if (!merged.baseUrl) merged.baseUrl = DEFAULT_BASE_URL;
    return merged;
  }, [props.appId, props.userId, props.signature, props.userEmail, props.userName, props.baseUrl, props.timestamp, props.theme, props.remoteCaptureLibrary, ctx]);

  if (!native) {
    return <RemoteWidget config={config} position={configPosition} />;
  }

  return (
    <EmbeddedWidget
      config={config}
      configPosition={configPosition}
      hasExplicitUserId={!!props.userId || !!ctx?.hasExplicitUserId}
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

  // Track the button element via callback ref so effects re-run when it mounts.
  // (The button is portaled, so on first render it isn't yet in the DOM.)
  const [buttonEl, setButtonEl] = useState<HTMLButtonElement | null>(null);

  const themeStr = typeof config.theme === "string" ? config.theme : config.theme?.preset;
  const resolvedTheme = resolveTheme(themeStr);

  // activeTheme is the live theme — synced from the prop, also updated by the
  // iframe via the setTheme postMessage. Embedded into iframeSrc so a theme
  // change triggers a full iframe reload (the widget UI initializes from the URL).
  const [activeTheme, setActiveTheme] = useState(resolvedTheme);
  useEffect(() => { setActiveTheme(resolvedTheme); }, [resolvedTheme]);

  const [isOpen, setIsOpen] = useState(false);

  // Transient by design: never persisted, and deliberately not routed through
  // setSize/setPinned. storeSize()/storePin() would make it survive a reload, so
  // users would return to the site as a pill (or permanently pinned), and
  // assigning it as a size would destroy the size to restore to.
  const [isMinimised, setIsMinimised] = useState(false);

  // Changing src navigates the iframe, throwing away anything the user had typed.
  // Two inputs have to be kept out of the memo's identity for that reason:
  //
  //  - the Date.now() fallback, which would mint a new URL on any recompute;
  //  - size, which the iframe only reads on first paint to hide the matching
  //    button. Size changes travel by postMessage instead, as in embed.js.
  //
  // sizeRef still supplies the *current* size whenever the URL is legitimately
  // rebuilt (a theme change), so a rebuild never restores a stale size.
  const fallbackTimestamp = useRef(Date.now()).current;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const iframeSrc = useMemo(
    () =>
      buildIframeSrc(config.baseUrl!, config.appId, {
        userId: config.userId!,
        timestamp: config.timestamp || fallbackTimestamp,
        signature: config.signature,
        anonymous: !hasExplicitUserId,
        userEmail: config.userEmail,
        userName: config.userName,
        position: resolvedPosition,
        theme: activeTheme,
        size: sizeRef.current,
      }),
    [config, resolvedPosition, activeTheme, hasExplicitUserId, fallbackTimestamp],
  );

  useProximity(buttonEl, resolvedPosition, isOpen, isPinned);

  const toggle = useCallback(() => {
    const next = !isOpen;
    setIsOpen(next);
    const posStyles = POSITION_STYLES[resolvedPosition];
    const mobile = isMobile();

    if (next) {
      if (!mobile && buttonEl) {
        buttonEl.style[posStyles.hideAxis] = posStyles.visibleVal;
        buttonEl.classList.remove("ft-peeking", "ft-peeking-h");
        buttonEl.classList.add("ft-visible");
      }
      trackEvent(config, "widget_open");
    } else {
      if (!mobile && !isPinned && buttonEl) {
        buttonEl.style[posStyles.hideAxis] = posStyles.hiddenVal;
        buttonEl.classList.remove("ft-peeking", "ft-peeking-h", "ft-visible");
      }
      // Always restore on close, so reopening never lands on a pill
      setIsMinimised(false);
      trackEvent(config, "widget_close");
    }
  }, [isOpen, resolvedPosition, isPinned, config, buttonEl]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    const posStyles = POSITION_STYLES[resolvedPosition];
    if (!isMobile() && !isPinned && buttonEl) {
      buttonEl.style[posStyles.hideAxis] = posStyles.hiddenVal;
      buttonEl.classList.remove("ft-peeking", "ft-peeking-h", "ft-visible");
    }
    // Always restore on close, so reopening never lands on a pill
    setIsMinimised(false);
    trackEvent(config, "widget_close");
  }, [resolvedPosition, isPinned, config, buttonEl]);

  const handleSetSize = useCallback((newSize: WidgetSize) => {
    if (isMobile()) return;
    if (!(VALID_SIZES as readonly string[]).includes(newSize)) return;
    setSize(newSize);
    storeSize(newSize);
  }, []);

  const handleSetPinned = useCallback((pinned: boolean) => {
    setIsPinned(pinned);
    storePin(pinned);
    if (pinned && buttonEl) {
      const posStyles = POSITION_STYLES[resolvedPosition];
      buttonEl.style[posStyles.hideAxis] = posStyles.visibleVal;
      buttonEl.classList.remove("ft-peeking", "ft-peeking-h");
      buttonEl.classList.add("ft-visible");
    }
  }, [resolvedPosition, buttonEl]);

  const handleSetTheme = useCallback((newTheme: string) => {
    if (!(VALID_THEMES as readonly string[]).includes(newTheme)) return;
    setActiveTheme(newTheme === "system" ? resolveTheme("system") : newTheme);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!isOpen || isPinned || isMinimised) return;
      const iframe = document.getElementById("feedback-widget-iframe");
      if (e.target === iframe || iframe?.contains(e.target as Node)) return;
      if (e.target === buttonEl || buttonEl?.contains(e.target as Node)) return;
      handleClose();
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [isOpen, isPinned, isMinimised, handleClose, buttonEl]);

  // Pinned init: ensure button starts visible. Runs when buttonEl becomes
  // available (callback ref) so initial-pin state is applied even though
  // the button mounts after the parent effect would otherwise have run.
  useEffect(() => {
    if (isPinned && buttonEl) {
      const posStyles = POSITION_STYLES[resolvedPosition];
      buttonEl.style[posStyles.hideAxis] = posStyles.visibleVal;
      buttonEl.classList.add("ft-visible");
    }
  }, [buttonEl, isPinned, resolvedPosition]);

  return (
    <WidgetPortal isOpen={isOpen}>
      <WidgetButton ref={setButtonEl} position={resolvedPosition} onClick={toggle} />
      <WidgetIframe
        src={iframeSrc}
        baseUrl={config.baseUrl!}
        position={resolvedPosition}
        size={size}
        isOpen={isOpen}
        isPinned={isPinned}
        isMinimised={isMinimised}
        theme={activeTheme}
        onClose={handleClose}
        onSetSize={handleSetSize}
        onSetPinned={handleSetPinned}
        onSetTheme={handleSetTheme}
        onSetMinimised={setIsMinimised}
        remoteCaptureLibrary={config.remoteCaptureLibrary}
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
