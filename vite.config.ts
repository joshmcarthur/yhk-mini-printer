import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const base = process.env.BASE_PATH ?? "/";
const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base,
  resolve: {
    alias: {
      "@shared": path.resolve(rootDir, "shared"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(rootDir, "index.html"),
        qr: path.resolve(rootDir, "qr.html"),
      },
    },
  },
});
