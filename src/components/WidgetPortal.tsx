import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Replicates embed.js popover host + dialog host escalation.
// - Creates a popover host div in the top layer (if supported)
// - Watches for modal dialogs via MutationObserver
// - Escalates by moving a stable wrapper element into a <dialog> when a modal appears
// - Includes capture-phase click interception for button clicks through modal inertness
//
// React always portals into `wrapper` — we relocate `wrapper` between hosts via
// plain DOM moves. This avoids changing React's portal container, which would
// remount the subtree (duplicating nodes / losing iframe state).

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
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  // Create popover host + stable wrapper on mount
  useEffect(() => {
    const wrapper = document.createElement("div");
    wrapper.id = "feedtide-portal-wrapper";
    wrapper.style.cssText = "display:contents;";
    wrapperRef.current = wrapper;

    if (popoverSupported) {
      const host = document.createElement("div");
      host.id = "feedtide-popover-host";
      host.setAttribute("popover", "manual");
      host.style.cssText =
        "position:fixed; inset:0; margin:0; padding:0; border:none; background:transparent; pointer-events:none;";
      host.appendChild(wrapper);
      document.body.appendChild(host);
      try { host.showPopover(); } catch { /* noop */ }

      const style = document.createElement("style");
      style.textContent = `
        #feedtide-portal-wrapper > * { pointer-events: auto; }
        #feedtide-dialog-host {
          background: transparent; border: none; margin: 0; padding: 0;
          position: fixed; inset: 0; width: 100vw; height: 100vh;
          max-width: 100vw; max-height: 100vh; overflow: visible; pointer-events: none;
        }
        #feedtide-dialog-host::backdrop { background: transparent; }
      `;
      document.head.appendChild(style);

      hostRef.current = host;
      setContainer(wrapper);

      return () => {
        host.remove();
        style.remove();
        hostRef.current = null;
        wrapperRef.current = null;
      };
    } else {
      document.body.appendChild(wrapper);
      setContainer(wrapper);
      return () => {
        wrapper.remove();
        wrapperRef.current = null;
      };
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
      const wrapper = wrapperRef.current;
      const host = hostRef.current;
      if (!wrapper || !host) return;

      const dialog = document.createElement("dialog");
      dialog.id = "feedtide-dialog-host";
      document.body.appendChild(dialog);
      try {
        dialog.showModal();
        dialog.addEventListener("cancel", (e) => e.preventDefault());
        // Move the stable wrapper into the dialog. React's portal target is
        // still `wrapper`, so React doesn't unmount/remount anything.
        dialog.appendChild(wrapper);
        try { host.hidePopover(); } catch { /* noop */ }
        dialogRef.current = dialog;
      } catch {
        dialog.remove();
      }
    }

    function deescalate() {
      if (!dialogRef.current) return;
      const wrapper = wrapperRef.current;
      const host = hostRef.current;
      const dialog = dialogRef.current;
      if (!wrapper || !host) return;

      host.appendChild(wrapper);
      try { dialog.close(); } catch { /* noop */ }
      dialog.remove();
      dialogRef.current = null;
      try { host.showPopover(); } catch { /* noop */ }
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
