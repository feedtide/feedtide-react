import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

const read = (file: string) => readFileSync(join(DIST, file), "utf-8");
const bytes = (file: string) =>
  new TextEncoder().encode(read(file)).byteLength;

// The capture flow is behind a dynamic import, so the build emits chunks. Only
// the ones index.js reaches by *static* import are downloaded on first paint;
// measuring index.js alone would hide however much got split into a sibling.
const ENTRY = "index.js";
const LAZY_CHUNK = "captureScreenshot.js";

/** index.js plus every chunk it statically imports, transitively. */
function eagerChunks(): string[] {
  const seen = new Set<string>();
  const queue = [ENTRY];
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    // Static `… from "./x.js"` only — `import("./x.js")` is deliberately not
    // matched, which is what keeps the lazy chunk out of the eager set.
    for (const m of read(file).matchAll(/^import[^;\n]*from\s*"(\.\/[^"]+)"/gm)) {
      queue.push(m[1].replace(/^\.\//, ""));
    }
  }
  return [...seen];
}

// Budget = current size + ~10% headroom. When a change legitimately grows the
// bundle, ratchet this to the new actual + ~10% in the same commit — never
// leave slack for the next change to spend silently.
const EAGER_BUDGET_BYTES = 40 * 1024;
// The editor and capture flow are lazy — fetched only when Screenshot is
// clicked — so they are budgeted on their own rather than against the bundle
// every consumer pays for. Mirrors packages/api's CAPTURE_BUDGET_BYTES.
const LAZY_CHUNK_BUDGET_BYTES = 18 * 1024;

describe("dist output", () => {
  it("does not inline html2canvas", () => {
    // Fingerprints from html2canvas.min.js's banner and body — the same check
    // packages/api's bundle-size.test.ts runs against embed.js.
    const fingerprints = ["hertzen.com", "html2canvas 1."];
    for (const file of readdirSync(DIST)) {
      if (!/\.(js|cjs|mjs)$/.test(file)) continue;
      for (const fp of fingerprints) {
        expect(read(file), `${file} inlines html2canvas`).not.toContain(fp);
      }
    }
  });

  it("imports html2canvas lazily, never statically", () => {
    // It lives in the lazy chunk now, not the entry.
    expect(read(LAZY_CHUNK)).toMatch(/import\s*\(\s*["']html2canvas["']\s*\)/);
    for (const file of readdirSync(DIST)) {
      if (!/\.(js|cjs|mjs)$/.test(file)) continue;
      expect(read(file), file).not.toMatch(/^import[^\n]*["']html2canvas["']/m);
    }

    // rolldown may emit either import() or a deferred require() for CJS, so
    // this file only asserts presence — "loads without a DOM" below is what
    // actually proves nothing is pulled eagerly.
    expect(read("captureScreenshot.cjs")).toContain("html2canvas");
  });

  // The vendored editor (src/vendor/capture.js) is an IIFE whose only product
  // is assigning window.FeedtideCapture. That is a top-level side effect, so a
  // blanket `"sideEffects": false` in package.json makes it legal to tree-shake
  // — and rolldown does, silently, leaving openCaptureEditor to find no global
  // and every screenshot to come back "cancelled". Verified by flipping the
  // field: the strings below vanish from the chunk entirely. This test is what
  // keeps package.json's sideEffects allowlist honest.
  it("keeps the vendored capture editor in the lazy chunk", () => {
    for (const chunk of [LAZY_CHUNK, "captureScreenshot.cjs"]) {
      expect(read(chunk), chunk).toContain("Attach to feedback");
      expect(read(chunk), chunk).toContain("window.FeedtideCapture");
    }
  });

  it("keeps the capture editor out of the eager bundle", () => {
    // Not keyed on "feedtide-capture": CAPTURE_DIALOG_ID legitimately lives in
    // the eager bundle, for foreignModal and the outside-click guard.
    for (const file of eagerChunks()) {
      expect(read(file), file).not.toContain("Attach to feedback");
      expect(read(file), file).not.toContain("Preparing screenshot");
    }
  });

  it("does not leak html2canvas types into the declarations", () => {
    // Matching the bare word would trip over doc comments that name the
    // library; what must not appear is a reference to the module or its
    // declarations inlined by dts.resolve.
    for (const file of ["index.d.ts", "index.d.cts"]) {
      const dts = read(file);
      expect(dts, file).not.toMatch(/from\s*["']html2canvas["']/);
      expect(dts, file).not.toMatch(/import\s*\(\s*["']html2canvas["']\s*\)/);
      expect(dts, file).not.toMatch(/declare\s+(?:function|const|class|namespace)\s+html2canvas/);
    }
  });

  it("loads without a DOM", async () => {
    expect(globalThis.document).toBeUndefined();

    const esm = await import(join(DIST, ENTRY));
    expect(Object.keys(esm)).toEqual(
      expect.arrayContaining(["FeedTideWidget", "FeedTideProvider"]),
    );

    const cjs = createRequire(import.meta.url)(join(DIST, "index.cjs"));
    expect(Object.keys(cjs)).toEqual(
      expect.arrayContaining(["FeedTideWidget", "FeedTideProvider"]),
    );
  });

  it(`keeps the eager bundle under ${EAGER_BUDGET_BYTES / 1024}KB`, () => {
    const files = eagerChunks();
    const total = files.reduce((sum, f) => sum + bytes(f), 0);
    const detail = files.map((f) => `${f} ${bytes(f)}`).join(", ");
    console.log(
      `eager: ${(total / 1024).toFixed(2)} KB (${total} bytes) — ${detail}`,
    );
    expect(total).toBeLessThan(EAGER_BUDGET_BYTES);
  });

  it(`keeps the lazy capture chunk under ${LAZY_CHUNK_BUDGET_BYTES / 1024}KB`, () => {
    const size = bytes(LAZY_CHUNK);
    console.log(`lazy: ${(size / 1024).toFixed(2)} KB (${size} bytes)`);
    expect(size).toBeLessThan(LAZY_CHUNK_BUDGET_BYTES);
  });
});
