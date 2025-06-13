import {defineConfig} from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  outDir: "lib",
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  fixedExtension: true,
  unbundle: true,
  publint: true,
  unused: true,
});
