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

const root = createRoot(document.getElementById("root"));
const cloudClients = createCloudClients();

if (!cloudClients) {
  root.render(
    <main style={{ fontFamily: "sans-serif", margin: "12vh auto", maxWidth: 640, padding: 24 }}>
      <h1>Kinda needs its cloud settings</h1>
      <p>Set <code>VITE_CONVEX_URL</code> and <code>VITE_CONVEX_SITE_URL</code> in your local or Cloudflare Pages environment, then rebuild.</p>
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
