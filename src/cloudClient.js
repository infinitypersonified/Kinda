import { ConvexReactClient } from "convex/react";
import { createAuthClient } from "better-auth/react";
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";

export function createCloudClients() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim().replace(/\/+$/, "");
  const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL?.trim().replace(/\/+$/, "");
  if (!convexUrl || !convexSiteUrl) return null;
  const convex = new ConvexReactClient(convexUrl);
  const authClient = createAuthClient({
    baseURL: convexSiteUrl,
    plugins: [convexClient(), crossDomainClient()]
  });
  return { convex, authClient };
}
