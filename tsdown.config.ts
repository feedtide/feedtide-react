import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: { resolve: true },
  hash: false,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom"],
});
