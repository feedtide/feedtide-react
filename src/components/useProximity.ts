import { useEffect, useRef } from "react";
import { POSITION_STYLES } from "../constants";
import { isMobile } from "../utils";
import type { WidgetPosition } from "../types";

// Replicates embed.js setupProximityDetection exactly:
// - 2s intro delay, then button shys away
// - mousemove, distance to the button's spot on its edge:
//   <80px = visible, 80-200px = peeking, >200px = hidden
// - mouseleave: hidden
// - Skipped on touch devices and when widget is open or pinned

export function useProximity(
  maybeEl: HTMLElement | null,
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
    if (!maybeEl || isMobile()) return;
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

    // Distance from the cursor to the button's spot on its edge — not to the
    // whole edge, or the far end of the screen would wake it. Hiding only
    // moves the button along hideAxis, so its span parallel to the edge is
    // valid to read even while it is tucked away.
    function getButtonDistance(e: MouseEvent): number {
      const r = el.getBoundingClientRect();
      const vertical = axis === "left" || axis === "right";
      const edge = axis === "bottom" ? window.innerHeight - e.clientY
        : axis === "top" ? e.clientY
        : axis === "left" ? e.clientX
        : window.innerWidth - e.clientX;
      const p = vertical ? e.clientY : e.clientX;
      const lo = vertical ? r.top : r.left;
      const hi = vertical ? r.bottom : r.right;
      const along = Math.max(lo - p, 0, p - hi);
      return Math.hypot(edge, along);
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
          update(getButtonDistance(e));
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
  }, [maybeEl, position]);
}
