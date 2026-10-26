import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") || "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const TASK_COLUMNS = "id,title,description,category,due_date,priority,visibility,target_minutes,elapsed_seconds,timer_started_at,done,completed_at,repeat,reminder_time,created_at,assignment_id,assigned_by_name,shared_with,series_id,moved_from";
const TASK_RECORD_COLUMNS = `${TASK_COLUMNS},reminder_at,reminder_sent_for,tz_offset`;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

let serviceClient: any = null;
function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const secret = supabaseSecretKey();
  if (!url || !secret) fail("The Supabase API is not configured.", 503);
  serviceClient ??= createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

async function redisCommand(command: (string | number)[]) {
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL")?.replace(/\/+$/, "");
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) return null;
  try {
    const result = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });
    if (!result.ok) return null;
    const payload = await result.json();
    return payload.error ? null : payload.result ?? null;
  } catch {
    return null;
  }
}

async function digestCacheKey(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

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

Deno.serve({ automaticCompression: true }, async (request: Request) => {
  let response: (status: number, body: unknown) => Response | Promise<Response> =
    jsonResponse;
  let responseMethod = "";
  let cacheKey: string | null = null;
  let cacheHit = false;
  const requestedCacheTtl = Number(Deno.env.get("API_CACHE_TTL_SECONDS") || 5);
  const cacheTtl = Number.isFinite(requestedCacheTtl)
    ? Math.min(30, Math.max(1, requestedCacheTtl))
    : 5;
  response = async (status, body) => {
    if (status === 200 && responseMethod === "GET" && cacheKey && !cacheHit) {
      const serialized = JSON.stringify(body);
      if (serialized.length <= 512_000) {
        await redisCommand(["SET", cacheKey, serialized, "EX", cacheTtl]);
      }
    } else if (status >= 200 && status < 400 && responseMethod && responseMethod !== "GET") {
      await redisCommand(["INCR", "kinda:api:cache-generation"]);
    }
    return jsonResponse(status, body);
  };
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const db = getServiceClient();
    const requestPath =
      new URL(request.url).pathname.replace(/^\/functions\/v1\/api/, "") || "/";
    const notifyPush = async (
      userIds: string[],
      payload: { title: string; body: string; tag: string },
    ) => {
      const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
      const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
      if (!publicKey || !privateKey || !userIds.length) return;
      webpush.setVapidDetails(
        Deno.env.get("VAPID_SUBJECT") || "mailto:hello@kinda.app",
        publicKey,
        privateKey,
      );
      const { data: subscriptions } = await db.from("push_subscriptions")
        .select("endpoint,p256dh,auth").in("user_id", [...new Set(userIds)]);
      await Promise.all((subscriptions || []).map(async (subscription) => {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          }, JSON.stringify({ ...payload, url: "/" }));
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
    };

    if (request.method === "GET" && requestPath.startsWith("/calendar/")) {
      const token =
        requestPath.split("/").filter(Boolean).at(-1)?.replace(/\.ics$/, "") ||
        "";
      if (!/^[a-f0-9]{64}$/.test(token)) {
        return new Response("Not found", { status: 404 });
      }
      const { data: feed, error: feedError } = await db.from("calendar_feeds")
        .select("user_id").eq("token", token).maybeSingle();
      if (feedError) throw feedError;
      if (!feed) return new Response("Not found", { status: 404 });
      const { data: tasks, error: tasksError } = await db.from("tasks").select(
        "id,title,description,due_date,done",
      ).eq("user_id", feed.user_id).not("due_date", "is", null);
      if (tasksError) throw tasksError;
      const escapeIcs = (value: string) =>
        value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(
          /,/g,
          "\\,",
        ).replace(/;/g, "\\;");
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(
        /\.\d{3}Z$/,
        "Z",
      );
      const events = (tasks || []).map((task) => {
        const start = String(task.due_date).replaceAll("-", "");
        const end = new Date(`${task.due_date}T00:00:00Z`);
        end.setUTCDate(end.getUTCDate() + 1);
        const summary = escapeIcs(task.title);
        const description = escapeIcs(
          [task.description, task.done ? "Completed in Kinda" : ""].filter(
            Boolean,
          ).join("\n"),
        );
        return [
          "BEGIN:VEVENT",
          `UID:${task.id}@kinda.app`,
          `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${start}`,
          `DTEND;VALUE=DATE:${
            end.toISOString().slice(0, 10).replaceAll("-", "")
          }`,
          `SUMMARY:${summary}`,
          `DESCRIPTION:${description}`,
          "STATUS:CONFIRMED",
          "END:VEVENT",
        ].join("\r\n");
      }).join("\r\n");
      const calendar = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Kinda//Task calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        events,
        "END:VCALENDAR",
      ].join("\r\n");
      return new Response(calendar, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (request.method === "POST" && requestPath === "/telegram/webhook") {
      const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
      if (
        !expectedSecret ||
        request.headers.get("x-telegram-bot-api-secret-token") !==
          expectedSecret
      ) return new Response("Unauthorized", { status: 401 });
      const update = await request.json().catch(() => null);
      const message = update?.message;
      const match = message?.text?.match(/^\/start\s+([a-f0-9]{64})$/);
      const chatId = message?.chat?.id;
      if (!match || chatId === undefined) return new Response("OK");
      const { data: pending } = await db.from("telegram_link_tokens").select(
        "id,user_id,expires_at",
      ).eq("token", match[1]).maybeSingle();
      const valid = pending && Date.parse(pending.expires_at) > Date.now();
      if (valid) {
        const { error: upsertError } = await db.from("telegram_links").upsert({
          user_id: pending.user_id,
          chat_id: String(chatId),
        }, { onConflict: "user_id" });
        if (upsertError) throw upsertError;
        const { error } = await db.from("telegram_link_tokens").delete().eq(
          "user_id",
          pending.user_id,
        );
        if (error) throw error;
      } else if (pending) {
        await db.from("telegram_link_tokens").delete().eq("id", pending.id);
      }
      const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
      if (botToken) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: valid
              ? "Kinda reminders are connected. We'll send your task reminders here."
              : "That Kinda link expired. Create a fresh Telegram link in Settings.",
          }),
        }).catch(() => {});
      }
      return new Response("OK");
    }

    if (
      request.method === "GET" && requestPath === "/google-calendar/callback"
    ) {
      const callbackUrl = `${
        url.replace(/\/$/, "")
      }/functions/v1/api/google-calendar/callback`;
      const destination = Deno.env.get("SITE_URL") || "https://example.com";
      const finish = (status: string) =>
        Response.redirect(
          `${destination.replace(/\/$/, "")}/?google-calendar=${status}`,
          302,
        );
      const callback = new URL(request.url);
      const code = callback.searchParams.get("code");
      const state = callback.searchParams.get("state");
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
      if (!code || !state || !clientId || !clientSecret) return finish("error");
      try {
        const tokenResponse = await fetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: callbackUrl,
              grant_type: "authorization_code",
            }),
          },
        );
        const tokens = await tokenResponse.json();
        if (
          !tokenResponse.ok || !tokens.access_token || !tokens.refresh_token
        ) return finish("error");
        const { data: pending } = await db.from("google_calendar_oauth_states")
          .select("id,user_id,expires_at").eq("state", state).maybeSingle();
        if (!pending || Date.parse(pending.expires_at) <= Date.now()) {
          if (pending) {
            await db.from("google_calendar_oauth_states").delete().eq(
              "id",
              pending.id,
            );
          }
          return finish("error");
        }
        const { error: saveError } = await db.from(
          "google_calendar_credentials",
        ).upsert({
          user_id: pending.user_id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          access_token_expires_at: new Date(
            Date.now() + (tokens.expires_in || 3600) * 1000,
          ).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (saveError) throw saveError;
        await db.from("google_calendar_oauth_states").delete().eq(
          "id",
          pending.id,
        );
        return finish("connected");
      } catch {
        return finish("error");
      }
    }

    const input = await request.json();
    const path = String(input.path || "");
    const method = String(input.method || "GET").toUpperCase();
    responseMethod = method;
    const body = input.body && typeof input.body === "object" ? input.body : {};
    const query = input.query && typeof input.query === "object"
      ? input.query
      : {};
    const pathname = new URL(path, "https://kinda.invalid").pathname;
    const publicInvite = method === "GET" &&
      /^\/invites\/[A-Za-z0-9_-]{32,}$/.test(pathname);
    const bearer = request.headers.get("Authorization")?.match(
      /^Bearer\s+(.+)$/i,
    )?.[1];
    let user: {
      id: string;
      email?: string;
      user_metadata?: Record<string, unknown>;
    } | null = null;
    if (bearer) {
      const { data, error } = await db.auth.getUser(bearer);
      if (!error && data.user) user = data.user;
    }
    if (!user && !publicInvite) fail("You are not signed in.", 401);
    const userId = user?.id || "";
    if (method === "GET" && user && Deno.env.get("UPSTASH_REDIS_REST_URL") && Deno.env.get("UPSTASH_REDIS_REST_TOKEN")) {
      const generation = String(
        await redisCommand(["GET", "kinda:api:cache-generation"]) || "0",
      );
      const normalizedQuery = Object.fromEntries(
        Object.entries(query).sort(([left], [right]) => left.localeCompare(right)),
      );
      const queryHash = await digestCacheKey(JSON.stringify({ path: pathname, query: normalizedQuery }));
      cacheKey = `kinda:api:v1:${generation}:${userId}:${queryHash}`;
      const cached = await redisCommand(["GET", cacheKey]);
      if (typeof cached === "string") {
        try {
          cacheHit = true;
          return response(200, JSON.parse(cached));
        } catch {
          /* Ignore malformed cache entries and read from Postgres. */
        }
      }
    }
    const ensureCircleMember = async (circleId: string) => {
      const { data, error } = await db.from("circle_members").select(
        "user_id,role",
      ).eq("circle_id", circleId).eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (!data) fail("You are not a member of that circle.", 403);
      return data;
    };
    const removeCircleMemberData = async (
      circleId: string,
      targetUserId: string,
    ) => {
      const { data: assignments, error: assignmentsError } = await db.from(
        "assignments",
      ).select("id").eq("circle_id", circleId);
      if (assignmentsError) throw assignmentsError;
      const assignmentIds = (assignments || []).map((row) => row.id);
      if (assignmentIds.length) {
        const { error } = await db.from("tasks").delete().eq(
          "user_id",
          targetUserId,
        ).in("assignment_id", assignmentIds);
        if (error) throw error;
      }
      const [
        { error: linksError },
        { error: typingError },
        { error: memberError },
      ] = await Promise.all([
        db.from("circle_tasks").delete().eq("circle_id", circleId).eq(
          "shared_by",
          targetUserId,
        ),
        db.from("typing").delete().eq("circle_id", circleId).eq(
          "user_id",
          targetUserId,
        ),
        db.from("circle_members").delete().eq("circle_id", circleId).eq(
          "user_id",
          targetUserId,
        ),
      ]);
      if (linksError) throw linksError;
      if (typingError) throw typingError;
      if (memberError) throw memberError;
    };
    const taskToClient = (task: any, groupIds: string[] = []) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      category: task.category,
      dueDate: task.due_date,
      priority: task.priority,
      visibility: task.visibility,
      targetMinutes: task.target_minutes,
      elapsedSeconds: task.elapsed_seconds,
      timerStartedAt: task.timer_started_at,
      done: task.done,
      completedAt: task.completed_at
        ? new Date(task.completed_at).toISOString()
        : null,
      repeat: task.repeat || "none",
      reminderTime: task.reminder_time || "",
      createdAt: Date.parse(task.created_at),
      assignmentId: task.assignment_id,
      assignedByName: task.assigned_by_name,
      sharedWith: task.shared_with || [],
      seriesId: task.series_id,
      movedFrom: task.moved_from || [],
      groupIds,
    });
    const taskWithGroups = async (task: any) => {
      const { data: links, error } = await db.from("circle_tasks").select(
        "circle_id",
      ).eq("task_id", task.id);
      if (error) throw error;
      return taskToClient(task, (links || []).map((row: any) => row.circle_id));
    };
    const tasksWithGroups = async (tasks: any[]) => {
      if (!tasks.length) return [];
      const { data: links, error } = await db.from("circle_tasks").select(
        "task_id,circle_id",
      ).in("task_id", tasks.map((task) => task.id));
      if (error) throw error;
      const groupIdsByTask = new Map<string, string[]>();
      for (const link of links || []) {
        const groupIds = groupIdsByTask.get(link.task_id) || [];
        groupIds.push(link.circle_id);
        groupIdsByTask.set(link.task_id, groupIds);
      }
      return tasks.map((task) =>
        taskToClient(task, groupIdsByTask.get(task.id) || [])
      );
    };
    const validTaskFields = () => {
      const title = String(body.title || "").trim();
      if (!title || title.length > 120) {
        fail("Task titles must be between 1 and 120 characters.");
      }
      const visibility = String(body.visibility || "private");
      const priority = String(body.priority || "normal");
      const targetMinutes = Number(body.targetMinutes || 25);
      if (!["private", "friends"].includes(visibility)) {
        fail("Choose a valid task visibility.");
      }
      if (!["low", "normal", "high"].includes(priority)) {
        fail("Choose a valid priority.");
      }
      if (
        !Number.isInteger(targetMinutes) || targetMinutes < 1 ||
        targetMinutes > 1440
      ) fail("Focus time must be between 1 and 1,440 minutes.");
      const dueDate = body.dueDate == null || body.dueDate === ""
        ? null
        : String(body.dueDate);
      if (
        dueDate &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
          Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`)) ||
          new Date(`${dueDate}T00:00:00Z`).toISOString().slice(0, 10) !==
            dueDate)
      ) {
        fail("Choose a valid task due date.");
      }
      return { title, visibility, priority, targetMinutes, dueDate };
    };

    if (method === "GET" && pathname === "/me") {
      const { data: profile, error } = await db.from("profiles").select(
        "bio,avatar,name,email",
      ).eq("id", userId).maybeSingle();
      if (error) throw error;
      return response(200, {
        id: userId,
        name: profile?.name || user?.user_metadata?.name || "Member",
        email: user?.email,
        bio: profile?.bio || "",
        avatar: profile?.avatar || "",
      });
    }
    if (method === "PATCH" && pathname === "/profile") {
      const name = String(body.name || "").trim();
      const bio = String(body.bio || "").trim();
      if (name.length < 2 || name.length > 60 || bio.length > 240) {
        fail("Check your profile details and try again.");
      }
      const { error } = await db.from("profiles").upsert({
        id: userId,
        name,
        email: user?.email || "",
        bio,
        avatar: String(body.avatar || ""),
      }, { onConflict: "id" });
      if (error) throw error;
      const { error: authError } = await db.auth.admin.updateUserById(userId, {
        user_metadata: { ...(user?.user_metadata || {}), name },
      });
      if (authError) throw authError;
      return response(200, {
        id: userId,
        name,
        email: user?.email,
        bio,
        avatar: String(body.avatar || ""),
      });
    }
    if (method === "GET" && pathname === "/tasks") {
      const requestedPageSize = Number.parseInt(String(query.limit ?? 500), 10);
      const requestedOffset = Number.parseInt(String(query.offset ?? 0), 10);
      const pageSize = Number.isFinite(requestedPageSize)
        ? Math.min(500, Math.max(1, requestedPageSize))
        : 500;
      const offset = Number.isSafeInteger(requestedOffset)
        ? Math.max(0, requestedOffset)
        : 0;
      const { data: tasks, error } = await db.from("tasks").select(TASK_COLUMNS).eq(
        "user_id",
        userId,
      ).order("created_at", { ascending: false }).order("id", { ascending: true }).range(
        offset,
        offset + pageSize - 1,
      );
      if (error) throw error;
      return response(200, await tasksWithGroups(tasks || []));
    }
    if (method === "POST" && pathname === "/tasks") {
      const fields = validTaskFields();
      const groupIds: string[] = [
        ...new Set<string>(
          (Array.isArray(body.groupIds) ? body.groupIds : []).map(String),
        ),
      ];
      for (const circleId of groupIds) await ensureCircleMember(circleId);
      const sharedWith = [
        ...new Set(
          (Array.isArray(body.sharedWith) ? body.sharedWith : []).map(String),
        ),
      ];
      if (sharedWith.includes(userId)) {
        fail("You cannot share a task with yourself.");
      }
      for (const friendId of sharedWith) {
        const { data, error } = await db.from("friendships").select("user_id")
          .eq("user_id", userId).eq("friend_id", friendId).maybeSingle();
        if (error) throw error;
        if (!data) fail("Choose only people who are already your friends.");
      }
      const repeat = String(body.repeat || "none");
      if (!["none", "daily", "weekdays", "weekly"].includes(repeat)) {
        fail("Choose a valid repeat option.");
      }
      const reminderTime = String(body.reminderTime || "");
      if (reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) {
        fail("Choose a valid reminder time.");
      }
      const reminderAt = fields.dueDate && reminderTime
        ? (() => {
          const [year, month, day] = fields.dueDate!.split("-").map(Number);
          const [hours, minutes] = reminderTime.split(":").map(Number);
          return new Date(
            Date.UTC(year, month - 1, day, hours, minutes) +
              Number(body.tzOffset || 0) * 60000,
          ).toISOString();
        })()
        : null;
      const { data: task, error } = await db.from("tasks").insert({
        user_id: userId,
        title: fields.title,
        description: String(body.description || "").trim(),
        category: String(body.category || "Personal"),
        due_date: fields.dueDate,
        priority: fields.priority,
        visibility: sharedWith.length ? "friends" : fields.visibility,
        target_minutes: fields.targetMinutes,
        shared_with: sharedWith,
        repeat,
        reminder_time: reminderTime,
        reminder_at: reminderAt,
        tz_offset: body.tzOffset ?? null,
      }).select(TASK_COLUMNS).single();
      if (error) throw error;
      if (repeat !== "none" && fields.dueDate) {
        const { error: seriesError } = await db.from("tasks").update({
          series_id: task.id,
        }).eq("id", task.id);
        if (seriesError) {
          await db.from("tasks").delete().eq("id", task.id).eq("user_id", userId);
          throw seriesError;
        }
        task.series_id = task.id;
      }
      if (groupIds.length) {
        const links = groupIds.map((circle_id) => ({
          circle_id,
          task_id: task.id,
          shared_by: userId,
        }));
        const { error: linkError } = await db.from("circle_tasks").insert(
          links,
        );
        if (linkError) {
          // Avoid leaving a task that appears created but is not attached to its Circle.
          await db.from("tasks").delete().eq("id", task.id).eq("user_id", userId);
          throw linkError;
        }
      }
      if (sharedWith.length || fields.visibility === "friends") {
        // Activity is secondary; a feed-write failure must not make the client retry
        // an already-created task and accidentally create a duplicate.
        await db.from("activities").insert({
          user_id: userId,
          task_id: task.id,
          type: "created",
        });
      }
      return response(201, await taskWithGroups(task));
    }
    const taskRoute = pathname.match(
      /^\/tasks\/([^/]+)(?:\/(complete|start|stop))?$/,
    );
    if (taskRoute) {
      const [, taskId, action] = taskRoute;
      const { data: task, error } = await db.from("tasks").select(TASK_RECORD_COLUMNS).eq(
        "id",
        taskId,
      ).eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (!task) fail("That task could not be found.", 404);
      if (method === "DELETE" && !action) {
        if (task.assignment_id) {
          fail(
            "This task was assigned by your circle owner, so it can't be deleted.",
          );
        }
        const seriesId = task.series_id ||
          (task.repeat !== "none" ? task.id : null);
        if (seriesId) {
          await db.from("tasks").update({ repeat: "none" }).eq("id", seriesId);
          let remove = db.from("tasks").delete().eq("user_id", userId).eq(
            "series_id",
            seriesId,
          ).eq("done", false);
          if (task.due_date) remove = remove.gte("due_date", task.due_date);
          const { error: occurrencesError } = await remove.neq("id", task.id);
          if (occurrencesError) throw occurrencesError;
        }
        const { error: removeError } = await db.from("tasks").delete().eq(
          "id",
          taskId,
        ).eq("user_id", userId);
        if (removeError) throw removeError;
        return response(200, { ok: true });
      }
      if (method === "PATCH" && !action) {
        if (task.assignment_id) {
          const fields = validTaskFields();
          const groupIds: string[] = [
            ...new Set<string>(
              (Array.isArray(body.groupIds) ? body.groupIds : []).map(String),
            ),
          ];
          const { data: links } = await db.from("circle_tasks").select(
            "circle_id",
          ).eq("task_id", task.id);
          const currentGroups = (links || []).map((link) => link.circle_id);
          const unchanged = fields.title === task.title &&
            String(body.description || "").trim() ===
              (task.description || "") &&
            String(body.category || "Personal") === task.category &&
            fields.priority === task.priority &&
            fields.visibility === task.visibility &&
            fields.targetMinutes === task.target_minutes &&
            String(body.repeat || "none") === task.repeat &&
            String(body.reminderTime || "") === task.reminder_time &&
            groupIds.length === currentGroups.length &&
            groupIds.every((id, index) => id === currentGroups[index]);
          if (!unchanged) {
            fail(
              "This task was assigned by your circle owner, so its details can't be edited.",
            );
          }
          const movedFrom = [...(task.moved_from || [])];
          if (
            !task.done && task.due_date && fields.dueDate !== task.due_date &&
            !movedFrom.includes(task.due_date)
          ) movedFrom.push(task.due_date);
          const reminderAt = fields.dueDate && task.reminder_time
            ? (() => {
              const [year, month, day] = fields.dueDate!.split("-").map(Number);
              const [hours, minutes] = task.reminder_time.split(":").map(
                Number,
              );
              return new Date(
                Date.UTC(year, month - 1, day, hours, minutes) +
                  Number(body.tzOffset || 0) * 60000,
              ).toISOString();
            })()
            : null;
          const { data: updated, error: updateError } = await db.from("tasks")
            .update({
              due_date: fields.dueDate,
              moved_from: movedFrom,
              tz_offset: body.tzOffset ?? null,
              reminder_at: reminderAt,
            }).eq("id", task.id).eq("user_id", userId).select(TASK_COLUMNS).single();
          if (updateError) throw updateError;
          return response(200, await taskWithGroups(updated));
        }
        const fields = validTaskFields();
        const groupIds: string[] = [
          ...new Set<string>(
            (Array.isArray(body.groupIds) ? body.groupIds : []).map(String),
          ),
        ];
        for (const circleId of groupIds) await ensureCircleMember(circleId);
        const sharedWith = [
          ...new Set(
            (Array.isArray(body.sharedWith) ? body.sharedWith : []).map(String),
          ),
        ];
        for (const friendId of sharedWith) {
          const { data, error } = await db.from("friendships").select("user_id")
            .eq("user_id", userId).eq("friend_id", friendId).maybeSingle();
          if (error) throw error;
          if (!data) fail("Choose only people who are already your friends.");
        }
        const repeat = String(body.repeat || "none");
        const reminderTime = String(body.reminderTime || "");
        if (!["none", "daily", "weekdays", "weekly"].includes(repeat)) {
          fail("Choose a valid repeat option.");
        }
        if (reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) {
          fail("Choose a valid reminder time.");
        }
        const movedFrom = [...(task.moved_from || [])];
        if (
          !task.done && task.due_date && fields.dueDate !== task.due_date &&
          !movedFrom.includes(task.due_date)
        ) movedFrom.push(task.due_date);
        const reminderAt = fields.dueDate && reminderTime
          ? (() => {
            const [year, month, day] = fields.dueDate!.split("-").map(Number);
            const [hours, minutes] = reminderTime.split(":").map(Number);
            return new Date(
              Date.UTC(year, month - 1, day, hours, minutes) +
                Number(body.tzOffset || 0) * 60000,
            ).toISOString();
          })()
          : null;
        const { data: updated, error: updateError } = await db.from("tasks")
          .update({
            title: fields.title,
            description: String(body.description || "").trim(),
            category: String(body.category || "Personal"),
            due_date: fields.dueDate,
            priority: fields.priority,
            visibility: sharedWith.length ? "friends" : fields.visibility,
            target_minutes: fields.targetMinutes,
            shared_with: sharedWith,
            repeat,
            reminder_time: reminderTime,
            reminder_at: reminderAt,
            tz_offset: body.tzOffset ?? null,
            moved_from: movedFrom,
          }).eq("id", taskId).eq("user_id", userId).select(TASK_COLUMNS).single();
        if (updateError) throw updateError;
        const seriesId = task.series_id ||
          ((task.repeat !== "none" || repeat !== "none") ? task.id : null);
        if (seriesId) {
          const { error: rootError } = await db.from("tasks").update({
            repeat,
            ...(repeat !== "none" && fields.dueDate
              ? { series_id: seriesId }
              : {}),
          }).eq("id", seriesId);
          if (rootError) throw rootError;
          if (repeat === "none") {
            let remove = db.from("tasks").delete().eq("user_id", userId).eq(
              "series_id",
              seriesId,
            ).eq("done", false);
            if (fields.dueDate) remove = remove.gte("due_date", fields.dueDate);
            const { error } = await remove.neq("id", taskId);
            if (error) throw error;
            const { error: clearSeriesError } = await db.from("tasks").update({
              series_id: null,
            }).eq("id", taskId);
            if (clearSeriesError) throw clearSeriesError;
          } else if (fields.dueDate) updated.series_id = seriesId;
        }
        const { error: unlinkError } = await db.from("circle_tasks").delete()
          .eq("task_id", taskId).eq("shared_by", userId);
        if (unlinkError) throw unlinkError;
        if (groupIds.length) {
          const { error: linkError } = await db.from("circle_tasks").insert(
            groupIds.map((circle_id) => ({
              circle_id,
              task_id: taskId,
              shared_by: userId,
            })),
          );
          if (linkError) throw linkError;
        }
        return response(200, await taskWithGroups(updated));
      }
      if (method === "POST" && action) {
        const now = Date.now();
        if (action === "start") {
          if (task.done) fail("Reopen this task before starting its timer.");
          const { data: running, error: listError } = await db.from("tasks")
            .select("id,elapsed_seconds,timer_started_at").eq("user_id", userId)
            .not("timer_started_at", "is", null);
          if (listError) throw listError;
          for (const item of running || []) {
            if (item.id !== task.id) {
              const elapsed = Math.max(
                0,
                Math.floor((now - Date.parse(item.timer_started_at)) / 1000),
              );
              const { error: pauseError } = await db.from("tasks").update({
                elapsed_seconds: item.elapsed_seconds + elapsed,
                timer_started_at: null,
              }).eq("id", item.id);
              if (pauseError) throw pauseError;
            }
          }
          if (!task.timer_started_at) {
            const { data: updated, error: updateError } = await db.from("tasks")
              .update({ timer_started_at: new Date(now).toISOString() }).eq(
                "id",
                task.id,
              ).select(TASK_COLUMNS).single();
            if (updateError) throw updateError;
            return response(200, await taskWithGroups(updated));
          }
        } else if (action === "stop") {
          if (task.timer_started_at) {
            const elapsed = Math.max(
              0,
              Math.floor((now - Date.parse(task.timer_started_at)) / 1000),
            );
            const { data: updated, error: updateError } = await db.from("tasks")
              .update({
                elapsed_seconds: task.elapsed_seconds + elapsed,
                timer_started_at: null,
              }).eq("id", task.id).select(TASK_COLUMNS).single();
            if (updateError) throw updateError;
            return response(200, await taskWithGroups(updated));
          }
        } else {
          const done = Boolean(body.done);
          const elapsed = task.timer_started_at
            ? Math.max(
              0,
              Math.floor((now - Date.parse(task.timer_started_at)) / 1000),
            )
            : 0;
          const { data: updated, error: updateError } = await db.from("tasks")
            .update({
              done,
              completed_at: done ? new Date(now).toISOString() : null,
              elapsed_seconds: task.elapsed_seconds + elapsed,
              timer_started_at: null,
            }).eq("id", task.id).select(TASK_COLUMNS).single();
          if (updateError) throw updateError;
          if (done && !task.done) {
            const { error: activityError } = await db.from("activities").insert(
              { user_id: userId, task_id: task.id, type: "completed" },
            );
            if (activityError) throw activityError;
          }
          return response(200, await taskWithGroups(updated));
        }
        return response(200, await taskWithGroups(task));
      }
    }
    const assignmentDelete = pathname.match(/^\/assignments\/([^/]+)$/);
    if (assignmentDelete && method === "DELETE") {
      const { data: assignment, error } = await db.from("assignments").select(
        "id,circle_id",
      ).eq("id", assignmentDelete[1]).maybeSingle();
      if (error) throw error;
      if (!assignment) fail("That assignment could not be found.", 404);
      const role = await ensureCircleMember(assignment.circle_id);
      if (role.role !== "owner" && role.role !== "admin") {
        fail("Only circle admins can remove assignments.", 403);
      }
      const { error: taskError } = await db.from("tasks").delete().eq(
        "assignment_id",
        assignment.id,
      );
      if (taskError) throw taskError;
      const { error: deleteError } = await db.from("assignments").delete().eq(
        "id",
        assignment.id,
      );
      if (deleteError) throw deleteError;
      return response(200, { ok: true });
    }

    if (method === "GET" && pathname === "/groups") {
      const { data: memberRows, error } = await db.from("circle_members")
        .select("circle_id,role").eq("user_id", userId);
      if (error) throw error;
      const ownMemberships = (memberRows || []) as Array<{ circle_id: string }>;
      const circleIds = [...new Set(ownMemberships.map((row) => row.circle_id))];
      if (!circleIds.length) return response(200, []);
      const [circlesResult, membersResult, linksResult] = await Promise.all([
        db.from("circles").select("id,name,owner_id").in("id", circleIds),
        db.from("circle_members").select("circle_id,user_id,role").in(
          "circle_id",
          circleIds,
        ),
        db.from("circle_tasks").select("circle_id,task_id,shared_by").in(
          "circle_id",
          circleIds,
        ),
      ]);
      if (circlesResult.error) throw circlesResult.error;
      if (membersResult.error) throw membersResult.error;
      if (linksResult.error) throw linksResult.error;
      type CircleRow = { id: string; name: string; owner_id: string };
      type CircleMemberRow = { circle_id: string; user_id: string; role: string };
      type CircleTaskLink = { circle_id: string; task_id: string; shared_by: string };
      type CountTaskRow = { id: string; user_id: string; done: boolean };
      type CircleProfileRow = { id: string; name?: string; avatar?: string };
      const circleRows = (circlesResult.data || []) as CircleRow[];
      const allMembers = (membersResult.data || []) as CircleMemberRow[];
      const links = (linksResult.data || []) as CircleTaskLink[];
      const taskIds = [...new Set(links.map((row) => row.task_id))];
      const profileIds = [...new Set(allMembers.map((row) => row.user_id))];
      const [tasksResult, profilesResult] = await Promise.all([
        taskIds.length
          ? db.from("tasks").select("id,user_id,done").in("id", taskIds)
          : Promise.resolve({ data: [], error: null }),
        profileIds.length
          ? db.from("profiles").select("id,name,avatar").in("id", profileIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (tasksResult.error) throw tasksResult.error;
      if (profilesResult.error) throw profilesResult.error;
      const taskRows = (tasksResult.data || []) as CountTaskRow[];
      const profileRows = (profilesResult.data || []) as CircleProfileRow[];
      const tasksById = new Map<string, CountTaskRow>();
      for (const task of taskRows) tasksById.set(task.id, task);
      const profilesById = new Map<string, CircleProfileRow>();
      for (const profile of profileRows) profilesById.set(profile.id, profile);
      const membersByCircle = new Map<string, CircleMemberRow[]>();
      for (const member of allMembers) {
        const members = membersByCircle.get(member.circle_id) || [];
        members.push(member);
        membersByCircle.set(member.circle_id, members);
      }
      const linksByCircle = new Map<string, CircleTaskLink[]>();
      for (const link of links) {
        const circleLinks = linksByCircle.get(link.circle_id) || [];
        circleLinks.push(link);
        linksByCircle.set(link.circle_id, circleLinks);
      }
      const groups = circleRows.map((circle) => {
        const circleMembers = membersByCircle.get(circle.id) || [];
        const circleLinks = linksByCircle.get(circle.id) || [];
        const tasksByMember = new Map<string, CountTaskRow[]>();
        const circleTaskRows: CountTaskRow[] = [];
        for (const link of circleLinks) {
          const task = tasksById.get(link.task_id);
          if (!task) continue;
          const memberTasks = tasksByMember.get(link.shared_by) || [];
          memberTasks.push(task);
          tasksByMember.set(link.shared_by, memberTasks);
          circleTaskRows.push(task);
        }
        const membersMapped = circleMembers.map((member) => {
          const profile = profilesById.get(member.user_id);
          const personTasks = tasksByMember.get(member.user_id) || [];
          return {
            id: member.user_id,
            name: profile?.name || "Member",
            avatar: profile?.avatar || "",
            role: member.user_id === circle.owner_id ? "owner" : member.role,
            taskCount: personTasks.length,
            doneCount: personTasks.filter((task) => task.done).length,
          };
        });
        return {
          id: circle.id,
          name: circle.name,
          ownerId: circle.owner_id,
          myRole: membersMapped.find((member) => member.id === userId)?.role ||
            "member",
          members: membersMapped,
          memberCount: membersMapped.length,
          memberNames: membersMapped.map((member) => member.name).join(", "),
          taskCount: circleTaskRows.length,
          doneCount: circleTaskRows.filter((task) => task.done).length,
        };
      });
      return response(200, groups);
    }
    if (method === "POST" && pathname === "/groups") {
      const name = String(body.name || "").trim();
      if (name.length < 2 || name.length > 48) {
        fail("Circle names must be between 2 and 48 characters.");
      }
      const { data: circle, error } = await db.from("circles").insert({
        name,
        owner_id: userId,
      }).select("id,name,owner_id,created_at").single();
      if (error) throw error;
      const { error: memberError } = await db.from("circle_members").insert({
        circle_id: circle.id,
        user_id: userId,
        role: "owner",
      });
      if (memberError) throw memberError;
      const nameFromUser = String(user?.user_metadata?.name || "Member");
      return response(201, {
        id: circle.id,
        name,
        ownerId: userId,
        myRole: "owner",
        members: [{
          id: userId,
          name: nameFromUser,
          taskCount: 0,
          doneCount: 0,
          role: "owner",
        }],
        memberCount: 1,
        memberNames: nameFromUser,
        taskCount: 0,
        doneCount: 0,
      });
    }
    if (publicInvite) {
      const token = pathname.split("/").at(-1)!;
      const { data: invite, error } = await db.from("invites").select(
        "circle_id,expires_at",
      ).eq("token", token).maybeSingle();
      if (error) throw error;
      if (
        !invite ||
        (invite.expires_at && Date.parse(invite.expires_at) <= Date.now())
      ) fail("That circle invite link is invalid or has expired.", 404);
      const { data: circle, error: circleError } = await db.from("circles")
        .select("id,name").eq("id", invite.circle_id).single();
      if (circleError) throw circleError;
      return response(200, { id: circle.id, name: circle.name });
    }
    const joinInvite = pathname.match(
      /^\/invites\/([A-Za-z0-9_-]{32,})\/join$/,
    );
    if (joinInvite && method === "POST") {
      const { data: invite, error } = await db.from("invites").select(
        "circle_id,expires_at",
      ).eq("token", joinInvite[1]).maybeSingle();
      if (error) throw error;
      if (
        !invite ||
        (invite.expires_at && Date.parse(invite.expires_at) <= Date.now())
      ) fail("That circle invite link is invalid or has expired.", 404);
      const { error: memberError } = await db.from("circle_members").upsert({
        circle_id: invite.circle_id,
        user_id: userId,
        role: "member",
      }, { onConflict: "circle_id,user_id", ignoreDuplicates: true });
      if (memberError) throw memberError;
      const { data: circle, error: circleError } = await db.from("circles")
        .select("id,name").eq("id", invite.circle_id).single();
      if (circleError) throw circleError;
      return response(200, { id: circle.id, name: circle.name });
    }
    const memberAdmin = pathname.match(
      /^\/groups\/([^/]+)\/members\/([^/]+)\/admin$/,
    );
    if (memberAdmin && method === "POST") {
      const [, circleId, targetUserId] = memberAdmin;
      const { data: circle } = await db.from("circles").select("owner_id").eq(
        "id",
        circleId,
      ).maybeSingle();
      if (!circle || circle.owner_id !== userId) {
        fail("Only the circle owner can change admins.", 403);
      }
      if (targetUserId === userId) {
        fail("The owner already has every permission.");
      }
      const { data: target } = await db.from("circle_members").select("user_id")
        .eq("circle_id", circleId).eq("user_id", targetUserId).maybeSingle();
      if (!target) fail("That person is not in this circle.");
      const role = body.admin ? "admin" : "member";
      const { error } = await db.from("circle_members").update({ role }).eq(
        "circle_id",
        circleId,
      ).eq("user_id", targetUserId);
      if (error) throw error;
      return response(200, { ok: true, role });
    }
    const memberDelete = pathname.match(
      /^\/groups\/([^/]+)\/members\/([^/]+)$/,
    );
    if (memberDelete && method === "DELETE") {
      const [, circleId, targetUserId] = memberDelete;
      const { data: actor } = await db.from("circle_members").select("role").eq(
        "circle_id",
        circleId,
      ).eq("user_id", userId).maybeSingle();
      if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
        fail("Only the circle owner or an admin can do that.", 403);
      }
      if (targetUserId === userId) {
        fail("Use Leave to remove yourself from a circle.");
      }
      const [{ data: circle }, { data: target }] = await Promise.all([
        db.from("circles").select("owner_id").eq("id", circleId).maybeSingle(),
        db.from("circle_members").select("role").eq("circle_id", circleId).eq(
          "user_id",
          targetUserId,
        ).maybeSingle(),
      ]);
      if (!target || !circle || circle.owner_id === targetUserId) {
        fail("The circle owner cannot be removed.", 400);
      }
      if (actor.role === "admin" && target.role === "admin") {
        fail("Only the owner can remove an admin.", 403);
      }
      await removeCircleMemberData(circleId, targetUserId);
      return response(200, { ok: true });
    }
    const circleRoute = pathname.match(
      /^\/groups\/([^/]+)\/(goals|messages|members|invite|leave|recap|weekly|assignments|typing)(?:\/([^/]+))?$/,
    );
    if (circleRoute) {
      const [, circleId, feature, suffix] = circleRoute;
      await ensureCircleMember(circleId);
      if (feature === "members" && method === "POST" && !suffix) {
        const { data: role, error: roleError } = await db.from("circle_members")
          .select("role").eq("circle_id", circleId).eq("user_id", userId)
          .single();
        if (roleError) throw roleError;
        if (role.role !== "owner" && role.role !== "admin") {
          fail("Only the circle owner or an admin can do that.", 403);
        }
        const friendId = String(body.userId || "");
        const { data: friendship, error: friendError } = await db.from(
          "friendships",
        ).select("user_id").eq("user_id", userId).eq("friend_id", friendId)
          .maybeSingle();
        if (friendError) throw friendError;
        if (!friendship) {
          fail("Add this person as a friend before inviting them to a circle.");
        }
        const { error: insertError } = await db.from("circle_members").insert({
          circle_id: circleId,
          user_id: friendId,
          role: "member",
        });
        if (insertError?.code === "23505") {
          fail("That person is already in this circle.");
        }
        if (insertError) throw insertError;
        const { data: profile, error: profileError } = await db.from("profiles")
          .select("id,name").eq("id", friendId).single();
        if (profileError) throw profileError;
        return response(201, { id: profile.id, name: profile.name });
      }
      if (feature === "invite" && method === "POST" && suffix === "revoke") {
        const { data: role, error: roleError } = await db.from("circle_members")
          .select("role").eq("circle_id", circleId).eq("user_id", userId)
          .single();
        if (roleError) throw roleError;
        if (role.role !== "owner" && role.role !== "admin") {
          fail("Only the circle owner or an admin can do that.", 403);
        }
        const { error } = await db.from("invites").delete().eq(
          "circle_id",
          circleId,
        );
        if (error) throw error;
        return response(200, { ok: true });
      }
      if (feature === "invite" && method === "POST" && !suffix) {
        const { data: role, error: roleError } = await db.from("circle_members")
          .select("role").eq("circle_id", circleId).eq("user_id", userId)
          .single();
        if (roleError) throw roleError;
        if (role.role !== "owner" && role.role !== "admin") {
          fail("Only the circle owner or an admin can do that.", 403);
        }
        const token = `${crypto.randomUUID().replaceAll("-", "")}${
          crypto.randomUUID().replaceAll("-", "")
        }`;
        const { data: invite, error } = await db.from("invites").upsert({
          circle_id: circleId,
          token,
          created_by: userId,
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        }, { onConflict: "circle_id" }).select("token").single();
        if (error) throw error;
        const { data: circle } = await db.from("circles").select("name").eq(
          "id",
          circleId,
        ).single();
        return response(201, {
          token: invite.token,
          circleName: circle?.name || "your circle",
        });
      }
      if (feature === "leave" && method === "POST") {
        const { data: circle, error: circleError } = await db.from("circles")
          .select("owner_id").eq("id", circleId).single();
        if (circleError) throw circleError;
        await removeCircleMemberData(circleId, userId);
        const { data: remaining, error: remainingError } = await db.from(
          "circle_members",
        ).select("user_id,role,joined_at").eq("circle_id", circleId).order(
          "joined_at",
          { ascending: true },
        );
        if (remainingError) throw remainingError;
        if (!remaining?.length) {
          const { error: deleteCircleError } = await db.from("circles").delete()
            .eq("id", circleId);
          if (deleteCircleError) throw deleteCircleError;
        } else if (circle.owner_id === userId) {
          const next = remaining.find((row) => row.role === "admin") ||
            remaining[0];
          const { error: transferError } = await db.from("circles").update({
            owner_id: next.user_id,
          }).eq("id", circleId);
          if (transferError) throw transferError;
          if (next.role === "admin") {
            const { error } = await db.from("circle_members").update({
              role: "member",
            }).eq("circle_id", circleId).eq("user_id", next.user_id);
            if (error) throw error;
          }
        }
        return response(200, { ok: true });
      }
      if (feature === "typing" && method === "POST") {
        const { error } = await db.from("typing").upsert({
          circle_id: circleId,
          user_id: userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "circle_id,user_id" });
        if (error) throw error;
        return response(200, { ok: true });
      }
      if (feature === "typing" && method === "GET") {
        const { data: rows, error } = await db.from("typing").select(
          "user_id,updated_at",
        ).eq("circle_id", circleId).neq("user_id", userId).gte(
          "updated_at",
          new Date(Date.now() - 15000).toISOString(),
        );
        if (error) throw error;
        const ids = (rows || []).map((row) => row.user_id);
        const { data: profiles } = ids.length
          ? await db.from("profiles").select("id,name").in("id", ids)
          : { data: [] };
        return response(
          200,
          (rows || []).map((row) => ({
            userId: row.user_id,
            name: profiles?.find((person) => person.id === row.user_id)?.name ||
              "Someone",
            updatedAt: Date.parse(row.updated_at),
          })),
        );
      }
      if (feature === "assignments" && method === "GET") {
        const { data: actor } = await db.from("circle_members").select("role")
          .eq("circle_id", circleId).eq("user_id", userId).maybeSingle();
        const canManage = actor?.role === "owner" || actor?.role === "admin";
        const { data: rows, error } = await db.from("assignments").select(
          "id,circle_id,created_by,title,description,category,due_date,priority,target_minutes,created_at",
        )
          .eq("circle_id", circleId).order("created_at", { ascending: false })
          .limit(30);
        if (error) throw error;
        const result = [];
        for (const row of rows || []) {
          const { data: tasks } = await db.from("tasks").select("user_id,done")
            .eq("assignment_id", row.id);
          const mine = tasks?.find((task) => task.user_id === userId);
          if (!canManage && !mine) continue;
          const [{ data: creator }, { data: profiles }] = await Promise.all([
            row.created_by
              ? db.from("profiles").select("name").eq("id", row.created_by)
                .maybeSingle()
              : Promise.resolve({ data: null }),
            canManage && tasks?.length
              ? db.from("profiles").select("id,name,avatar").in(
                "id",
                tasks.map((task) => task.user_id),
              )
              : Promise.resolve({ data: [] }),
          ]);
          result.push({
            id: row.id,
            title: row.title,
            description: row.description,
            category: row.category,
            dueDate: row.due_date,
            priority: row.priority,
            createdAt: row.created_at,
            createdByName: creator?.name || "Owner",
            total: tasks?.length || 0,
            doneCount: tasks?.filter((task) => task.done).length || 0,
            members: canManage
              ? (tasks || []).map((task) => ({
                id: task.user_id,
                name: profiles?.find((person) =>
                  person.id === task.user_id
                )?.name || "Member",
                avatar: profiles?.find((person) =>
                  person.id === task.user_id
                )?.avatar || "",
                done: task.done,
              }))
              : [],
            mineDone: mine ? mine.done : null,
          });
        }
        return response(200, result);
      }
      if (feature === "assignments" && method === "POST") {
        const { data: actor } = await db.from("circle_members").select("role")
          .eq("circle_id", circleId).eq("user_id", userId).maybeSingle();
        if (!actor || !["owner", "admin"].includes(actor.role)) {
          fail("Only circle admins can assign tasks.", 403);
        }
        const title = String(body.title || "").trim();
        const description = String(body.description || "").trim();
        const priority = String(body.priority || "normal");
        const targetMinutes = Number(body.targetMinutes || 25);
        if (
          !title || title.length > 120 || description.length > 2000 ||
          !["low", "normal", "high"].includes(priority) ||
          !Number.isInteger(targetMinutes) || targetMinutes < 1 ||
          targetMinutes > 1440
        ) fail("Check the assignment details and try again.");
        const { data: members, error: membersError } = await db.from(
          "circle_members",
        ).select("user_id").eq("circle_id", circleId);
        if (membersError) throw membersError;
        let assignees = (members || []).filter((row) =>
          body.includeSelf || row.user_id !== userId
        );
        if (Array.isArray(body.assigneeIds) && body.assigneeIds.length) {
          const wanted = new Set(body.assigneeIds.map(String));
          assignees = (members || []).filter((row) => wanted.has(row.user_id));
          if (assignees.length !== wanted.size) {
            fail("Choose people who are in this circle.");
          }
        }
        if (!assignees.length) {
          fail("Invite someone to your circle before assigning tasks.");
        }
        const { data: circle } = await db.from("circles").select("name").eq(
          "id",
          circleId,
        ).single();
        const { data: profile } = await db.from("profiles").select("name").eq(
          "id",
          userId,
        ).maybeSingle();
        const dueDate = body.dueDate || null;
        const { data: assignment, error } = await db.from("assignments").insert(
          {
            circle_id: circleId,
            created_by: userId,
            title,
            description,
            category: String(body.category || "Personal"),
            due_date: dueDate,
            priority,
            target_minutes: targetMinutes,
          },
        ).select("id").single();
        if (error) throw error;
        for (const member of assignees) {
          const { data: task, error: taskError } = await db.from("tasks")
            .insert({
              user_id: member.user_id,
              title,
              description,
              category: String(body.category || "Personal"),
              due_date: dueDate,
              priority,
              target_minutes: targetMinutes,
              assignment_id: assignment.id,
              assigned_by_name: profile?.name || "Member",
            }).select("id").single();
          if (taskError) throw taskError;
          const { error: linkError } = await db.from("circle_tasks").insert({
            circle_id: circleId,
            task_id: task.id,
            shared_by: member.user_id,
          });
          if (linkError) throw linkError;
        }
        await Promise.all(
          assignees.filter((member) => member.user_id !== userId).map(
            (member) =>
              notifyPush([member.user_id], {
                title: `${
                  profile?.name || "A circle member"
                } assigned a task in ${circle?.name || "your circle"}`,
                body: title,
                tag: `assign-${assignment.id}`,
              }),
          ),
        );
        return response(201, {
          id: assignment.id,
          assigned: assignees.length,
          circleName: circle?.name || "Circle",
        });
      }
      if (feature === "recap" && method === "GET") {
        const since = new Date(Date.now() - 7 * 86400000).toISOString();
        const [{ data: members }, { data: links }] = await Promise.all([
          db.from("circle_members").select("user_id").eq("circle_id", circleId),
          db.from("circle_tasks").select("task_id").eq("circle_id", circleId),
        ]);
        const taskIds = (links || []).map((row) => row.task_id);
        const [{ data: profiles }, { data: activities }] = await Promise.all([
          members?.length
            ? db.from("profiles").select("id,name,avatar").in(
              "id",
              members.map((row) => row.user_id),
            )
            : Promise.resolve({ data: [] }),
          taskIds.length
            ? db.from("activities").select("user_id,task_id").eq(
              "type",
              "completed",
            ).gte("created_at", since).in("task_id", taskIds)
            : Promise.resolve({ data: [] }),
        ]);
        const people = (members || []).map((row) => ({
          id: row.user_id,
          name: profiles?.find((p) => p.id === row.user_id)?.name || "Member",
          avatar: profiles?.find((p) => p.id === row.user_id)?.avatar || "",
          completed: (activities || []).filter((a) =>
            a.user_id === row.user_id
          ).length,
        })).sort((a, b) =>
          b.completed - a.completed || a.name.localeCompare(b.name)
        );
        const total = people.reduce((sum, person) => sum + person.completed, 0);
        return response(200, {
          total,
          top: total ? people[0] : null,
          members: people,
        });
      }
      if (feature === "weekly" && method === "GET") {
        const role = await ensureCircleMember(circleId);
        if (role.role !== "owner" && role.role !== "admin") {
          fail("Only circle admins can view the weekly report.", 403);
        }
        const weekStart = String(query.week || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
          fail("Choose a valid week.");
        }
        const keys = Array.from({ length: 7 }, (_, i) => {
          const date = new Date(`${weekStart}T00:00:00Z`);
          date.setUTCDate(date.getUTCDate() + i);
          return date.toISOString().slice(0, 10);
        });
        const [{ data: circle }, { data: members }, { data: links }] =
          await Promise.all([
            db.from("circles").select("name").eq("id", circleId).single(),
            db.from("circle_members").select("user_id").eq(
              "circle_id",
              circleId,
            ),
            db.from("circle_tasks").select("task_id").eq("circle_id", circleId),
          ]);
        const userIds = (members || []).map((row) => row.user_id);
        const taskIds = [...new Set((links || []).map((row) => row.task_id))];
        const [{ data: profiles }, { data: tasks }] = await Promise.all([
          userIds.length
            ? db.from("profiles").select("id,name,avatar").in("id", userIds)
            : Promise.resolve({ data: [] }),
          taskIds.length
            ? db.from("tasks").select(
              "id,user_id,title,category,due_date,created_at,done,moved_from",
            ).in("id", taskIds)
            : Promise.resolve({ data: [] }),
        ]);
        const people = new Map(userIds.map((id) => {
          const profile = profiles?.find((item) => item.id === id);
          return [id, {
            id,
            name: profile?.name || "Member",
            avatar: profile?.avatar || "",
            done: 0,
            open: 0,
            moved: 0,
            days: keys.map((key) => ({ key, done: 0, open: 0 })),
          }];
        }));
        const rows = [];
        for (const task of tasks || []) {
          const person = people.get(task.user_id);
          if (!person) continue;
          const day = task.due_date ||
            new Date(
              Date.parse(task.created_at) - Number(query.tz || 0) * 60000,
            ).toISOString().slice(0, 10);
          const entries = [
            ...(task.moved_from || []).filter((from: string) => from !== day)
              .map((from: string) => ({
                day: from,
                status: "moved",
                movedTo: day,
              })),
            { day, status: task.done ? "done" : "open", movedTo: null },
          ];
          for (const entry of entries) {
            const ix = keys.indexOf(entry.day);
            if (ix < 0) continue;
            if (entry.status === "done") {
              person.done++;
              person.days[ix].done++;
            } else {
              person.open++;
              person.days[ix].open++;
              if (entry.status === "moved") person.moved++;
            }
            if (rows.length < 600) {
              rows.push({
                member: person.name,
                memberId: person.id,
                title: task.title,
                category: task.category,
                day: entry.day,
                status: entry.status,
                movedTo: entry.movedTo,
              });
            }
          }
        }
        const reportMembers = [...people.values()].map((person) => {
          const total = person.done + person.open;
          return {
            ...person,
            total,
            completion: total ? Math.round(person.done / total * 100) : 0,
          };
        }).sort((a, b) =>
          b.completion - a.completion || b.done - a.done ||
          a.name.localeCompare(b.name)
        );
        const done = reportMembers.reduce(
          (sum, person) => sum + person.done,
          0,
        );
        const open = reportMembers.reduce(
          (sum, person) => sum + person.open,
          0,
        );
        return response(200, {
          circleName: circle?.name || "Circle",
          weekStart,
          members: reportMembers,
          rows,
          totals: {
            done,
            open,
            total: done + open,
            completion: done + open
              ? Math.round(done / (done + open) * 100)
              : 0,
          },
        });
      }
      if (feature === "typing" && method === "POST") {
        const { error } = await db.from("typing").upsert({
          circle_id: circleId,
          user_id: userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "circle_id,user_id" });
        if (error) throw error;
        return response(200, { ok: true });
      }
      if (feature === "typing" && method === "GET") {
        const { data: rows, error } = await db.from("typing").select(
          "user_id,updated_at",
        ).eq("circle_id", circleId).neq("user_id", userId).gte(
          "updated_at",
          new Date(Date.now() - 15000).toISOString(),
        );
        if (error) throw error;
        const ids = (rows || []).map((row) => row.user_id);
        const { data: profiles } = ids.length
          ? await db.from("profiles").select("id,name").in("id", ids)
          : { data: [] };
        return response(
          200,
          (rows || []).map((row) => ({
            userId: row.user_id,
            name: profiles?.find((person) => person.id === row.user_id)?.name ||
              "Someone",
            updatedAt: Date.parse(row.updated_at),
          })),
        );
      }
      if (method === "GET" && feature === "goals") {
        const [linksResult, membersResult] = await Promise.all([
          db.from("circle_tasks").select("task_id").eq("circle_id", circleId),
          db.from("circle_members").select("user_id").eq(
            "circle_id",
            circleId,
          ),
        ]);
        if (linksResult.error) throw linksResult.error;
        if (membersResult.error) throw membersResult.error;
        type GoalLinkRow = { task_id: string };
        type GoalMemberRow = { user_id: string };
        type GoalTaskRow = {
          id: string;
          user_id: string;
          title: string;
          category: string;
          due_date: string | null;
          created_at: string;
          done: boolean;
        };
        type GoalProfileRow = { id: string; name?: string };
        const links = (linksResult.data || []) as GoalLinkRow[];
        const taskIds = (links || []).map((row) => row.task_id);
        if (!taskIds.length) return response(200, []);
        const members = (membersResult.data || []) as GoalMemberRow[];
        const memberIds = [...new Set(members.map((row) => row.user_id))];
        const [tasksResult, profilesResult] = await Promise.all([
          db.from("tasks").select(
            "id,user_id,title,category,due_date,created_at,done",
          ).in("id", taskIds).order("created_at", { ascending: false }),
          memberIds.length
            ? db.from("profiles").select("id,name").in("id", memberIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (tasksResult.error) throw tasksResult.error;
        if (profilesResult.error) throw profilesResult.error;
        const tasks = (tasksResult.data || []) as GoalTaskRow[];
        const profiles = (profilesResult.data || []) as GoalProfileRow[];
        return response(
          200,
          (tasks || []).map((task) => ({
            id: task.id,
            ownerId: task.user_id,
            ownerName: profiles?.find((person) =>
              person.id === task.user_id
            )?.name || "Member",
            title: task.title,
            category: task.category,
            dueDate: task.due_date,
            createdAt: Date.parse(task.created_at),
            done: task.done,
          })),
        );
      }
      if (feature === "messages" && method === "GET") {
        let requestQuery = db.from("messages").select(
          "id,sender_id,content,reply_to,mentions,edited_at,created_at",
        ).eq(
          "circle_id",
          circleId,
        ).order("created_at", { ascending: false }).limit(100);
        const { data: messages, error } = await requestQuery;
        if (error) throw error;
        let visibleMessages = (messages || []).reverse();
        if (query.after) {
          const index = visibleMessages.findIndex((row) =>
            row.id === query.after
          );
          visibleMessages = index >= 0
            ? visibleMessages.slice(index + 1)
            : visibleMessages.slice(-1);
        } else visibleMessages = visibleMessages.slice(-60);
        const senderIds = [
          ...new Set(visibleMessages.map((row) => row.sender_id)),
        ];
        const { data: profiles, error: profileError } = senderIds.length
          ? await db.from("profiles").select("id,name,avatar").in(
            "id",
            senderIds,
          )
          : { data: [], error: null };
        if (profileError) throw profileError;
        return response(
          200,
          visibleMessages.map((row) => ({
            id: row.id,
            senderId: row.sender_id,
            senderName: profiles?.find((item) =>
              item.id === row.sender_id
            )?.name || "Member",
            senderAvatar: profiles?.find((item) =>
              item.id === row.sender_id
            )?.avatar || "",
            content: row.content,
            replyTo: row.reply_to,
            mentions: row.mentions,
            edited: Boolean(row.edited_at),
            createdAt: new Date(row.created_at).toISOString(),
          })),
        );
      }
      if (feature === "messages" && method === "POST") {
        const content = String(body.content || "").trim();
        if (!content || content.length > 1000) {
          fail("Messages need to be between 1 and 1,000 characters.");
        }
        const { data: members, error: membersError } = await db.from(
          "circle_members",
        ).select("user_id").eq("circle_id", circleId);
        if (membersError) throw membersError;
        const memberIds = new Set((members || []).map((row) => row.user_id));
        const mentions: string[] = [
          ...new Set<string>(
            (Array.isArray(body.mentions) ? body.mentions : []).map(String),
          ),
        ].filter((id) => memberIds.has(id));
        const { data: message, error } = await db.from("messages").insert({
          circle_id: circleId,
          sender_id: userId,
          content,
          reply_to: body.replyTo || null,
          mentions,
        }).select("id,sender_id,content,reply_to,mentions,edited_at,created_at").single();
        if (error) throw error;
        const [{ data: profile }, { data: circle }] = await Promise.all([
          db.from("profiles").select("name,avatar").eq("id", userId)
            .maybeSingle(),
          db.from("circles").select("name").eq("id", circleId).maybeSingle(),
        ]);
        await notifyPush(
          (members || []).map((row) => row.user_id).filter((id) =>
            id !== userId && !mentions.includes(id)
          ),
          {
            title: `${profile?.name || "Member"} · ${circle?.name || "Circle"}`,
            body: content.slice(0, 120),
            tag: `chat-${circleId}`,
          },
        );
        await Promise.all(
          mentions.map((id) =>
            notifyPush([id], {
              title: `${profile?.name || "Member"} mentioned you in ${
                circle?.name || "a circle"
              }`,
              body: content.slice(0, 120),
              tag: `mention-${circleId}`,
            })
          ),
        );
        return response(201, {
          id: message.id,
          senderId: userId,
          senderName: profile?.name || "Member",
          senderAvatar: profile?.avatar || "",
          content,
          replyTo: message.reply_to,
          mentions: message.mentions,
          editedAt: null,
          createdAt: Date.parse(message.created_at),
        });
      }
    }

    if (method === "GET" && pathname === "/friends") {
      const { data: rows, error } = await db.from("friendships").select(
        "friend_id",
      ).eq("user_id", userId);
      if (error) throw error;
      const ids = (rows || []).map((row) => row.friend_id);
      if (!ids.length) return response(200, []);
      const { data: profiles, error: profileError } = await db.from("profiles")
        .select("id,name,email,bio,avatar").in("id", ids).order("name");
      if (profileError) throw profileError;
      return response(
        200,
        (profiles || []).map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          bio: row.bio,
          avatar: row.avatar,
        })),
      );
    }
    if (method === "GET" && pathname === "/friends/search") {
      const search = String(query.q || "").trim().slice(0, 80);
      if (search.length < 2) return response(200, []);
      const { data: profiles, error } = await db.from("profiles").select(
        "id,name,email,bio,avatar",
      ).neq("id", userId).or(`name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(20);
      if (error) throw error;
      const { data: relations, error: friendsError } = await db.from(
        "friendships",
      ).select("friend_id").eq("user_id", userId);
      if (friendsError) throw friendsError;
      const friendIds = new Set((relations || []).map((row) => row.friend_id));
      return response(
        200,
        (profiles || []).map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          bio: row.bio,
          avatar: row.avatar,
          isFriend: friendIds.has(row.id),
        })),
      );
    }
    if (method === "POST" && pathname === "/friends") {
      let person: any = null;
      if (body.friendId) {
        const { data, error } = await db.from("profiles").select(
          "id,name,email,bio,avatar",
        ).eq("id", String(body.friendId)).maybeSingle();
        if (error) throw error;
        person = data;
      } else {
        const email = String(body.email || "").trim().toLowerCase();
        if (!email || email.length > 254) fail("Enter a valid email address.");
        const { data, error } = await db.from("profiles").select(
          "id,name,email,bio,avatar",
        ).ilike("email", email).maybeSingle();
        if (error) throw error;
        person = data;
      }
      if (!person || person.id === userId) {
        fail("That person could not be found.", 404);
      }
      const { error } = await db.from("friendships").upsert([
        { user_id: userId, friend_id: person.id },
        { user_id: person.id, friend_id: userId },
      ], { onConflict: "user_id,friend_id", ignoreDuplicates: true });
      if (error) throw error;
      return response(201, { id: person.id, name: person.name });
    }
    const friendProfile = pathname.match(/^\/friends\/([^/]+)\/profile$/);
    if (method === "GET" && friendProfile) {
      const friendId = friendProfile[1];
      const { data: friendship, error } = await db.from("friendships").select(
        "friend_id",
      ).eq("user_id", userId).eq("friend_id", friendId).maybeSingle();
      if (error) throw error;
      if (!friendship) fail("That profile isn't in your circle.", 404);
      const { data: profile, error: profileError } = await db.from("profiles")
        .select("id,name,bio,avatar").eq("id", friendId).single();
      if (profileError) throw profileError;
      const { data: tasks, error: tasksError } = await db.from("tasks").select(
        "title,category,due_date,done,priority,shared_with",
      ).eq("user_id", friendId).eq("visibility", "friends").order("done", {
        ascending: true,
      }).limit(30);
      if (tasksError) throw tasksError;
      const { count, error: countError } = await db.from("friendships").select(
        "friend_id",
        { count: "exact", head: true },
      ).eq("user_id", friendId);
      if (countError) throw countError;
      return response(200, {
        ...profile,
        tasks: (tasks || []).filter((row) =>
          !row.shared_with?.length || row.shared_with.includes(userId)
        ).map((row) => ({
          title: row.title,
          category: row.category,
          dueDate: row.due_date,
          done: row.done,
          priority: row.priority,
        })),
        friendCount: count || 0,
      });
    }

    if (method === "GET" && pathname === "/activity") {
      const { data: friends, error: friendsError } = await db.from(
        "friendships",
      ).select("friend_id").eq("user_id", userId);
      if (friendsError) throw friendsError;
      const audience = [userId, ...(friends || []).map((row) => row.friend_id)];
      const { data: rows, error } = await db.from("activities").select(
        "id,user_id,task_id,type,created_at",
      ).in(
        "user_id",
        audience,
      ).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const visible = [];
      for (const row of rows || []) {
        const { data: task } = await db.from("tasks").select(
          "id,title,visibility,shared_with",
        ).eq("id", row.task_id).maybeSingle();
        if (
          !task || task.visibility !== "friends" ||
          (row.user_id !== userId && task.shared_with?.length &&
            !task.shared_with.includes(userId))
        ) continue;
        const [{ data: profile }, { data: reactions }] = await Promise.all([
          db.from("profiles").select("name,avatar").eq("id", row.user_id)
            .maybeSingle(),
          db.from("reactions").select("user_id,emoji").eq(
            "activity_id",
            row.id,
          ),
        ]);
        const all = reactions || [];
        const options = ["❤️", "🔥", "👏", "🎉", "💪"];
        visible.push({
          id: row.id,
          actorId: row.user_id,
          actorName: profile?.name || "Member",
          actorAvatar: profile?.avatar || "",
          taskId: task.id,
          taskTitle: task.title,
          type: row.type,
          createdAt: row.created_at,
          reactionCount: all.length,
          reacted: all.some((item) => item.user_id === userId),
          reactions: options.map((emoji) => ({
            emoji,
            count: all.filter((item) => item.emoji === emoji).length,
            mine: all.some((item) =>
              item.user_id === userId && item.emoji === emoji
            ),
          })).filter((item) => item.count),
        });
        if (visible.length >= 50) break;
      }
      return response(200, visible);
    }
    const reactRoute = pathname.match(/^\/activity\/([^/]+)\/react$/);
    if (method === "POST" && reactRoute) {
      const emoji = String(body.emoji || "❤️");
      if (!["❤️", "🔥", "👏", "🎉", "💪"].includes(emoji)) {
        fail("That reaction isn't available.");
      }
      const { data: activity } = await db.from("activities").select(
        "id,user_id,task_id",
      ).eq("id", reactRoute[1]).maybeSingle();
      if (!activity) fail("That activity could not be found.", 404);
      const { data: relation } = await db.from("friendships").select(
        "friend_id",
      ).eq("user_id", userId).eq("friend_id", activity.user_id).maybeSingle();
      const { data: task } = await db.from("tasks").select(
        "visibility,shared_with",
      ).eq("id", activity.task_id).maybeSingle();
      if (
        (activity.user_id !== userId && !relation) || !task ||
        task.visibility !== "friends" ||
        (activity.user_id !== userId && task.shared_with?.length &&
          !task.shared_with.includes(userId))
      ) fail("That activity could not be found.", 404);
      const { data: existing } = await db.from("reactions").select("id").eq(
        "activity_id",
        activity.id,
      ).eq("user_id", userId).eq("emoji", emoji).maybeSingle();
      if (existing) await db.from("reactions").delete().eq("id", existing.id);
      else {
        const { error } = await db.from("reactions").insert({
          activity_id: activity.id,
          user_id: userId,
          emoji,
        });
        if (error) throw error;
      }
      const { data: all, error } = await db.from("reactions").select(
        "user_id,emoji",
      ).eq("activity_id", activity.id);
      if (error) throw error;
      return response(200, {
        reacted: (all || []).some((item) => item.user_id === userId),
        reactionCount: (all || []).length,
        reactions: ["❤️", "🔥", "👏", "🎉", "💪"].map((option) => ({
          emoji: option,
          count: (all || []).filter((item) => item.emoji === option).length,
          mine: (all || []).some((item) =>
            item.user_id === userId && item.emoji === option
          ),
        })).filter((item) => item.count),
      });
    }
    if (method === "GET" && pathname === "/nudges") {
      const { data: rows, error } = await db.from("nudges").select(
        "id,to_user_id,from_user_id,task_id,seen,created_at",
      ).eq(
        "to_user_id",
        userId,
      ).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      const result = [];
      for (const row of rows || []) {
        const [{ data: task }, { data: profile }] = await Promise.all([
          db.from("tasks").select("title").eq("id", row.task_id).maybeSingle(),
          db.from("profiles").select("name,avatar").eq("id", row.from_user_id)
            .maybeSingle(),
        ]);
        if (task) {
          result.push({
            id: row.id,
            fromName: profile?.name || "A friend",
            fromAvatar: profile?.avatar || "",
            taskTitle: task.title,
            seen: row.seen,
            createdAt: row.created_at,
          });
        }
      }
      return response(200, result);
    }
    if (method === "POST" && pathname === "/nudges/seen") {
      const { error } = await db.from("nudges").update({ seen: true }).eq(
        "to_user_id",
        userId,
      ).eq("seen", false);
      if (error) throw error;
      return response(200, { ok: true });
    }
    const nudgeRoute = pathname.match(/^\/tasks\/([^/]+)\/nudge$/);
    if (method === "POST" && nudgeRoute) {
      const { data: task } = await db.from("tasks").select(
        "id,user_id,title,done",
      ).eq("id", nudgeRoute[1]).maybeSingle();
      if (!task || task.user_id === userId || task.done) {
        fail("That task can't be nudged.");
      }
      const { data: links, error } = await db.from("circle_tasks").select(
        "circle_id",
      ).eq("task_id", task.id);
      if (error) throw error;
      let shared = false;
      for (const link of links || []) {
        const { data } = await db.from("circle_members").select("user_id").eq(
          "circle_id",
          link.circle_id,
        ).eq("user_id", userId).maybeSingle();
        if (data) {
          shared = true;
          break;
        }
      }
      if (!shared) fail("That task can't be nudged.");
      const since = new Date(Date.now() - 86400000).toISOString();
      const { data: previous } = await db.from("nudges").select("id").eq(
        "from_user_id",
        userId,
      ).eq("task_id", task.id).gte("created_at", since).limit(1);
      if (previous?.length) fail("You already nudged them about this today.");
      const { error: insertError } = await db.from("nudges").insert({
        from_user_id: userId,
        to_user_id: task.user_id,
        task_id: task.id,
      });
      if (insertError) throw insertError;
      const { data: sender } = await db.from("profiles").select("name").eq(
        "id",
        userId,
      ).maybeSingle();
      await notifyPush([task.user_id], {
        title: `${sender?.name || "A circle member"} nudged you`,
        body: task.title,
        tag: `nudge-${task.id}`,
      });
      return response(200, { ok: true });
    }

    if (method === "POST" && pathname === "/push/subscribe") {
      const endpoint = String(body.endpoint || "");
      const p256dh = String(body.p256dh || "");
      const auth = String(body.auth || "");
      if (
        !endpoint.startsWith("https://") || endpoint.length > 1000 || !p256dh ||
        !auth
      ) fail("That device can't receive notifications.");
      const { error } = await db.from("push_subscriptions").upsert({
        user_id: userId,
        endpoint,
        p256dh,
        auth,
      }, { onConflict: "endpoint" });
      if (error) throw error;
      return response(200, { ok: true });
    }
    if (method === "POST" && pathname === "/push/unsubscribe") {
      const { error } = await db.from("push_subscriptions").delete().eq(
        "user_id",
        userId,
      ).eq("endpoint", String(body.endpoint || ""));
      if (error) throw error;
      return response(200, { ok: true });
    }

    if (method === "GET" && pathname === "/calendar/feed") {
      const { data, error } = await db.from("calendar_feeds").select(
        "token,created_at",
      ).eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return response(
        200,
        data
          ? { token: data.token, createdAt: Date.parse(data.created_at) }
          : null,
      );
    }
    if (method === "POST" && pathname === "/calendar/feed") {
      const token = `${crypto.randomUUID().replaceAll("-", "")}${
        crypto.randomUUID().replaceAll("-", "")
      }`;
      const { error } = await db.from("calendar_feeds").upsert({
        user_id: userId,
        token,
      }, { onConflict: "user_id" });
      if (error) throw error;
      return response(201, { token });
    }
    if (method === "DELETE" && pathname === "/calendar/feed") {
      const { error } = await db.from("calendar_feeds").delete().eq(
        "user_id",
        userId,
      );
      if (error) throw error;
      return response(200, { ok: true });
    }
    if (method === "GET" && pathname === "/google-calendar/status") {
      const [{ data: credentials }, { data: sync }] = await Promise.all([
        db.from("google_calendar_credentials").select("id").eq(
          "user_id",
          userId,
        ).maybeSingle(),
        db.from("google_calendar_sync_states").select(
          "syncing,last_sync_at,last_error",
        ).eq("user_id", userId).maybeSingle(),
      ]);
      return response(200, {
        connected: Boolean(credentials),
        syncing: sync?.syncing || false,
        lastSyncAt: sync?.last_sync_at ? Date.parse(sync.last_sync_at) : null,
        lastError: sync?.last_error || null,
      });
    }
    if (method === "POST" && pathname === "/google-calendar/connect") {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
      if (!clientId || !Deno.env.get("GOOGLE_CLIENT_SECRET")) {
        fail("Google Calendar is not configured yet.", 503);
      }
      const callbackUrl = `${
        url.replace(/\/$/, "")
      }/functions/v1/api/google-calendar/callback`;
      const state = `${crypto.randomUUID().replaceAll("-", "")}${
        crypto.randomUUID().replaceAll("-", "")
      }`;
      const { error: clearError } = await db.from(
        "google_calendar_oauth_states",
      ).delete().eq("user_id", userId);
      if (clearError) throw clearError;
      const { error } = await db.from("google_calendar_oauth_states").insert({
        user_id: userId,
        state,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      });
      if (error) throw error;
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callbackUrl,
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        scope: "https://www.googleapis.com/auth/calendar.events",
        state,
      }).toString();
      return response(200, { url: authUrl.toString() });
    }
    if (method === "DELETE" && pathname === "/google-calendar") {
      for (
        const table of [
          "google_calendar_credentials",
          "google_calendar_task_links",
          "google_calendar_sync_states",
          "google_calendar_oauth_states",
        ]
      ) {
        const { error } = await db.from(table).delete().eq("user_id", userId);
        if (error) throw error;
      }
      return response(200, { ok: true });
    }
    if (method === "POST" && pathname === "/google-calendar/sync") {
      const { data: credential, error: credentialError } = await db.from(
        "google_calendar_credentials",
      ).select("user_id,access_token,refresh_token,access_token_expires_at,updated_at").eq("user_id", userId).maybeSingle();
      if (credentialError) throw credentialError;
      if (!credential) fail("Connect Google Calendar first.");
      const { data: priorLinks, error: linksError } = await db.from(
        "google_calendar_task_links",
      ).select("task_id,event_id,last_title,last_description,last_due_date,updated_at").eq("user_id", userId);
      if (linksError) throw linksError;
      let accessToken = credential.access_token;
      let expiresAt = credential.access_token_expires_at;
      let lastError: string | null = null;
      try {
        if (Date.parse(expiresAt) < Date.now() + 60000) {
          const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
          const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
          const refreshed = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: credential.refresh_token,
              grant_type: "refresh_token",
            }),
          });
          const tokens = await refreshed.json();
          if (!refreshed.ok || !tokens.access_token) {
            throw new Error(
              "Google authorization expired. Reconnect Google Calendar in Settings.",
            );
          }
          accessToken = tokens.access_token;
          expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000)
            .toISOString();
        }
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        };
        const { data: tasks, error: taskError } = await db.from("tasks").select(
          "id,title,description,due_date",
        ).eq("user_id", userId).not("due_date", "is", null);
        if (taskError) throw taskError;
        const taskRows = tasks || [];
        const activeIds = new Set(taskRows.map((task) => task.id));
        const prior = new Map(
          (priorLinks || []).map((link) => [link.task_id, link]),
        );
        for (const old of priorLinks || []) {
          if (!activeIds.has(old.task_id)) {
            await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${
                encodeURIComponent(old.event_id)
              }`,
              { method: "DELETE", headers },
            ).catch(() => {});
          }
        }
        const nextLinks = [];
        for (const task of taskRows) {
          const old = prior.get(task.id);
          const date = task.due_date;
          const title = task.title;
          const description = task.description || "";
          const endDate = new Date(`${date}T00:00:00Z`);
          endDate.setUTCDate(endDate.getUTCDate() + 1);
          const eventData = {
            summary: title,
            description,
            start: { date },
            end: { date: endDate.toISOString().slice(0, 10) },
            extendedProperties: { private: { kindaTaskId: task.id } },
          };
          if (!old) {
            const created = await fetch(
              "https://www.googleapis.com/calendar/v3/calendars/primary/events",
              { method: "POST", headers, body: JSON.stringify(eventData) },
            );
            const event = await created.json();
            if (!created.ok || !event.id) {
              throw new Error(
                event.error?.message ||
                  "Could not create a Google Calendar task.",
              );
            }
            nextLinks.push({
              user_id: userId,
              task_id: task.id,
              event_id: event.id,
              last_title: title,
              last_description: description,
              last_due_date: date,
            });
            continue;
          }
          const taskChanged = old.last_title !== title ||
            old.last_description !== description || old.last_due_date !== date;
          if (taskChanged) {
            const updated = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${
                encodeURIComponent(old.event_id)
              }`,
              { method: "PUT", headers, body: JSON.stringify(eventData) },
            );
            if (!updated.ok) {
              throw new Error("Could not update a Google Calendar task.");
            }
            nextLinks.push({
              user_id: userId,
              task_id: task.id,
              event_id: old.event_id,
              last_title: title,
              last_description: description,
              last_due_date: date,
            });
            continue;
          }
          const fetched = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${
              encodeURIComponent(old.event_id)
            }`,
            { headers },
          );
          if (!fetched.ok) {
            throw new Error(
              "A linked Google Calendar task was removed. Reconnect or retry sync.",
            );
          }
          const event = await fetched.json();
          const googleDate = event.start?.date;
          const googleTitle = event.summary || "";
          const googleDescription = event.description || "";
          if (
            googleDate &&
            (googleDate !== old.last_due_date ||
              googleTitle !== old.last_title ||
              googleDescription !== old.last_description)
          ) {
            const googleEnd = new Date(`${googleDate}T00:00:00Z`);
            googleEnd.setUTCDate(googleEnd.getUTCDate() + 1);
            const patch = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${
                encodeURIComponent(old.event_id)
              }`,
              {
                method: "PUT",
                headers,
                body: JSON.stringify({
                  ...event,
                  summary: googleTitle,
                  description: googleDescription,
                  start: { date: googleDate },
                  end: { date: googleEnd.toISOString().slice(0, 10) },
                }),
              },
            );
            if (!patch.ok) {
              throw new Error("Could not sync the edited calendar task.");
            }
            const { error: updateTaskError } = await db.from("tasks").update({
              title: googleTitle,
              description: googleDescription,
              due_date: googleDate,
            }).eq("id", task.id).eq("user_id", userId);
            if (updateTaskError) throw updateTaskError;
            nextLinks.push({
              user_id: userId,
              task_id: task.id,
              event_id: old.event_id,
              last_title: googleTitle,
              last_description: googleDescription,
              last_due_date: googleDate,
            });
          } else {nextLinks.push({
              user_id: userId,
              task_id: task.id,
              event_id: old.event_id,
              last_title: title,
              last_description: description,
              last_due_date: date,
            });}
        }
        const { error: clearLinksError } = await db.from(
          "google_calendar_task_links",
        ).delete().eq("user_id", userId);
        if (clearLinksError) throw clearLinksError;
        if (nextLinks.length) {
          const { error } = await db.from("google_calendar_task_links").insert(
            nextLinks,
          );
          if (error) throw error;
        }
        const { error: saveCredentialError } = await db.from(
          "google_calendar_credentials",
        ).update({
          access_token: accessToken,
          access_token_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        }).eq("user_id", userId);
        if (saveCredentialError) throw saveCredentialError;
        const { error: saveStateError } = await db.from(
          "google_calendar_sync_states",
        ).upsert({
          user_id: userId,
          syncing: false,
          last_sync_at: new Date().toISOString(),
          last_error: null,
        }, { onConflict: "user_id" });
        if (saveStateError) throw saveStateError;
      } catch (cause) {
        lastError = cause instanceof Error
          ? cause.message
          : "Google Calendar sync failed.";
        await db.from("google_calendar_sync_states").upsert({
          user_id: userId,
          syncing: false,
          last_error: lastError,
        }, { onConflict: "user_id" });
      }
      return response(200, {
        ok: true,
        ...(lastError ? { error: lastError } : {}),
      });
    }
    if (method === "GET" && pathname === "/telegram/status") {
      const { data, error } = await db.from("telegram_links").select("id").eq(
        "user_id",
        userId,
      ).maybeSingle();
      if (error) throw error;
      return response(200, Boolean(data));
    }
    if (method === "POST" && pathname === "/telegram/link") {
      const bot = Deno.env.get("TELEGRAM_BOT_USERNAME")?.replace(/^@/, "");
      if (!bot || !/^[A-Za-z0-9_]{5,32}$/.test(bot)) {
        fail("Telegram reminders are not configured yet.", 503);
      }
      const token = `${crypto.randomUUID().replaceAll("-", "")}${
        crypto.randomUUID().replaceAll("-", "")
      }`;
      const expiresAt = new Date(Date.now() + 600000).toISOString();
      const { error: clearError } = await db.from("telegram_link_tokens")
        .delete().eq("user_id", userId);
      if (clearError) throw clearError;
      const { error } = await db.from("telegram_link_tokens").insert({
        user_id: userId,
        token,
        expires_at: expiresAt,
      });
      if (error) throw error;
      return response(200, { url: `https://t.me/${bot}?start=${token}` });
    }
    if (method === "DELETE" && pathname === "/telegram/link") {
      const [{ error: linkError }, { error: tokenError }] = await Promise.all([
        db.from("telegram_links").delete().eq("user_id", userId),
        db.from("telegram_link_tokens").delete().eq("user_id", userId),
      ]);
      if (linkError) throw linkError;
      if (tokenError) throw tokenError;
      return response(200, { ok: true });
    }

    if (method === "GET" && pathname === "/streak") {
      const tzOffset = Number(query.tz || 0);
      const now = Date.now();
      const dayMs = 86400000;
      const { data: tasks, error } = await db.from("tasks").select(
        "due_date,created_at,done,moved_from",
      ).eq("user_id", userId).gte(
        "created_at",
        new Date(now - 400 * dayMs).toISOString(),
      );
      if (error) throw error;
      const dayKey = (time: number) =>
        new Date(time - tzOffset * 60000).toISOString().slice(0, 10);
      const perDay = new Map<string, { total: number; done: number }>();
      for (const task of tasks || []) {
        const key = task.due_date || dayKey(Date.parse(task.created_at));
        const item = perDay.get(key) || { total: 0, done: 0 };
        item.total++;
        if (task.done) item.done++;
        perDay.set(key, item);
        for (const moved of task.moved_from || []) {
          if (moved !== key) {
            const prior = perDay.get(moved) || { total: 0, done: 0 };
            prior.total++;
            perDay.set(moved, prior);
          }
        }
      }
      const qualifies = (key: string) => {
        const item = perDay.get(key);
        return Boolean(
          item && item.total >= 5 && item.done * 100 >= item.total * 80,
        );
      };
      const today = dayKey(now);
      let current = 0;
      let offset = qualifies(today) ? 0 : 1;
      for (; offset < 400; offset++) {
        const key = dayKey(now - offset * dayMs);
        if (!qualifies(key)) break;
        current++;
      }
      const qualified = [...perDay.keys()].filter(qualifies).sort();
      let best = 0;
      let run = 0;
      let prev = "";
      for (const key of qualified) {
        run = prev &&
            Date.parse(`${key}T00:00:00Z`) - Date.parse(`${prev}T00:00:00Z`) ===
              dayMs
          ? run + 1
          : 1;
        best = Math.max(best, run);
        prev = key;
      }
      const todayStat = perDay.get(today) || { total: 0, done: 0 };
      const needed = todayStat.total < 5
        ? 5 - todayStat.total
        : Math.max(0, Math.ceil(todayStat.total * 0.8) - todayStat.done);
      return response(200, {
        current,
        best,
        doneToday: qualifies(today),
        todayTotal: todayStat.total,
        todayDone: todayStat.done,
        needed,
        percent: 80,
        minTasks: 5,
      });
    }

    const messageRoute = pathname.match(/^\/messages\/([^/]+)$/);
    if (messageRoute && method === "PATCH") {
      const content = String(body.content || "").trim();
      if (!content || content.length > 2000) {
        fail("Messages must be between 1 and 2,000 characters.");
      }
      const { data: message, error } = await db.from("messages").update({
        content,
        edited_at: new Date().toISOString(),
      }).eq("id", messageRoute[1]).eq("sender_id", userId).select(
        "id,sender_id,content,reply_to,mentions,edited_at,created_at",
      )
        .maybeSingle();
      if (error) throw error;
      if (!message) fail("You can only edit your own messages.", 403);
      const { data: profile } = await db.from("profiles").select("name,avatar")
        .eq("id", userId).maybeSingle();
      return response(200, {
        id: message.id,
        senderId: userId,
        senderName: profile?.name || "Member",
        senderAvatar: profile?.avatar || "",
        content,
        replyTo: message.reply_to,
        mentions: message.mentions,
        edited: true,
        editedAt: message.edited_at,
        createdAt: message.created_at,
      });
    }
    if (messageRoute && method === "DELETE") {
      const { data, error } = await db.from("messages").delete().eq(
        "id",
        messageRoute[1],
      ).eq("sender_id", userId).select("id").maybeSingle();
      if (error) throw error;
      if (!data) fail("You can only delete your own messages.", 403);
      return response(200, { ok: true });
    }
    if (method === "GET" && pathname === "/export") {
      const [{ data: profile }, { data: tasks }, { data: messages }] =
        await Promise.all([
          db.from("profiles").select("name,email,bio,avatar").eq("id", userId)
            .maybeSingle(),
          db.from("tasks").select(
            "title,description,category,due_date,priority,visibility,done,repeat,target_minutes,created_at",
          ).eq("user_id", userId),
          db.from("messages").select("content,created_at").eq(
            "sender_id",
            userId,
          ),
        ]);
      return response(200, {
        exportedAt: new Date().toISOString(),
        account: profile || {},
        tasks: (tasks || []).map((row) => ({
          title: row.title,
          description: row.description,
          category: row.category,
          dueDate: row.due_date,
          priority: row.priority,
          visibility: row.visibility,
          done: row.done,
          repeat: row.repeat,
          focusMinutes: row.target_minutes,
          createdAt: row.created_at,
        })),
        messagesSent: (messages || []).map((row) => ({
          content: row.content,
          createdAt: row.created_at,
        })),
      });
    }
    if (method === "POST" && pathname === "/account/delete") {
      if (body.confirm !== "DELETE") fail("Type DELETE to confirm.");
      const { data: ownedCircles, error: circlesError } = await db.from(
        "circles",
      ).select("id").eq("owner_id", userId);
      if (circlesError) throw circlesError;
      for (const circle of ownedCircles || []) {
        const { data: remaining, error } = await db.from("circle_members")
          .select("user_id,role,joined_at").eq("circle_id", circle.id).neq(
            "user_id",
            userId,
          ).order("joined_at", { ascending: true });
        if (error) throw error;
        if (!remaining?.length) {
          const { error: deleteError } = await db.from("circles").delete().eq(
            "id",
            circle.id,
          );
          if (deleteError) throw deleteError;
        } else {
          const next = remaining.find((member) => member.role === "admin") ||
            remaining[0];
          const { error: transferError } = await db.from("circles").update({
            owner_id: next.user_id,
          }).eq("id", circle.id);
          if (transferError) throw transferError;
          if (next.role === "admin") {
            const { error: roleError } = await db.from("circle_members").update(
              { role: "member" },
            ).eq("circle_id", circle.id).eq("user_id", next.user_id);
            if (roleError) throw roleError;
          }
        }
      }
      const { error } = await db.auth.admin.deleteUser(userId);
      if (error) throw error;
      return response(200, { ok: true });
    }
    fail(
      `The Supabase migration API does not implement ${method} ${pathname} yet.`,
      501,
    );
  } catch (error) {
    console.error("Supabase API request failed:", error);
    return response(Number((error as any)?.status) || 500, {
      error: error instanceof Error
        ? error.message
        : "The request failed. Please try again.",
    });
  }
});
