import { defineConfig } from "vite";

const proxy = {
  "/api": {
    target: "http://localhost:3000",
    rewrite: (p: string) => p.replace(/^\/api/, ""),
  },
};

export default defineConfig({
  server: { host: true, proxy },
  preview: { host: true, proxy },
  build: {
    rollupOptions: {
      input: { main: "index.html", prof: "prof.html", admin: "admin.html" },
    },
  },
});
