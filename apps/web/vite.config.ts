import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(__dirname, "../..");
  const env = loadEnv(mode, rootDir, "");
  const backendPort = env.HTTP_PORT || "3000";
  const backendOrigin = `http://localhost:${backendPort}`;

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": backendOrigin,
        "/ws": { target: backendOrigin.replace("http", "ws"), ws: true },
      },
      allowedHosts: ["redbird-rapid-safely.ngrok-free.app", "localhost"],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
