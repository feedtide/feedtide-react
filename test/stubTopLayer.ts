// Top-layer stubs, in a module of their own so they are installed before
// WidgetPortal is imported.
//
// WidgetPortal reads `HTMLElement.prototype.showPopover` once, at module scope,
// into `popoverSupported`. happy-dom implements neither popovers nor the
// `:modal` pseudo-class, so without these the entire escalation path is skipped
// under test — which is how the stuck-`hasModal` bug survived this long.
//
// Import this BEFORE anything that pulls in WidgetPortal. ESM evaluates imports
// in source order, so `import "./stubTopLayer"` first is enough.

const popoverState = new WeakSet<Element>();

(HTMLElement.prototype as unknown as { showPopover: () => void }).showPopover =
  function (this: HTMLElement) {
    popoverState.add(this);
  };
(HTMLElement.prototype as unknown as { hidePopover: () => void }).hidePopover =
  function (this: HTMLElement) {
    popoverState.delete(this);
  };

/** True while the element is in the (simulated) top layer. */
export const isShown = (el: Element | null) => !!el && popoverState.has(el);

// happy-dom parses `:modal` but always answers false. Treat an `open` attribute
// on a <dialog> as modal — foreignModal's filtering is what's under test, not
// the selector engine.
const realMatches = Element.prototype.matches;
Element.prototype.matches = function (this: Element, sel: string) {
  if (sel === ":modal") return this.tagName === "DIALOG" && this.hasAttribute("open");
  return realMatches.call(this, sel);
};

// happy-dom's showModal() sets `open`, so a dialog we create and show reads as
// modal through the stub above without further help.
