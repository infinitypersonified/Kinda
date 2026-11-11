import React from "react";
import { createRoot } from "react-dom/client";
import SupabaseApp from "./App.jsx";
import { initializeAnalytics } from "./analytics.js";
import { createSupabaseClient } from "./supabaseClient.js";
import "./styles.css";

initializeAnalytics(
  import.meta.env.VITE_POSTHOG_KEY,
  import.meta.env.VITE_POSTHOG_HOST,
);

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  window.__kindaInstallPrompt = event;
  window.dispatchEvent(new Event("kinda:install"));
});

const root = createRoot(document.getElementById("root"));
const supabase = createSupabaseClient();

if (!supabase) {
  root.render(
    <main style={{ fontFamily: "sans-serif", margin: "12vh auto", maxWidth: 640, padding: 24 }}>
      <h1>Kinda needs its Supabase settings</h1>
      <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to the build environment, then rebuild the site.</p>
    </main>
  );
} else {
  root.render(
    <React.StrictMode>
      <SupabaseApp client={supabase}/>
    </React.StrictMode>
  );
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
