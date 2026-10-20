import { createClient } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "./_generated/dataModel";
import { components } from "./_generated/api";
import authConfig from "./auth.config";
import { sendEmail } from "./mailer";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    database: authComponent.adapter(ctx),
    baseURL: process.env.CONVEX_SITE_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    socialProviders: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
      google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
    } : undefined,
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, token }) => {
        const siteUrl = process.env.SITE_URL;
        if (!siteUrl) throw new Error("Password reset is not configured. Set SITE_URL in the Convex environment variables.");

        const resetUrl = new URL("/", siteUrl);
        resetUrl.searchParams.set("reset-password", "1");
        resetUrl.searchParams.set("token", token);
        const safeUrl = resetUrl.toString()
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

        await sendEmail({
          to: user.email,
          subject: "Reset your Kinda password",
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#25231f;max-width:520px;margin:0 auto;padding:28px">
              <h1 style="font-size:28px;margin-bottom:8px">Reset your password</h1>
              <p>We received a request to reset the password for your Kinda account.</p>
              <p><a href="${safeUrl}" style="display:inline-block;background:#c25a2c;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px">Choose a new password</a></p>
              <p>If you did not request this, you can safely ignore this email.</p>
              <p style="font-size:12px;color:#777">For your security, this link will expire.</p>
            </div>
          `
        });
      }
    },
    trustedOrigins: [process.env.SITE_URL ?? "http://localhost:5173"],
    plugins: [
      crossDomain({ siteUrl: process.env.SITE_URL ?? "http://localhost:5173" }),
      convex({ authConfig })
    ]
  });

export const { getAuthUser } = authComponent.clientApi();
