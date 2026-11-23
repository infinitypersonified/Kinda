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
  let streakRemindersSent = 0;
  let occurrencesCreated = 0;
  const now = Date.now();

  const push = async (
    userId: string,
    title: string,
    body: string,
    tag: string,
    extra: Record<string, unknown> = {},
  ) => {
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!publicKey || !privateKey) return false;
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") || "mailto:hello@kinda.app",
      publicKey,
      privateKey,
    );
    const { data: subscriptions } = await db.from("push_subscriptions")
      .select("endpoint,p256dh,auth").eq("user_id", userId);
    let delivered = false;
    await Promise.all((subscriptions || []).map(async (subscription) => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, JSON.stringify({ title, body, tag, url: "/", ...extra }));
        delivered = true;
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
    return delivered;
  };

  const dueTasks = [];
  for (let offset = 0; ; offset += 500) {
    const { data: page, error } = await db.from("tasks").select(
      "id,user_id,title,reminder_at,reminder_sent_for,done",
    ).not("reminder_at", "is", null).lte(
      "reminder_at",
      new Date(now).toISOString(),
    ).gte("reminder_at", new Date(now - 420000).toISOString()).eq("done", false)
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
  if (new Date(now).getUTCHours() >= 5 && new Date(now).getUTCHours() <= 9) {
    const { data: subscriptions, error: subscriptionsError } = await db.from(
      "push_subscriptions",
    ).select("user_id");
    if (subscriptionsError) {
      await releaseLock();
      return Response.json({ error: subscriptionsError.message }, {
        status: 500,
      });
    }

    const userIds = [...new Set((subscriptions || []).map((row) => row.user_id))];
    for (const userId of userIds) {
      const { data: lastLog, error: logError } = await db.from("streak_log")
        .select("day,streak_current,qualified,tz_offset").eq("user_id", userId)
        .order("day", { ascending: false }).limit(1).maybeSingle();
      if (logError) {
        await releaseLock();
        return Response.json({ error: logError.message }, { status: 500 });
      }
      if (!lastLog) continue;

      const tzOffset = Number(lastLog.tz_offset) || 0;
      const localNow = new Date(now - tzOffset * 60000);
      if (localNow.getUTCHours() !== 20 || localNow.getUTCMinutes() >= 10) {
        continue;
      }
      const today = localNow.toISOString().slice(0, 10);
      const yesterday = addDays(today, -1);
      if (
        lastLog.day !== today &&
        (lastLog.day !== yesterday || !lastLog.qualified)
      ) continue;
      const currentStreak = Math.max(
        0,
        lastLog.streak_current -
          (lastLog.day === today && lastLog.qualified ? 1 : 0),
      );
      if (currentStreak <= 0) continue;

      const { data: alreadySent, error: sentCheckError } = await db.from(
        "streak_push_reminders",
      ).select("day").eq("user_id", userId).maybeSingle();
      if (sentCheckError) {
        await releaseLock();
        return Response.json({ error: sentCheckError.message }, {
          status: 500,
        });
      }
      if (alreadySent?.day === today) continue;

      const dayStart = new Date(
        Date.parse(`${today}T00:00:00Z`) + tzOffset * 60000,
      ).toISOString();
      const dayEnd = new Date(
        Date.parse(`${today}T00:00:00Z`) + (tzOffset + 1440) * 60000,
      ).toISOString();
      const { data: todayTasks, error: todayTasksError } = await db.from(
        "tasks",
      ).select("due_date,created_at,done,moved_from").eq("user_id", userId)
        .or(
          `due_date.eq.${today},and(due_date.is.null,created_at.gte.${dayStart},created_at.lt.${dayEnd}),moved_from.cs.{${today}}`,
        );
      if (todayTasksError) {
        await releaseLock();
        return Response.json({ error: todayTasksError.message }, {
          status: 500,
        });
      }

      let total = 0;
      let done = 0;
      for (const task of todayTasks || []) {
        const taskDay = task.due_date ||
          new Date(Date.parse(task.created_at) - tzOffset * 60000)
            .toISOString().slice(0, 10);
        if (taskDay === today) {
          total++;
          if (task.done) done++;
        }
        for (const moved of task.moved_from || []) {
          if (moved === today && moved !== taskDay) total++;
        }
      }
      if (total >= 5 && done * 100 >= total * 80) continue;

      const planNeeded = Math.max(0, 5 - total);
      const doneNeeded = Math.max(
        0,
        Math.ceil(Math.max(5, total) * 0.8) - done,
      );
      const actions = [];
      if (planNeeded) {
        actions.push(
          `add ${planNeeded} more ${planNeeded === 1 ? "task" : "tasks"}`,
        );
      }
      if (doneNeeded) {
        actions.push(
          `finish ${doneNeeded} ${doneNeeded === 1 ? "task" : "tasks"}`,
        );
      }
      const body = `You can ${actions.join(" and ")} today to keep your ${currentStreak}-day streak burning.`;
      const { error: claimError } = await db.from("streak_push_reminders")
        .upsert({
          user_id: userId,
          day: today,
          sent_at: new Date(now).toISOString(),
        }, { onConflict: "user_id" });
      if (claimError) {
        await releaseLock();
        return Response.json({ error: claimError.message }, { status: 500 });
      }
      const delivered = await push(
        userId,
        "Kindle's flame is fading",
        body,
        `streak-risk-${today}`,
        { kind: "streak-risk", mood: "sleepy" },
      );
      if (!delivered) {
        const { error: unclaimError } = await db.from("streak_push_reminders")
          .delete().eq("user_id", userId).eq("day", today);
        if (unclaimError) {
          await releaseLock();
          return Response.json({ error: unclaimError.message }, {
            status: 500,
          });
        }
        continue;
      }
      streakRemindersSent++;
    }
  }

  const nextDate = (key: string, repeat: string) => {
    if (repeat.startsWith("custom:")) {
      const wanted = repeat.slice(7).split(",").map(Number);
      let candidate = addDays(key, 1);
      for (let step = 0; step < 7; step++) {
        const day = new Date(`${candidate}T00:00:00Z`).getUTCDay();
        if (wanted.includes((day + 6) % 7 + 1)) return candidate;
        candidate = addDays(candidate, 1);
      }
      return addDays(key, 7);
    }
    let date = addDays(key, repeat === "weekly" ? 7 : 1);
    if (repeat === "weekdays") {
      while ([0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())) {
        date = addDays(date, 1);
      }
    }
    return date;
  };
  const todayKey = new Date().toISOString().slice(0, 10);
  const horizon = addDays(todayKey, 3);
  // A scheduler outage can leave the latest occurrence overdue by more than a
  // few days. Include the full series history, then process only its latest
  // occurrence so it can recover and create the next upcoming task.
  const recurring = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page, error } = await db.from("tasks").select(
      "id,user_id,title,description,category,due_date,priority,visibility,target_minutes,shared_with,repeat,reminder_time,tz_offset,series_id",
    ).neq("repeat", "none").not("due_date", "is", null).lte(
      "due_date",
      horizon,
    ).order("due_date", { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + 999);
    if (error) {
      await releaseLock();
      return Response.json({ error: error.message }, { status: 500 });
    }
    recurring.push(...(page || []));
    if (!page || page.length < 1000) break;
  }
  const latestBySeries = new Map();
  for (const task of recurring) {
    const key = task.series_id || task.id;
    latestBySeries.set(key, task);
  }
  for (const task of latestBySeries.values()) {
    const seriesId = task.series_id || task.id;
    const { data: root } = await db.from("tasks").select("repeat").eq(
      "id",
      seriesId,
    ).maybeSingle();
    if (!root || root.repeat === "none") continue;
    const dueDate = nextDate(task.due_date, task.repeat);
    if (dueDate > horizon) continue;
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
    // Deletion can stop a series while this scheduler run is in flight. Check
    // the root again before leaving a newly inserted task behind.
    const { data: currentRoot } = await db.from("tasks").select("repeat")
      .eq("id", seriesId).maybeSingle();
    if (!currentRoot || currentRoot.repeat === "none") {
      await db.from("tasks").delete().eq("id", occurrence.id);
      continue;
    }
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

  // Challenge days: make sure every member has today's challenge tasks.
  // Runs every ten minutes, which is plenty and keeps database use low.
  if (new Date(now).getUTCMinutes() % 10 === 0) {
    try {
      const todayKey = new Date(now).toISOString().slice(0, 10);
      const oldest = new Date(now - 61 * 86400000).toISOString().slice(0, 10);
      const { data: challenges } = await db.from("challenges").select(
        "id,starts_on,days,daily_tasks",
      ).lte("starts_on", todayKey).gte("starts_on", oldest);
      for (const challenge of challenges || []) {
        const day = Math.round(
          (Date.parse(`${todayKey}T00:00:00Z`) -
            Date.parse(`${challenge.starts_on}T00:00:00Z`)) / 86400000,
        ) + 1;
        if (day < 1 || day > challenge.days) continue;
        const { data: members } = await db.from("challenge_members").select(
          "user_id",
        ).eq("challenge_id", challenge.id);
        for (const member of members || []) {
          const { data: have } = await db.from("tasks").select("title").eq(
            "user_id",
            member.user_id,
          ).eq("challenge_id", challenge.id).eq("due_date", todayKey);
          const titles = new Set((have || []).map((row) => row.title));
          const missing = (challenge.daily_tasks as string[]).filter((title) =>
            !titles.has(title)
          );
          if (missing.length) {
            await db.from("tasks").insert(missing.map((title) => ({
              user_id: member.user_id,
              title,
              category: "Personal",
              due_date: todayKey,
              challenge_id: challenge.id,
            })));
          }
        }
      }
    } catch (_error) {
      // Challenge tasks are retried on the next run.
    }
  }

  await releaseLock();
  return Response.json({
    ok: true,
    remindersSent,
    streakRemindersSent,
    occurrencesCreated,
  });
});
