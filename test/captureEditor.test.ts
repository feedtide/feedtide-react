// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openCaptureEditor } from "../src/components/captureEditor";

// Characterisation tests over src/vendor/capture.js, which is vendored
// byte-identically from the feedtide repo and never edited here. They are not
// here to specify behaviour — upstream does that — but to say what this package
// relies on. If one fails after a sync (`pnpm sync:capture:react`, run from the
// feedtide repo), upstream changed something the widget depends on; read the
// diff before touching anything.
//
// happy-dom gives us <dialog>, attachShadow, PointerEvent and rAF, but
// getContext() returns null and getBoundingClientRect() is all zeros, so both
// are stubbed. setPointerCapture is genuinely absent — which is exactly the
// "synthetic pointers (tests, some WebViews) have no id to capture" path the
// vendored file already guards with try/catch.

const W = 800;
const H = 600;

/** Records 2D context calls so replayed ops can be counted. */
function recordingContext() {
  const calls: string[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(name);
      void args;
    };
  return {
    calls,
    ctx: {
      save: rec("save"),
      restore: rec("restore"),
      beginPath: rec("beginPath"),
      moveTo: rec("moveTo"),
      lineTo: rec("lineTo"),
      stroke: rec("stroke"),
      strokeRect: rec("strokeRect"),
      fillRect: rec("fillRect"),
      fillText: rec("fillText"),
      clearRect: rec("clearRect"),
      drawImage: rec("drawImage"),
      setLineDash: rec("setLineDash"),
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 0,
      lineCap: "",
      lineJoin: "",
      font: "",
      textBaseline: "",
    },
  };
}

let recorder: ReturnType<typeof recordingContext>;
const savedBlob = () => new Blob([new Uint8Array([9])], { type: "image/png" });

beforeEach(() => {
  document.body.innerHTML = "";
  recorder = recordingContext();

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    recorder.ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: W,
    height: H,
    right: W,
    bottom: H,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => {
    cb(savedBlob());
  });
});

afterEach(() => {
  // Leave no dialog behind: the module refuses a second open while one is up.
  document.getElementById("feedtide-capture")?.remove();
  (window as unknown as { FeedtideCapture: { root: unknown } }).FeedtideCapture.root =
    null;
  vi.restoreAllMocks();
});

const baseCanvas = () =>
  ({ width: W, height: H }) as unknown as HTMLCanvasElement;

function open(overrides: Partial<Parameters<typeof openCaptureEditor>[0]> = {}) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const onOpen = vi.fn();
  const opened = openCaptureEditor({
    canvas: baseCanvas(),
    position: "bottom-right",
    theme: "dark",
    onOpen,
    onSave,
    onCancel,
    ...overrides,
  });
  const dlg = document.getElementById("feedtide-capture") as HTMLDialogElement;
  const sh = dlg?.firstElementChild?.shadowRoot as ShadowRoot;
  return {
    opened,
    dlg,
    sh,
    onSave,
    onCancel,
    onOpen,
    cv: sh?.querySelector("canvas") as HTMLCanvasElement,
    tb: sh?.querySelector(".tb") as HTMLElement,
    btn: (sel: string) => sh.querySelector(sel) as HTMLElement,
  };
}

/** A pointer drag in client coords, which map 1:1 to image space here. */
function drag(cv: HTMLCanvasElement, from: [number, number], to: [number, number]) {
  const ev = (type: string, [clientX, clientY]: [number, number]) =>
    cv.dispatchEvent(
      new PointerEvent(type, { clientX, clientY, button: 0, bubbles: true }),
    );
  ev("pointerdown", from);
  ev("pointermove", to);
  ev("pointerup", to);
}

describe("vendored capture editor", () => {
  it("opens a modal dialog with a shadow root, and reports it opened", () => {
    const { opened, dlg, sh, onOpen } = open();

    expect(opened).toBe(true);
    expect(dlg).toBeTruthy();
    expect(dlg.hasAttribute("open")).toBe(true);
    expect(sh.querySelector("canvas")).toBeTruthy();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("refuses a second editor rather than stacking two", () => {
    open();
    const second = openCaptureEditor({
      canvas: baseCanvas(),
      position: "bottom-right",
      theme: "dark",
      onSave: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(second).toBe(false);
    expect(document.querySelectorAll("#feedtide-capture")).toHaveLength(1);
  });

  it("docks the toolbox away from the pill only on the left", () => {
    expect(open({ position: "bottom-right" }).tb.classList.contains("r")).toBe(false);
    document.getElementById("feedtide-capture")!.remove();
    (window as unknown as { FeedtideCapture: { root: unknown } }).FeedtideCapture.root = null;

    expect(open({ position: "top-left" }).tb.classList.contains("r")).toBe(true);
  });

  it("marks the selected tool and colour", () => {
    const { btn, sh } = open();

    btn('[data-tool="arrow"]').click();
    expect(btn('[data-tool="arrow"]').classList.contains("on")).toBe(true);
    expect(btn('[data-tool="pen"]').classList.contains("on")).toBe(false);

    const green = sh.querySelector('[data-c="#22c55e"]') as HTMLElement;
    green.click();
    expect(green.classList.contains("on")).toBe(true);
  });

  it("records a pen stroke, and undoes it", () => {
    const { cv, btn } = open();

    drag(cv, [10, 10], [100, 100]);
    recorder.calls.length = 0;
    // A second stroke forces a full replay: one stroke() per recorded op.
    drag(cv, [20, 20], [120, 120]);
    expect(recorder.calls.filter((c) => c === "stroke")).toHaveLength(2);

    recorder.calls.length = 0;
    btn('[data-act="undo"]').click();
    expect(recorder.calls.filter((c) => c === "stroke")).toHaveLength(1);
  });

  it("undoes with Ctrl/Cmd-Z as well as the button", () => {
    const { cv, dlg } = open();

    drag(cv, [10, 10], [100, 100]);
    drag(cv, [20, 20], [120, 120]);

    recorder.calls.length = 0;
    dlg.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true }),
    );
    expect(recorder.calls.filter((c) => c === "stroke")).toHaveLength(1);
  });

  it("draws box and arrow as dragged rects, not strokes", () => {
    const { cv, btn } = open();

    btn('[data-tool="box"]').click();
    drag(cv, [10, 10], [60, 60]);
    expect(recorder.calls).toContain("fillRect");

    btn('[data-tool="select"]').click();
    recorder.calls.length = 0;
    drag(cv, [10, 10], [60, 60]);
    expect(recorder.calls).toContain("strokeRect");
  });

  it("commits typed text on Enter", () => {
    const { cv, sh, btn } = open();
    btn('[data-tool="text"]').click();
    cv.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 30, clientY: 30, button: 0, bubbles: true }),
    );

    const input = sh.querySelector("input.txt") as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = "hello";
    recorder.calls.length = 0;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(recorder.calls).toContain("fillText");
    expect(sh.querySelector("input.txt")).toBeNull();
  });

  it("discards text on Escape without cancelling the editor", () => {
    const { cv, sh, btn, onCancel } = open();
    btn('[data-tool="text"]').click();
    cv.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 30, clientY: 30, button: 0, bubbles: true }),
    );

    const input = sh.querySelector("input.txt") as HTMLInputElement;
    input.value = "oops";
    recorder.calls.length = 0;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(recorder.calls).not.toContain("fillText");
    expect(onCancel).not.toHaveBeenCalled();
    expect(document.getElementById("feedtide-capture")).toBeTruthy();
  });

  describe("finishing", () => {
    it("saves a blob exactly once and tears the dialog down", () => {
      const { btn, onSave, onCancel } = open();

      btn('[data-act="save"], .save').click();

      expect(onSave).toHaveBeenCalledOnce();
      expect(onSave.mock.calls[0][0]).toBeInstanceOf(Blob);
      // The `closed` guard is what stops dlg.close() re-firing cancel after a save.
      expect(onCancel).not.toHaveBeenCalled();
      expect(document.getElementById("feedtide-capture")).toBeNull();
    });

    it("reports an export failure rather than saving nothing", () => {
      vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => {
        cb(null);
      });
      const { btn, onSave, onCancel } = open();

      btn(".save").click();

      expect(onSave).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledWith("Failed to export screenshot");
    });

    it("cancels from the toolbar, the cancel event, and a bare close", () => {
      for (const fire of [
        (o: ReturnType<typeof open>) => o.btn('[data-act="cancel"]').click(),
        (o: ReturnType<typeof open>) =>
          o.dlg.dispatchEvent(new Event("cancel", { cancelable: true })),
        (o: ReturnType<typeof open>) => o.dlg.close(),
      ]) {
        const o = open();
        fire(o);
        expect(o.onCancel).toHaveBeenCalledTimes(1);
        expect(o.onCancel.mock.calls[0][0]).toBeUndefined();
        expect(document.getElementById("feedtide-capture")).toBeNull();
      }
    });
  });

  it("keeps its clicks away from the host page", () => {
    // embed.js and EmbeddedWidget both close the widget on a click outside it.
    const onDocumentClick = vi.fn();
    document.addEventListener("click", onDocumentClick);
    const { btn } = open();

    btn('[data-tool="arrow"]').click();

    expect(onDocumentClick).not.toHaveBeenCalled();
    document.removeEventListener("click", onDocumentClick);
  });
});
