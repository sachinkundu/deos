import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname),
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: { input: resolve(import.meta.dirname, "settings.html") },
  },
});
