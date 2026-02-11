import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/tsp-triager/",
  plugins: [react()],
  root: ".",
  build: {
    outDir: "dist",
  },
});
