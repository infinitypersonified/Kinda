import { defineConfig } from "vite";

// Compatibility entry point: reuses the app and public files from the parent project.
export default defineConfig({
  publicDir: "../public",
  server: { host: "127.0.0.1", fs: { allow: [".."] } }
});
