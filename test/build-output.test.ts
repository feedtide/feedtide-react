import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

const read = (file: string) => readFileSync(join(DIST, file), "utf-8");

// Budget = current size + ~10% headroom. When a change legitimately grows the
// bundle, ratchet this to the new actual + ~10% in the same commit — never
// leave slack for the next change to spend silently.
const ESM_BUDGET_BYTES = 40 * 1024;

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
    const esm = read("index.js");
    expect(esm).toMatch(/import\s*\(\s*["']html2canvas["']\s*\)/);
    expect(esm).not.toMatch(/^import[^\n]*["']html2canvas["']/m);

    // rolldown may emit either import() or a deferred require() for CJS, so
    // this file only asserts presence — "loads without a DOM" below is what
    // actually proves nothing is pulled eagerly.
    expect(read("index.cjs")).toContain("html2canvas");
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

    const esm = await import(join(DIST, "index.js"));
    expect(Object.keys(esm)).toEqual(
      expect.arrayContaining(["FeedTideWidget", "FeedTideProvider"]),
    );

    const cjs = createRequire(import.meta.url)(join(DIST, "index.cjs"));
    expect(Object.keys(cjs)).toEqual(
      expect.arrayContaining(["FeedTideWidget", "FeedTideProvider"]),
    );
  });

  it(`stays under ${ESM_BUDGET_BYTES / 1024}KB`, () => {
    const bytes = new TextEncoder().encode(read("index.js")).byteLength;
    console.log(`dist/index.js: ${(bytes / 1024).toFixed(2)} KB (${bytes} bytes)`);
    expect(bytes).toBeLessThan(ESM_BUDGET_BYTES);
  });
});
