import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Build before the suite runs so the dist/ assertions can never pass against a
// stale artifact. Mirrors packages/api/test/embed-build-setup.ts in feedtide.
export default function () {
  execSync("pnpm build", {
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
    stdio: "inherit",
  });
}
