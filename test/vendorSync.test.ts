import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The drift detector the vendoring approach rests on. src/vendor/capture.js is
// a byte-identical copy of the feedtide repo's editor, so that `native` and the
// embed.js path can never render different editors. Nothing enforces that at
// runtime — this does, whenever the upstream checkout is present.
//
// Skipped when it isn't, so CI and fresh installs stay green. Point
// FEEDTIDE_REPO at a checkout (or worktree) to run it elsewhere.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PATH = "packages/api/src/widget/capture.js";

const vendored = readFileSync(join(ROOT, "src/vendor/capture.js"));
const meta = JSON.parse(
  readFileSync(join(ROOT, "src/vendor/capture.meta.json"), "utf-8"),
) as { source: string; sha256: string; bytes: number };

const repo = resolve(ROOT, process.env.FEEDTIDE_REPO ?? "../feedtide");
const upstream = join(repo, SOURCE_PATH);

describe("vendored capture.js", () => {
  it("matches its recorded hash and size", () => {
    expect(createHash("sha256").update(vendored).digest("hex")).toBe(meta.sha256);
    expect(vendored.byteLength).toBe(meta.bytes);
    expect(meta.source).toBe(SOURCE_PATH);
  });

  it("registers the global the wrapper reads", () => {
    // openCaptureEditor finds window.FeedtideCapture or silently returns false,
    // so a sync that changed the global's name would be invisible without this.
    const text = vendored.toString("utf-8");
    expect(text).toContain("window.FeedtideCapture");
    expect(text).toContain("feedtide-capture");
  });

  it.skipIf(!existsSync(upstream))(
    "is byte-identical to the upstream source",
    () => {
      // If this fails, upstream changed: re-sync from the feedtide repo with
      // `pnpm sync:capture:react`, then re-read test/captureEditor.test.ts's
      // characterisation tests to see what moved.
      expect(readFileSync(upstream).equals(vendored)).toBe(true);
    },
  );
});
