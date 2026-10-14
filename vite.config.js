import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1"
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/posthog-js/")) return "analytics";
          if (id.includes("node_modules/@convex-dev/better-auth/") || id.includes("node_modules/better-auth/")) return "auth";
          if (id.includes("node_modules/convex/")) return "convex";
        }
      }
    }
  }
});
