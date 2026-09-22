// @vitest-environment happy-dom
// React only stays quiet about act() when this flag is set; there is no
// testing-library here to set it for us.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { FeedTideWidget } from "../src/components/FeedTideWidget";

const ORIGIN = "https://feedtide.com";

interface Harness {
  iframe: HTMLIFrameElement;
  button: HTMLButtonElement;
  posts: any[];
  fromIframe: (data: any) => Promise<void>;
  click: (el: Element) => Promise<void>;
  width: () => string | undefined;
  src: () => URL;
}

async function mount(storedSize?: string): Promise<Harness> {
  document.body.innerHTML = "";
  localStorage.clear();
  if (storedSize) localStorage.setItem("feedtide-widget-size", storedSize);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
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
  };
}

const sentMinimised = (posts: any[]) =>
  posts.filter((p) => p.type === "minimisedChanged").map((p) => p.minimised);

describe("minimise host state", () => {
  it("collapses to the pill and tells the iframe", async () => {
    const h = await mount();
    await h.click(h.button);
    h.posts.length = 0;
    await h.fromIframe({ type: "setMinimised", minimised: true });
    expect(h.width()).toBe("88px");
    expect(sentMinimised(h.posts)).toContain(true);
  });

  for (const closeVia of ["header", "launcher"] as const) {
    it(`restores before closing via the ${closeVia}, so reopening is never a pill`, async () => {
      const h = await mount("maximise");
      await h.click(h.button);
      await h.fromIframe({ type: "setMinimised", minimised: true });
      expect(h.width()).toBe("88px");

      h.posts.length = 0;
      if (closeVia === "header") await h.fromIframe({ type: "closeWidget" });
      else await h.click(h.button);

      // The iframe keeps its own isMinimised flag; without this it reopens
      // full-size but still rendering the collapsed pill UI.
      expect(sentMinimised(h.posts)).toContain(false);

      await h.click(h.button);
      expect(h.width()).toBe("95vw");
    });
  }

  it("suppresses click-outside while minimised, the way pinned does", async () => {
    const h = await mount();
    await h.click(h.button);
    await h.fromIframe({ type: "setMinimised", minimised: true });
    await h.click(document.body);
    expect(h.width()).toBe("88px");
    expect(h.iframe.style.cssText).toContain("display: block");
  });
});

describe("send gating around iframe navigation", () => {
  it("holds sends until the iframe has navigated, then delivers on load", async () => {
    document.body.innerHTML = "";
    localStorage.clear();

    // happy-dom fires its own `load` the moment the src commits (child-frame
    // navigation is disabled in vitest.config.ts, so nothing is fetched and the
    // navigation "completes" on the next microtask). This test is about the
    // window *before* load, so hold that event back until we dispatch our own.
    // Capture phase on document: `load` doesn't bubble and the iframe is
    // portaled out to a body-level host, so no closer ancestor is stable.
    let releaseLoad = false;
    const gate = (e: Event) => { if (!releaseLoad) e.stopPropagation(); };
    document.addEventListener("load", gate, true);
    try {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(
          React.createElement(FeedTideWidget, { native: true, appId: "app_x", baseUrl: ORIGIN }),
        );
      });

      const iframe = document.getElementById("feedback-widget-iframe") as HTMLIFrameElement;
      const posts: any[] = [];
      Object.defineProperty(iframe, "contentWindow", {
        value: { postMessage: (d: any) => posts.push(d) },
        configurable: true,
      });

      // Before load the iframe is still about:blank, which inherits the parent's
      // origin — posting with the widget origin as targetOrigin throws there and
      // the message is silently lost. Nothing may be sent yet.
      await act(async () => {
        (document.getElementById("feedback-widget-button") as HTMLElement).click();
      });
      expect(posts).toEqual([]);

      // Load commits: the full state is delivered in one burst.
      releaseLoad = true;
      await act(async () => { iframe.dispatchEvent(new Event("load")); });
      expect(posts.map((p) => p.type)).toContain("minimisedChanged");
      expect(sentMinimised(posts)).toContain(false);
    } finally {
      document.removeEventListener("load", gate, true);
    }
  });
});

describe("iframe src stability", () => {
  it("does not navigate on a size change — that would discard typed feedback", async () => {
    const h = await mount();
    await h.click(h.button);
    const before = h.iframe.getAttribute("src");
    await h.fromIframe({ type: "setSizeMode", size: "maximise" });
    expect(h.iframe.getAttribute("src")).toBe(before);
  });

  it("rebuilds on a theme change, carrying the current size rather than a stale one", async () => {
    const h = await mount();
    await h.click(h.button);
    const before = h.iframe.getAttribute("src");
    await h.fromIframe({ type: "setSizeMode", size: "maximise" });
    await h.fromIframe({ type: "setTheme", theme: "dark" });
    expect(h.iframe.getAttribute("src")).not.toBe(before);
    expect(h.src().searchParams.get("size")).toBe("maximise");
    expect(h.src().searchParams.get("theme")).toBe("dark");
  });
});
