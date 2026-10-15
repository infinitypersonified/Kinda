import React from "react";
import { createRoot } from "react-dom/client";
import posthog from "posthog-js";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import App from "./App.jsx";
import { createCloudClients } from "./cloudClient.js";
import "./styles.css";

if (import.meta.env.VITE_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true
  });
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  window.__kindaInstallPrompt = event;
  window.dispatchEvent(new Event("kinda:install"));
});

const root = createRoot(document.getElementById("root"));
const cloudClients = createCloudClients();

if (!cloudClients) {
  root.render(
    <main style={{ fontFamily: "sans-serif", margin: "12vh auto", maxWidth: 640, padding: 24 }}>
      <h1>Kinda needs its cloud settings</h1>
      <p>These values are embedded when the site is built. In Cloudflare Pages, add <code>VITE_CONVEX_URL</code> and <code>VITE_CONVEX_SITE_URL</code> as environment variables for the deployment environment, then retry the deployment. Use Production for the main site or Preview for branch previews.</p>
      <p>For local development, set both values in <code>.env.local</code> and restart the dev server or rebuild.</p>
    </main>
  );
} else {
  root.render(
    <React.StrictMode>
      <ConvexBetterAuthProvider client={cloudClients.convex} authClient={cloudClients.authClient}>
        <App authClient={cloudClients.authClient}/>
      </ConvexBetterAuthProvider>
    </React.StrictMode>
  );
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
