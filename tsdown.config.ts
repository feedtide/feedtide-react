import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  // Allowlist rather than `true`: with `true`, any html2canvas type reaching a
  // declaration would get inlined into the .d.ts, dragging the library into the
  // published types even though it is only ever loaded via a lazy import().
  dts: { resolve: ["react", "react-dom"] },
  hash: false,
  sourcemap: true,
  clean: true,
  // html2canvas is already externalised automatically (it is a dependency);
  // listing it documents that dist must never inline it.
  external: ["react", "react-dom", "html2canvas"],
});
