import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1"
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@supabase/")) return "supabase";
          if (id.includes("node_modules/lucide-react/")) return "icons";
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/scheduler/")) return "react";
        }
      }
    }
  }
});
