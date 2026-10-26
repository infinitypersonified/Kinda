const supabaseUrl = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !publishableKey) {
  throw new Error("Set the Vite Supabase URL and publishable key in .env.local.");
}

const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
  headers: { apikey: publishableKey },
});
if (!response.ok) throw new Error(`Auth settings request failed: HTTP ${response.status}`);
const settings = await response.json();
const localRedirect = "http://127.0.0.1:5173/";
const authorizationUrl = new URL(`${supabaseUrl}/auth/v1/authorize`);
authorizationUrl.searchParams.set("provider", "google");
authorizationUrl.searchParams.set("redirect_to", localRedirect);
const authorizationResponse = await fetch(authorizationUrl, {
  headers: { apikey: publishableKey },
  redirect: "manual",
});
const providerLocation = authorizationResponse.headers.get("location");
let googleAuthorizationRedirectUri = null;
let googleRedirectCheck = null;
if (providerLocation) {
  try {
    const providerUrl = new URL(providerLocation);
    googleAuthorizationRedirectUri = providerUrl.searchParams.get("redirect_uri");
    const googleResponse = await fetch(providerUrl, { redirect: "follow" });
    const googlePage = await googleResponse.text();
    googleRedirectCheck = {
      status: googleResponse.status,
      redirectUriMismatch: /redirect_uri_mismatch/i.test(googlePage),
    };
  } catch {
    /* report whether the callback is available without exposing provider URLs */
  }
}
console.log(JSON.stringify({
  emailAuthEnabled: Boolean(settings.external?.email),
  googleProviderEnabled: Boolean(settings.external?.google),
  signupDisabled: Boolean(settings.disable_signup),
  emailAutoConfirm: Boolean(settings.mailer_autoconfirm),
  siteUrl: settings.site_url || null,
  redirectUrlAllowList: settings.uri_allow_list || null,
  localRedirect: authorizationResponse.ok || authorizationResponse.status === 302
    ? localRedirect
    : `Rejected (HTTP ${authorizationResponse.status})`,
  googleAuthorizationRedirectUri,
  googleRedirectCheck,
}, null, 2));
