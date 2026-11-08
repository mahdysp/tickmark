import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    rollupOptions: {
      input: { main: "index.html", professor: "professor.html", dashboard: "dashboard.html", prof: "prof.html" },
    },
  },
});
