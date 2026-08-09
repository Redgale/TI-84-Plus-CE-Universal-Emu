import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "portable",
  base: "./",
  plugins: [react()],
  publicDir: "../public",
  server: {
    host: "0.0.0.0",
  },
  build: {
    outDir: "../dist-portable",
    emptyOutDir: true,
  },
});
