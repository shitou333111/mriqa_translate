import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const base = process.env.BASE_URL || "/";

export default defineConfig({
  plugins: [react()],
  base,
  publicDir: "../public",
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001"
    }
  },
  preview: {
    host: "0.0.0.0",
    port: 4173
  }
});
