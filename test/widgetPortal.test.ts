// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
// Must come first: installs showPopover / hidePopover / `:modal` before
// WidgetPortal reads `showPopover` at module scope. The bare import is what
// guarantees the ordering — a named-only import can be elided by the TS
// transform, which silently puts the stubs *after* WidgetPortal has loaded.
import "./stubTopLayer";
import { isShown } from "./stubTopLayer";
import { mount, type Harness } from "./mountWidget";
import { restackHost } from "../src/components/WidgetPortal";
import { CAPTURE_DIALOG_ID } from "../src/constants";

// WidgetPortal escalates the widget into a <dialog> when the host page opens a
// modal, so the iframe stays interactive against the modal's inertness. It must
// not do that for dialogs of its own — the capture editor most of all, because
// escalating re-parents the portal wrapper and so reloads the iframe, throwing
// away whatever the user had typed.

const hosts = () => ({
  popover: document.getElementById("feedtide-popover-host"),
  dialog: document.getElementById("feedtide-dialog-host"),
  wrapper: document.getElementById("feedtide-portal-wrapper"),
});

/** happy-dom delivers MutationObserver records on a task, not a microtask. */
const settle = (h: Harness) => h.tick();

function addDialog(id?: string): HTMLDialogElement {
  const d = document.createElement("dialog");
  if (id) d.id = id;
  document.body.appendChild(d);
  d.showModal();
  return d;
}

async function openWidget(): Promise<Harness> {
  const h = await mount();
  await h.click(h.button);
  return h;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("WidgetPortal modal escalation", () => {
  it("escalates when the host page opens a modal dialog", async () => {
    const h = await openWidget();
    expect(hosts().dialog).toBeNull();

    addDialog();
    await settle(h);

    expect(hosts().dialog).not.toBeNull();
    expect(hosts().wrapper?.parentElement).toBe(hosts().dialog);
  });

  it("de-escalates once the host modal closes", async () => {
    // Regression: checkModalState used a bare `dialog:modal`, which matched the
    // portal's own #feedtide-dialog-host. Once escalated, hasModal stayed true
    // forever and the widget was stuck inside a dialog long after the host
    // page's modal had gone.
    const h = await openWidget();
    const host = addDialog();
    await settle(h);
    expect(hosts().dialog).not.toBeNull();

    host.close();
    host.remove();
    await settle(h);

    expect(hosts().dialog).toBeNull();
    expect(hosts().wrapper?.parentElement).toBe(hosts().popover);
  });

  it("never treats the capture editor as a host modal", async () => {
    const h = await openWidget();
    const iframeBefore = document.getElementById("feedback-widget-iframe");
    const parentBefore = iframeBefore?.parentElement;

    addDialog(CAPTURE_DIALOG_ID);
    await settle(h);

    expect(hosts().dialog).toBeNull();
    // The real assertion: the iframe is the same element in the same place, so
    // it was never re-parented and therefore never reloaded.
    const iframeAfter = document.getElementById("feedback-widget-iframe");
    expect(iframeAfter).toBe(iframeBefore);
    expect(iframeAfter?.parentElement).toBe(parentBefore);
  });

  it("never treats its own dialog host as a host modal", async () => {
    const h = await openWidget();
    addDialog();
    await settle(h);
    const escalated = hosts().dialog;
    expect(escalated).not.toBeNull();

    // A second pass with only our own dialogs open must not keep it escalated.
    document.querySelectorAll("dialog").forEach((d) => {
      if (d !== escalated) {
        (d as HTMLDialogElement).close();
        d.remove();
      }
    });
    await settle(h);

    expect(hosts().dialog).toBeNull();
  });
});

describe("restackHost", () => {
  it("re-enters the top layer so later dialogs do not cover the widget", async () => {
    const h = await openWidget();
    const popover = hosts().popover!;
    expect(isShown(popover)).toBe(true);

    restackHost();

    // hide + show leaves it shown, but now above whatever opened in between.
    expect(isShown(popover)).toBe(true);
  });

  it("is a no-op while escalated", async () => {
    const h = await openWidget();
    addDialog();
    await settle(h);
    expect(hosts().dialog).not.toBeNull();

    const popover = hosts().popover!;
    const before = isShown(popover);
    restackHost();

    // Re-showing the popover host here would make it the active modal and inert
    // the very thing we restacked above.
    expect(isShown(popover)).toBe(before);
  });
});
