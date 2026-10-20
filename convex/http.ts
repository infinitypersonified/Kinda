import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { internal } from "./_generated/api";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

const calendarFeed = httpAction(async (ctx, request) => {
  const token = new URL(request.url).pathname.split("/").filter(Boolean).at(-1)?.replace(/\.ics$/, "") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response("Not found", { status: 404 });
  const tasks = await ctx.runQuery(internal.workspace.calendarFeedData, { token });
  if (!tasks) return new Response("Not found", { status: 404 });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const events = tasks.map(task => {
    const start = task.dueDate.replaceAll("-", "");
    const end = new Date(`${task.dueDate}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const endKey = end.toISOString().slice(0, 10).replaceAll("-", "");
    return [
      "BEGIN:VEVENT", `UID:${task.id}@kinda.app`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${endKey}`,
      `SUMMARY:${escapeIcs(task.title)}`,
      `DESCRIPTION:${escapeIcs([task.description, task.done ? "Completed in Kinda" : ""].filter(Boolean).join("\n"))}`,
      "STATUS:CONFIRMED", "END:VEVENT"
    ].filter(Boolean).join("\r\n");
  }).join("\r\n");
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kinda//Task calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", events, "END:VCALENDAR"].filter(Boolean).join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, no-store" } });
});

const telegramWebhook = httpAction(async (ctx, request) => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret || request.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }
  let update: { message?: { text?: string; chat?: { id?: number | string } } };
  try { update = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
  const message = update.message;
  const match = message?.text?.match(/^\/start\s+([a-f0-9]{64})$/);
  const chatId = message?.chat?.id;
  if (!match || chatId === undefined) return new Response("OK");
  const linked = await ctx.runMutation(internal.workspace.completeTelegramLink, { token: match[1], chatId: String(chatId) });
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: linked ? "Kinda reminders are connected. We’ll send your task reminders here." : "That Kinda link expired. Create a fresh Telegram link in Settings." })
    }).catch(() => {});
  }
  return new Response("OK");
});

const googleCalendarCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const siteUrl = process.env.SITE_URL ?? "https://example.com";
  const finish = (status: string) => Response.redirect(`${siteUrl.replace(/\/$/, "")}/?google-calendar=${status}`, 302);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return finish("error");
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: `${process.env.CONVEX_SITE_URL}/google-calendar/callback`, grant_type: "authorization_code" }) });
    const tokens = await response.json();
    if (!response.ok || !tokens.access_token || !tokens.refresh_token) return finish("error");
    const saved = await ctx.runMutation(internal.workspace.consumeGoogleCalendarState, { state, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresIn: tokens.expires_in ?? 3600 });
    return finish(saved ? "connected" : "error");
  } catch { return finish("error"); }
});

http.route({ pathPrefix: "/calendar/", method: "GET", handler: calendarFeed });
http.route({ path: "/telegram/webhook", method: "POST", handler: telegramWebhook });
http.route({ path: "/google-calendar/callback", method: "GET", handler: googleCalendarCallback });

export default http;
