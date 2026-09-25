export interface FeedTideConfig {
  appId: string;
  userId?: string;
  signature?: string;
  userEmail?: string;
  userName?: string;
  baseUrl?: string;
  timestamp?: number;
  theme?: ThemePresetId | ThemeOverrides;
  /**
   * Load the screenshot tooling — html2canvas *and* the annotation editor —
   * from `{baseUrl}/widget/` instead of the copies bundled with this package.
   * Falls back to the bundled copy (with a console warning) if either remote
   * script fails to load.
   *
   * This does not reduce bundle size — the dynamic import still emits a chunk,
   * it just never gets fetched. What it buys is tracking whatever `feedtide.com`
   * serves rather than the versions pinned here.
   */
  remoteCaptureLibrary?: boolean;
}

export type ThemePresetId = "light" | "dark" | "system" | "basic";

export interface ThemeOverrides {
  preset?: ThemePresetId;
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

export interface PositionStyles {
  button: string;
  buttonHidden: string;
  container: string;
  hideAxis: "bottom" | "top" | "left" | "right";
  hiddenVal: string;
  peekVal: string;
  visibleVal: string;
}
