import { useEffect, useRef } from "react";
import { POSITION_STYLES } from "../constants";
import { isMobile } from "../utils";
import type { WidgetPosition } from "../types";

// Replicates embed.js setupProximityDetection exactly:
// - 2s intro delay, then button shys away
// - mousemove: <80px = visible, 80-200px = peeking, >200px = hidden
// - mouseleave: hidden
// - Skipped on touch devices and when widget is open or pinned

export function useProximity(
  position: WidgetPosition,
  isOpen: boolean,
  isPinned: boolean,
) {
  const introCompleteRef = useRef(false);
  const isOpenRef = useRef(isOpen);
  const isPinnedRef = useRef(isPinned);
  // Track latest values without re-running the main effect — otherwise
  // every open/close/pin toggle would restart the 2s intro timer.
  isOpenRef.current = isOpen;
  isPinnedRef.current = isPinned;

  useEffect(() => {
    if (isMobile()) return;

    const maybeEl = document.getElementById("feedback-widget-button");
    if (!maybeEl) return;
    const el: HTMLElement = maybeEl;

    const posStyles = POSITION_STYLES[position];
    const axis = posStyles.hideAxis;
    const hiddenVal = posStyles.hiddenVal;
    const peekVal = posStyles.peekVal;
    const visibleVal = posStyles.visibleVal;
    let ticking = false;

    // Intro: button starts visible, shies away after 2s
    introCompleteRef.current = false;
    const introTimer = setTimeout(() => {
      introCompleteRef.current = true;
      if (!isOpenRef.current && !isPinnedRef.current) {
        el.style[axis] = hiddenVal;
        el.classList.remove("ft-visible");
      }
    }, 2000);

    function getEdgeDistance(e: MouseEvent): number {
      switch (axis) {
        case "bottom": return window.innerHeight - e.clientY;
        case "top": return e.clientY;
        case "left": return e.clientX;
        case "right": return window.innerWidth - e.clientX;
        default: return Infinity;
      }
    }

    function update(dist: number) {
      if (isOpenRef.current || isPinnedRef.current || !introCompleteRef.current) return;
      if (dist < 80) {
        el.style[axis] = visibleVal;
        el.classList.remove("ft-peeking", "ft-peeking-h");
        el.classList.add("ft-visible");
      } else if (dist < 200) {
        el.style[axis] = peekVal;
        el.classList.remove("ft-visible");
        el.classList.add(axis === "left" || axis === "right" ? "ft-peeking-h" : "ft-peeking");
      } else {
        el.style[axis] = hiddenVal;
        el.classList.remove("ft-peeking", "ft-peeking-h", "ft-visible");
      }
    }

    function onMouseMove(e: MouseEvent) {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          update(getEdgeDistance(e));
          ticking = false;
        });
      }
    }

    function onMouseLeave() {
      if (!isOpenRef.current && !isPinnedRef.current && introCompleteRef.current) {
        el.style[axis] = hiddenVal;
        el.classList.remove("ft-peeking", "ft-peeking-h", "ft-visible");
      }
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", onMouseLeave);

    return () => {
      clearTimeout(introTimer);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [position]);
}
