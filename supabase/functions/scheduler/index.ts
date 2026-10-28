import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import type { ApiDatabase } from "../_shared/database.ts";

function supabaseSecretKey() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const keys = JSON.parse(secretKeys) as Record<string, string>;
      if (keys.default) return keys.default;
    } catch {
      // Fall back to legacy/local environment names below.
    }
  }
  return Deno.env.get("SUPABASE_SECRET_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

let serviceClient: ReturnType<typeof createClient<ApiDatabase>> | null = null;
function getServiceClient(): ReturnType<typeof createClient<ApiDatabase>> | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = supabaseSecretKey();
  if (!url || !key) return null;
  serviceClient ??= createClient<ApiDatabase>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

Deno.serve({ automaticCompression: true }, async (request) => {
  const configuredSecret = Deno.env.get("KINDA_SCHEDULER_SECRET");
  if (
    !configuredSecret ||
    request.headers.get("x-kinda-scheduler-secret") !== configuredSecret
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = getServiceClient();
  if (!db) {
    return Response.json({ error: "Scheduler is not configured." }, {
      status: 503,
    });
  }
  // Only one run at a time. A slow run used to overlap the next minute's run,
  // and both created the same day's copy of every repeating task.
  const lockedUntil = new Date(Date.now() + 120_000).toISOString();
  const { data: lock, error: lockError } = await db.from("scheduler_lock")
    .update({ locked_until: lockedUntil }).eq("id", 1)
    .lt("locked_until", new Date().toISOString()).select("id");
  if (!lockError && !lock?.length) {
    return Response.json({ ok: true, skipped: "another run is in progress" });
  }
  const releaseLock = async () => {
    if (lockError) return;
    await db.from("scheduler_lock").update({
      locked_until: "1970-01-01T00:00:00Z",
    }).eq("id", 1);
  };
  let remindersSent = 0;
  let occurrencesCreated = 0;
  const now = Date.now();

  const push = async (
    userId: string,
    title: string,
    body: string,
    tag: string,
  ) => {
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    if (publicKey && privateKey) {
      webpush.setVapidDetails(
        Deno.env.get("VAPID_SUBJECT") || "mailto:hello@kinda.app",
        publicKey,
        privateKey,
      );
      const { data: subscriptions } = await db.from("push_subscriptions")
        .select("endpoint,p256dh,auth").eq("user_id", userId);
      await Promise.all((subscriptions || []).map(async (subscription) => {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          }, JSON.stringify({ title, body, tag, url: "/" }));
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await db.from("push_subscriptions").delete().eq(
              "endpoint",
              subscription.endpoint,
            );
          }
        }
      }));
    }
  };

  const dueTasks = [];
  for (let offset = 0; ; offset += 500) {
    const { data: page, error } = await db.from("tasks").select(
      "id,user_id,title,reminder_at,reminder_sent_for,done",
    ).not("reminder_at", "is", null).lte(
      "reminder_at",
      new Date(now).toISOString(),
    ).gte("reminder_at", new Date(now - 120000).toISOString()).eq("done", false)
      .order("reminder_at", { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + 499);
    if (error) {
      await releaseLock();
      return Response.json({ error: error.message }, { status: 500 });
    }
    dueTasks.push(...(page || []));
    if (!page || page.length < 500) break;
  }
  for (const task of dueTasks) {
    if (
      task.reminder_sent_for &&
      Date.parse(task.reminder_sent_for) >= Date.parse(task.reminder_at)
    ) continue;
    const [{ error: markError }, { data: telegram }] = await Promise.all([
      db.from("tasks").update({ reminder_sent_for: task.reminder_at }).eq(
        "id",
        task.id,
      ).eq("done", false),
      db.from("telegram_links").select("chat_id").eq("user_id", task.user_id)
        .maybeSingle(),
    ]);
    if (markError) continue;
    await push(task.user_id, "Reminder", task.title, `reminder-${task.id}`);
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (botToken && telegram?.chat_id) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegram.chat_id,
          text: `Kinda reminder: ${task.title}`,
        }),
      }).catch(() => {});
    }
    remindersSent++;
  }

  const addDays = (key: string, amount: number) => {
    const date = new Date(`${key}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  };
  const nextDate = (key: string, repeat: string) => {
    let date = addDays(key, repeat === "weekly" ? 7 : 1);
    if (repeat === "weekdays") {
      while ([0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())) {
        date = addDays(date, 1);
      }
    }
    return date;
  };
  const todayKey = new Date().toISOString().slice(0, 10);
  const horizon = addDays(todayKey, 8);
  // Only recent occurrences can still need a next one. Without a lower bound
  // this scanned every past occurrence of every repeating task, with several
  // queries each, once a minute.
  const earliest = addDays(todayKey, -3);
  const recurring = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page, error } = await db.from("tasks").select(
      "id,user_id,title,description,category,due_date,priority,visibility,target_minutes,shared_with,repeat,reminder_time,tz_offset,series_id",
    ).neq("repeat", "none").not("due_date", "is", null).gte(
      "due_date",
      earliest,
    ).lte(
      "due_date",
      horizon,
    ).order("id", { ascending: true }).range(offset, offset + 999);
    if (error) {
      await releaseLock();
      return Response.json({ error: error.message }, { status: 500 });
    }
    recurring.push(...(page || []));
    if (!page || page.length < 1000) break;
  }
  for (const task of recurring) {
    const seriesId = task.series_id || task.id;
    const { data: root } = await db.from("tasks").select("repeat").eq(
      "id",
      seriesId,
    ).maybeSingle();
    if (!root || root.repeat === "none") continue;
    const dueDate = nextDate(task.due_date, task.repeat);
    const { data: existing } = await db.from("tasks").select("id").eq(
      "series_id",
      seriesId,
    ).eq("due_date", dueDate).limit(1);
    if (existing?.length) continue;
    if (!task.series_id) {
      await db.from("tasks").update({ series_id: seriesId }).eq("id", task.id);
    }
    const reminderAt = task.reminder_time
      ? (() => {
        const [hours, minutes] = task.reminder_time.split(":").map(Number);
        const [year, month, day] = dueDate.split("-").map(Number);
        return new Date(
          Date.UTC(year, month - 1, day, hours, minutes) +
            (task.tz_offset || 0) * 60000,
        ).toISOString();
      })()
      : null;
    const { data: occurrence, error } = await db.from("tasks").insert({
      user_id: task.user_id,
      title: task.title,
      description: task.description,
      category: task.category,
      due_date: dueDate,
      priority: task.priority,
      visibility: task.visibility,
      target_minutes: task.target_minutes,
      shared_with: task.shared_with,
      repeat: task.repeat,
      reminder_time: task.reminder_time,
      reminder_at: reminderAt,
      tz_offset: task.tz_offset,
      series_id: seriesId,
    }).select("id").single();
    if (error) continue;
    const { data: links } = await db.from("circle_tasks").select(
      "circle_id,shared_by",
    ).eq("task_id", task.id);
    if (links?.length) {
      await db.from("circle_tasks").insert(
        links.map((link) => ({
          circle_id: link.circle_id,
          task_id: occurrence.id,
          shared_by: link.shared_by,
        })),
      );
    }
    occurrencesCreated++;
  }

  await releaseLock();
  return Response.json({ ok: true, remindersSent, occurrencesCreated });
});
