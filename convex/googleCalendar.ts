import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

export const sync = internalAction({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    let links: Array<{ taskId: Id<"tasks">; eventId: string; title: string; description: string; dueDate: string }> = [];
    let accessToken: string | undefined;
    let expiresIn: number | undefined;
    try {
      const snapshot = await ctx.runQuery(internal.workspace.googleCalendarSyncData, { userId });
      if (!snapshot.credentials) throw new Error("Google Calendar is no longer connected.");
      const credential = snapshot.credentials;
      accessToken = credential.accessToken;
      if (credential.accessTokenExpiresAt < Date.now() + 60_000) {
        const refreshed = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", refresh_token: credential.refreshToken, grant_type: "refresh_token" }) });
        const tokens = await refreshed.json();
        if (!refreshed.ok || !tokens.access_token) throw new Error("Google authorization expired. Reconnect Google Calendar in Settings.");
        accessToken = tokens.access_token;
        expiresIn = tokens.expires_in;
      }
      const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
      const prior = new Map(snapshot.links.map(link => [String(link.taskId), link]));
      const activeTasks = snapshot.tasks.filter(task => task.dueDate);
      const activeIds = new Set(activeTasks.map(task => String(task._id)));
      for (const old of snapshot.links) {
        if (!activeIds.has(String(old.taskId))) {
          await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(old.eventId)}`, { method: "DELETE", headers }).catch(() => {});
        }
      }
      for (const task of activeTasks) {
        const old = prior.get(String(task._id));
        const title = task.title;
        const description = task.description || "";
        const date = task.dueDate as string;
        const oldChanged = old && (old.lastTitle !== title || old.lastDescription !== description || old.lastDueDate !== date);
        if (!old) {
          const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", { method: "POST", headers, body: JSON.stringify({ summary: title, description, start: { date }, end: { date: new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10) }, extendedProperties: { private: { kindaTaskId: String(task._id) } } }) });
          const event = await response.json();
          if (!response.ok || !event.id) throw new Error(event.error?.message || "Could not create a Google Calendar task.");
          links.push({ taskId: task._id, eventId: event.id, title, description, dueDate: date });
          continue;
        }
        if (oldChanged) {
          const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(old.eventId)}`, { method: "PUT", headers, body: JSON.stringify({ summary: title, description, start: { date }, end: { date: new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10) }, extendedProperties: { private: { kindaTaskId: String(task._id) } } }) });
          if (!response.ok) throw new Error("Could not update a Google Calendar task.");
          links.push({ taskId: task._id, eventId: old.eventId, title, description, dueDate: date });
        } else {
          const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(old.eventId)}` , { headers });
          if (!response.ok) throw new Error("A linked Google Calendar task was removed. Reconnect or retry sync.");
          const event = await response.json();
          const googleDate = event.start?.date;
          const googleTitle = event.summary || "";
          const googleDescription = event.description || "";
          if (googleDate && (googleDate !== old.lastDueDate || googleTitle !== old.lastTitle || googleDescription !== old.lastDescription)) {
            const update = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(old.eventId)}`, { method: "PUT", headers, body: JSON.stringify({ ...event, summary: googleTitle, description: googleDescription, start: { date: googleDate }, end: { date: new Date(new Date(`${googleDate}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10) } }) });
            if (!update.ok) throw new Error("Could not sync the edited calendar task.");
            await ctx.runMutation(internal.workspace.applyGoogleCalendarTask, { taskId: task._id, title: googleTitle, description: googleDescription, dueDate: googleDate });
            links.push({ taskId: task._id, eventId: old.eventId, title: googleTitle, description: googleDescription, dueDate: googleDate });
          } else links.push({ taskId: task._id, eventId: old.eventId, title, description, dueDate: date });
        }
      }
      await ctx.runMutation(internal.workspace.saveGoogleCalendarSync, { userId, links, ...(accessToken !== credential.accessToken ? { accessToken, expiresIn } : {}) });
    } catch (error) {
      await ctx.runMutation(internal.workspace.saveGoogleCalendarSync, { userId, links, error: error instanceof Error ? error.message : "Google Calendar sync failed." });
    }
  }
});
