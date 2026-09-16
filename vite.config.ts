import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths, so the built dist/ works whether it's served from
  // a domain root or a GitHub Pages project subpath.
  base: "./",
  build: {
    outDir: "dist"
  }
});
