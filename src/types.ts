export interface FeedTideConfig {
  appId: string;
  userId?: string;
  signature?: string;
  userEmail?: string;
  userName?: string;
  baseUrl?: string;
  timestamp?: number;
  theme?: ThemePresetId | ThemeOverrides;
}

export type ThemePresetId = "light" | "dark" | "system" | "basic";

export interface ThemeOverrides {
  preset?: ThemePresetId;
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
}

export type WidgetPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left"
  | "bottom"
  | "top"
  | "left"
  | "right";

export type WidgetSize = "small" | "centered" | "maximise";

export type WidgetMode = "embedded" | "remote";

export interface PositionStyles {
  button: string;
  buttonHidden: string;
  container: string;
  hideAxis: "bottom" | "top" | "left" | "right";
  hiddenVal: string;
  peekVal: string;
  visibleVal: string;
}
