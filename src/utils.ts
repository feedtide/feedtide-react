import { STORAGE_KEYS, VALID_POSITIONS, VALID_SIZES, VALID_THEMES } from "./constants";
import type { WidgetPosition, WidgetSize } from "./types";

export function isMobile(): boolean {
  return typeof window !== "undefined" && "ontouchstart" in window;
}

export function getSystemTheme(): "light" | "dark" {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function resolveTheme(theme: string | undefined): string {
  const t = theme && (VALID_THEMES as readonly string[]).includes(theme) ? theme : "light";
  return t === "system" ? getSystemTheme() : t;
}

export function getStoredPosition(): WidgetPosition | null {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.position);
    return v && (VALID_POSITIONS as string[]).includes(v) ? (v as WidgetPosition) : null;
  } catch {
    return null;
  }
}

export function storePosition(position: WidgetPosition): void {
  try { localStorage.setItem(STORAGE_KEYS.position, position); } catch { /* noop */ }
}

export function getStoredSize(): WidgetSize | null {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.size);
    return v && (VALID_SIZES as string[]).includes(v) ? (v as WidgetSize) : null;
  } catch {
    return null;
  }
}

export function storeSize(size: WidgetSize): void {
  try { localStorage.setItem(STORAGE_KEYS.size, size); } catch { /* noop */ }
}

export function getStoredPin(): boolean | null {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.pin);
    return v !== null ? v === "true" : null;
  } catch {
    return null;
  }
}

export function storePin(pinned: boolean): void {
  try { localStorage.setItem(STORAGE_KEYS.pin, pinned ? "true" : "false"); } catch { /* noop */ }
}

export function getSizeStyles(size: string, position: string, posContainerCSS: string): string {
  if (isMobile()) {
    return "position:fixed; top:0; left:0; width:100vw; height:100vh;";
  }
  if (size === "centered") {
    return "position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:55vw; height:80vh; min-width:360px; min-height:500px;";
  }
  if (size === "maximise") {
    return "position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:95vw; height:95vh; min-width:360px; min-height:400px;";
  }
  // small: use position-based styles
  return "position:fixed; " + posContainerCSS + " width:400px; max-width:calc(100vw - 40px);";
}

export function buildIframeSrc(
  baseUrl: string,
  appId: string,
  params: {
    userId: string;
    timestamp: number;
    signature?: string;
    anonymous: boolean;
    userEmail?: string;
    userName?: string;
    position: string;
    theme: string;
  },
): string {
  const qs = new URLSearchParams({
    user_id: params.userId,
    timestamp: params.timestamp.toString(),
    signature: params.signature || "",
    anonymous: params.anonymous ? "true" : "false",
    user_email: params.userEmail || "",
    user_name: params.userName || "",
    position: params.position,
    parent_origin: typeof window !== "undefined" ? window.location.origin : "",
    theme: params.theme,
  });
  if (isMobile()) qs.set("mobile", "true");
  return `${baseUrl.replace(/\/$/, "")}/widget/${appId}?${qs.toString()}`;
}
