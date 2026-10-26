let client = null;
let initialization = Promise.resolve(null);

export function initializeAnalytics(key, host) {
  if (!key) return;
  initialization = import("posthog-js")
    .then(({ default: posthog }) => {
      client = posthog;
      posthog.init(key, {
        api_host: host || "https://us.i.posthog.com",
        person_profiles: "identified_only",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
      });
      return posthog;
    })
    .catch(() => null);
}

export async function capturePageview(properties) {
  const ready = await initialization;
  (ready || client)?.capture("$pageview", properties);
}
