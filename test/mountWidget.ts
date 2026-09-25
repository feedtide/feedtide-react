// Shared mount harness for the host-level tests. Not named *.test.ts so vitest's
// `test/**/*.test.ts` include doesn't try to run it as a suite.
//
// React only stays quiet about act() when this flag is set; there is no
// testing-library here to set it for us. It must be set before React loads,
// which is why it lives at the top of this module rather than in each caller.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { FeedTideWidget } from "../src/components/FeedTideWidget";

export const ORIGIN = "https://feedtide.com";

export interface Harness {
  iframe: HTMLIFrameElement;
  button: HTMLButtonElement;
  posts: any[];
  fromIframe: (data: any) => Promise<void>;
  click: (el: Element) => Promise<void>;
  width: () => string | undefined;
  src: () => URL;
  /** Lets a pending promise chain settle without dispatching anything. */
  flush: () => Promise<void>;
  /**
   * Waits a macrotask. happy-dom delivers MutationObserver records on a task,
   * not a microtask, so `flush()` is not enough to observe WidgetPortal
   * reacting to a dialog appearing or disappearing.
   */
  tick: () => Promise<void>;
}

// Clearing document.body is not enough to reset between mounts: the previous
// root's effects are still live, so its WidgetPortal keeps a MutationObserver on
// the body and races the new one over the dialog host. Unmount it properly.
let previous: { root: ReturnType<typeof createRoot>; container: Element } | null =
  null;

export async function mount(storedSize?: string): Promise<Harness> {
  if (previous) {
    const stale = previous;
    previous = null;
    await act(async () => { stale.root.unmount(); });
    stale.container.remove();
  }

  document.body.innerHTML = "";
  localStorage.clear();
  if (storedSize) localStorage.setItem("feedtide-widget-size", storedSize);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  previous = { root, container };
  await act(async () => {
    root.render(
      React.createElement(FeedTideWidget, { native: true, appId: "app_x", baseUrl: ORIGIN }),
    );
  });

  const iframe = document.getElementById("feedback-widget-iframe") as HTMLIFrameElement;
  const button = document.getElementById("feedback-widget-button") as HTMLButtonElement;
  const posts: any[] = [];
  const fakeWin = { postMessage: (d: any) => posts.push(d) };
  Object.defineProperty(iframe, "contentWindow", { value: fakeWin, configurable: true });

  // The real iframe starts on about:blank and only reaches the widget origin once
  // it navigates; the host holds every send until then. Without modelling load,
  // these tests pass against code that can never deliver a message in a browser.
  await act(async () => { iframe.dispatchEvent(new Event("load")); });

  return {
    iframe,
    button,
    posts,
    fromIframe: async (data) => {
      await act(async () => {
        window.dispatchEvent(
          Object.assign(new MessageEvent("message", { data }), {
            origin: ORIGIN,
            source: fakeWin,
          } as any),
        );
      });
    },
    click: async (el) => { await act(async () => { (el as HTMLElement).click(); }); },
    width: () => /width:\s*([^;]+)/.exec(iframe.style.cssText)?.[1],
    src: () => new URL(iframe.getAttribute("src")!),
    flush: async () => { await act(async () => { await Promise.resolve(); }); },
    tick: async () => {
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    },
  };
}
