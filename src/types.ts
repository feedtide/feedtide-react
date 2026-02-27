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

export type ThemePresetId = "default" | "shiny-light" | "shiny-dark";

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
  | "top-left";
