import { createClient } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "./_generated/dataModel";
import { components } from "./_generated/api";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    database: authComponent.adapter(ctx),
    baseURL: process.env.CONVEX_SITE_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, token }) => {
        const apiKey = process.env.RESEND_API_KEY;
        const from = process.env.EMAIL_FROM;
        const siteUrl = process.env.SITE_URL;

        if (!apiKey || !from || !siteUrl) {
          throw new Error("Password reset email is not configured. Set RESEND_API_KEY, EMAIL_FROM, and SITE_URL in Convex environment variables.");
        }

        const resetUrl = new URL("/", siteUrl);
        resetUrl.searchParams.set("reset-password", "1");
        resetUrl.searchParams.set("token", token);
        const safeUrl = resetUrl.toString()
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from,
            to: [user.email],
            subject: "Reset your Kinda password",
            html: `
              <div style="font-family:Arial,sans-serif;line-height:1.6;color:#25231f;max-width:520px;margin:0 auto;padding:28px">
                <h1 style="font-size:28px;margin-bottom:8px">Reset your password</h1>
                <p>We received a request to reset the password for your Kinda account.</p>
                <p><a href="${safeUrl}" style="display:inline-block;background:#d96c3b;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px">Choose a new password</a></p>
                <p>If you did not request this, you can safely ignore this email.</p>
                <p style="font-size:12px;color:#777">For your security, this link will expire.</p>
              </div>
            `
          })
        });

        if (!response.ok) {
          const details = await response.text().catch(() => "");
          console.error("Kinda password reset email failed:", response.status, details);
          throw new Error("We couldn't send the password reset email. Please try again later.");
        }
      }
    },
    trustedOrigins: [process.env.SITE_URL ?? "http://localhost:5173"],
    plugins: [
      crossDomain({ siteUrl: process.env.SITE_URL ?? "http://localhost:5173" }),
      convex({ authConfig })
    ]
  });

export const { getAuthUser } = authComponent.clientApi();
