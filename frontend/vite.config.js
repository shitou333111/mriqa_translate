import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const base = process.env.BASE_URL || "/";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const artalkProxyTarget = (env.ARTALK_PROXY_TARGET || env.VITE_ARTALK_SERVER || "http://39.102.96.105:23366").replace(/\/+$/, "");

  return {
    plugins: [react()],
    base,
    publicDir: "../public",
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/api": "http://localhost:3001",
        "/artalk-api": {
          target: artalkProxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/artalk-api/, "")
        }
      }
    },
    preview: {
      host: "0.0.0.0",
      port: 4173
    }
  };
});
