// Typed wrapper around the vendored screenshot annotation editor.
//
// src/vendor/capture.js is a byte-identical copy of the feedtide repo's
// packages/api/src/widget/capture.js — see src/vendor/capture.meta.json for the
// provenance. Refreshing it is driven from there: `pnpm sync:capture:react` in
// the feedtide repo pushes it down. It is never edited here:
// both rendering paths run the same source, so the editor cannot drift between
// `native` and the embed.js path. Fix bugs upstream, then re-sync.
//
// The vendored file is an ES5 IIFE that assigns `window.FeedtideCapture` — a
// top-level side effect, which package.json's `sideEffects` field must keep
// alive or bundlers may drop the import. test/build-output.test.ts pins this by
// asserting the editor's own strings survive into the emitted chunk.
//
// That assignment is also the module's only evaluation-time `window` access
// (every `document` reference lives inside open()), which is why this module is
// only ever reached through WidgetIframe's lazy `import("./captureScreenshot")`
// — it must never be evaluated during SSR.
import "../vendor/capture.js";

import type { WidgetPosition } from "../types";

export interface CaptureEditorOptions {
  /** The capture, at device-pixel scale. Not modified. */
  canvas: HTMLCanvasElement;
  /** Widget position; the toolbox moves right when the pill is on the left. */
  position: WidgetPosition;
  /** "dark" for a dark editor, anything else for light. */
  theme: string;
  /** Called once the editor is in the top layer. */
  onOpen?: () => void;
  /** Called with a PNG Blob of the flattened image. */
  onSave: (blob: Blob) => void;
  /** Called with no argument on cancel, or with an error string. */
  onCancel: (error?: string) => void;
}

interface FeedtideCapture {
  root: HTMLDialogElement | null;
  open: (options: CaptureEditorOptions) => void;
}

function api(): FeedtideCapture | undefined {
  return (window as unknown as { FeedtideCapture?: FeedtideCapture })
    .FeedtideCapture;
}

/**
 * Opens the annotation editor over the page.
 *
 * Returns false when an editor is already open — upstream's `if (this.root)
 * return` guard, surfaced so the caller can resolve instead of hanging on an
 * onSave/onCancel that will never fire. Also false if the vendored script did
 * not register itself, which means the side-effect import was tree-shaken.
 */
export function openCaptureEditor(options: CaptureEditorOptions): boolean {
  const capture = api();
  if (!capture || capture.root) return false;
  capture.open(options);
  return true;
}
