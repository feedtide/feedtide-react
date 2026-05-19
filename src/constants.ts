import type { PositionStyles, WidgetPosition, WidgetSize } from "./types";

export const VALID_POSITIONS: WidgetPosition[] = [
  "bottom-left", "bottom-right", "top-left", "top-right",
  "left", "right", "bottom", "top",
];

export const VALID_SIZES: WidgetSize[] = ["small", "centered", "maximise"];

export const VALID_THEMES = ["light", "dark", "system", "basic"] as const;

export const POSITION_STYLES: Record<WidgetPosition, PositionStyles> = {
  "bottom-left": {
    button: "bottom: 20px; left: 20px;",
    buttonHidden: "bottom: -34px; left: 20px;",
    container: "bottom: 80px; left: 20px;",
    hideAxis: "bottom",
    hiddenVal: "-34px",
    peekVal: "-20px",
    visibleVal: "20px",
  },
  "bottom-right": {
    button: "bottom: 20px; right: 20px;",
    buttonHidden: "bottom: -34px; right: 20px;",
    container: "bottom: 80px; right: 20px;",
    hideAxis: "bottom",
    hiddenVal: "-34px",
    peekVal: "-20px",
    visibleVal: "20px",
  },
  "top-left": {
    button: "top: 20px; left: 20px;",
    buttonHidden: "top: -34px; left: 20px;",
    container: "top: 80px; left: 20px;",
    hideAxis: "top",
    hiddenVal: "-34px",
    peekVal: "-20px",
    visibleVal: "20px",
  },
  "top-right": {
    button: "top: 20px; right: 20px;",
    buttonHidden: "top: -34px; right: 20px;",
    container: "top: 80px; right: 20px;",
    hideAxis: "top",
    hiddenVal: "-34px",
    peekVal: "-20px",
    visibleVal: "20px",
  },
  bottom: {
    button: "bottom: 20px; left: calc(50% - 24px);",
    buttonHidden: "bottom: -34px; left: calc(50% - 24px);",
    container: "bottom: 80px; left: 50%; transform: translateX(-50%);",
    hideAxis: "bottom",
    hiddenVal: "-34px",
    peekVal: "-20px",
    visibleVal: "20px",
  },
  top: {
    button: "top: 20px; left: calc(50% - 24px);",
    buttonHidden: "top: -34px; left: calc(50% - 24px);",
    container: "top: 80px; left: 50%; transform: translateX(-50%);",
    hideAxis: "top",
    hiddenVal: "-34px",
    peekVal: "-20px",
    visibleVal: "20px",
  },
  left: {
    button: "left: 20px; top: calc(50% - 24px);",
    buttonHidden: "left: -34px; top: calc(50% - 24px);",
    container: "left: 80px; top: 50%; transform: translateY(-50%);",
    hideAxis: "left",
    hiddenVal: "-34px",
    peekVal: "-20px",
    visibleVal: "20px",
  },
  right: {
    button: "right: 20px; top: calc(50% - 24px);",
    buttonHidden: "right: -34px; top: calc(50% - 24px);",
    container: "right: 80px; top: 50%; transform: translateY(-50%);",
    hideAxis: "right",
    hiddenVal: "-34px",
    peekVal: "-20px",
    visibleVal: "20px",
  },
};

export const DEFAULT_BASE_URL = "https://feedtide.com";

export const STORAGE_KEYS = {
  position: "feedtide-widget-position",
  size: "feedtide-widget-size",
  pin: "feedtide-widget-pinned",
} as const;
