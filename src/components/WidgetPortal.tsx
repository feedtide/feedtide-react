import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Replicates embed.js popover host + dialog host escalation.
// - Creates a popover host div in the top layer (if supported)
// - Watches for modal dialogs via MutationObserver
// - Escalates to a <dialog> host when modal is detected and widget is open
// - Includes capture-phase click interception for button clicks through modal inertness

const popoverSupported =
  typeof HTMLElement !== "undefined" &&
  typeof HTMLElement.prototype.showPopover === "function";

interface WidgetPortalProps {
  children: ReactNode;
  isOpen: boolean;
}

export function WidgetPortal({ children, isOpen }: WidgetPortalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  // Create popover host on mount
  useEffect(() => {
    if (popoverSupported) {
      const host = document.createElement("div");
      host.id = "feedtide-popover-host";
      host.setAttribute("popover", "manual");
      host.style.cssText =
        "position:fixed; inset:0; margin:0; padding:0; border:none; background:transparent; pointer-events:none;";
      document.body.appendChild(host);
      try { host.showPopover(); } catch { /* noop */ }

      // Inject child pointer-events style
      const style = document.createElement("style");
      style.textContent = `
        #feedtide-popover-host > * { pointer-events: auto; }
        #feedtide-dialog-host {
          background: transparent; border: none; margin: 0; padding: 0;
          position: fixed; inset: 0; width: 100vw; height: 100vh;
          max-width: 100vw; max-height: 100vh; overflow: visible; pointer-events: none;
        }
        #feedtide-dialog-host::backdrop { background: transparent; }
        #feedtide-dialog-host > * { pointer-events: auto; }
      `;
      document.head.appendChild(style);

      hostRef.current = host;
      setContainer(host);

      return () => {
        host.remove();
        style.remove();
        hostRef.current = null;
      };
    } else {
      // Fallback: use document.body
      setContainer(document.body);
    }
  }, []);

  // Dialog escalation: watch for modal dialogs
  useEffect(() => {
    if (!popoverSupported || !hostRef.current) return;

    let hasModalDialog = false;

    function restack() {
      try {
        hostRef.current?.hidePopover();
        hostRef.current?.showPopover();
      } catch { /* noop */ }
    }

    function escalate() {
      if (dialogRef.current) return;
      const dialog = document.createElement("dialog");
      dialog.id = "feedtide-dialog-host";

      // Move all children from popover host to dialog
      const host = hostRef.current!;
      while (host.firstChild) dialog.appendChild(host.firstChild);
      try { host.hidePopover(); } catch { /* noop */ }

      document.body.appendChild(dialog);
      try {
        dialog.showModal();
        dialog.addEventListener("cancel", (e) => e.preventDefault());
        dialogRef.current = dialog;
        setContainer(dialog);
      } catch {
        // Fallback: move children back
        while (dialog.firstChild) host.appendChild(dialog.firstChild);
        dialog.remove();
        try { host.showPopover(); } catch { /* noop */ }
      }
    }

    function deescalate() {
      if (!dialogRef.current) return;
      const host = hostRef.current!;
      const dialog = dialogRef.current;
      while (dialog.firstChild) host.appendChild(dialog.firstChild);
      try { dialog.close(); } catch { /* noop */ }
      dialog.remove();
      dialogRef.current = null;
      try { host.showPopover(); } catch { /* noop */ }
      setContainer(host);
    }

    function checkModalState() {
      let hasModal = false;
      try { hasModal = !!document.querySelector("dialog:modal"); } catch { /* noop */ }
      hasModalDialog = hasModal;
      if (hasModal) {
        restack();
        if (isOpen && !dialogRef.current) escalate();
      } else {
        if (dialogRef.current) deescalate();
      }
    }

    const observer = new MutationObserver((mutations) => {
      let dialogChanged = false;
      for (const m of mutations) {
        if (m.type === "attributes" && (m.target as Element).nodeName === "DIALOG") {
          dialogChanged = true;
          break;
        }
        if (m.type === "childList") {
          for (const n of m.addedNodes) {
            if (n.nodeName === "DIALOG") { dialogChanged = true; break; }
          }
          if (!dialogChanged) {
            for (const n of m.removedNodes) {
              if (n.nodeName === "DIALOG") { dialogChanged = true; break; }
            }
          }
          if (dialogChanged) break;
        }
      }
      if (dialogChanged) checkModalState();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });

    checkModalState();

    // Capture-phase click interception for button through modal inertness
    function onPointerDown(e: PointerEvent) {
      if (!hasModalDialog || dialogRef.current) return;
      const btn = document.getElementById("feedback-widget-button");
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      if (rect.width === 0) return;
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        e.stopPropagation();
      }
    }

    function onClickCapture(e: MouseEvent) {
      if (!hasModalDialog || dialogRef.current) return;
      const btn = document.getElementById("feedback-widget-button");
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      if (rect.width === 0) return;
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        e.stopPropagation();
        e.preventDefault();
        btn.click();
      }
    }

    // Cursor override for button hover through modal inertness
    let cursorOverride = false;
    function onMouseMoveCapture(e: MouseEvent) {
      if (!hasModalDialog || dialogRef.current) {
        if (cursorOverride) { document.documentElement.style.cursor = ""; cursorOverride = false; }
        return;
      }
      const btn = document.getElementById("feedback-widget-button");
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      if (rect.width > 0 &&
          e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        if (!cursorOverride) { document.documentElement.style.cursor = "pointer"; cursorOverride = true; }
      } else if (cursorOverride) {
        document.documentElement.style.cursor = "";
        cursorOverride = false;
      }
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("mousemove", onMouseMoveCapture, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("mousemove", onMouseMoveCapture, true);
      if (dialogRef.current) {
        try { dialogRef.current.close(); } catch { /* noop */ }
        dialogRef.current.remove();
        dialogRef.current = null;
      }
    };
  }, [isOpen]);

  if (!container) return null;
  return createPortal(children, container);
}
