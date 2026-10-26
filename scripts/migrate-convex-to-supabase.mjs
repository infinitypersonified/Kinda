import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const exportDir = path.resolve(process.argv[2] || "./convex-export");
const mapFile = path.resolve("./.supabase-user-map.json");
const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in a private migration env file.");
}
const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

async function filesUnder(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(full));
    else if (entry.isFile() && entry.name === "documents.jsonl") result.push(full);
  }
  return result;
}

const documentFiles = await filesUnder(exportDir);
async function readTable(tableName) {
  const files = documentFiles.filter(file => path.basename(path.dirname(file)).toLowerCase() === tableName.toLowerCase());
  if (!files.length) return [];
  const rows = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const line of content.split(/\r?\n/)) if (line.trim()) rows.push(JSON.parse(line));
  }
  return rows;
}

const asDateTime = value => value == null ? null : new Date(typeof value === "number" ? value : value).toISOString();
const asDate = value => value == null ? null : String(value).slice(0, 10);
const getId = doc => String(doc?._id ?? "");
const mapUserId = (legacyId, context) => {
  const mapped = userIds[legacyId];
  if (!mapped) throw new Error(`${context} references a user missing from the Convex export.`);
  return mapped;
};
const previousMap = await readFile(mapFile, "utf8").then(JSON.parse).catch(() => ({}));
const userIds = { ...previousMap };
const users = await readTable("user");
const appProfiles = await readTable("profiles");
const appProfilesByUser = new Map(appProfiles.map(row => [row.userId, row]));
if (!users.length) {
  throw new Error("No Better Auth user documents were found in this Convex export. Keep Convex intact and provide a full deployment export that includes component data.");
}

async function checked(label, result) {
  const response = await result;
  if (response.error) throw new Error(`${label}: ${response.error.message}`);
  return response.data;
}

async function readExistingIds(table) {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await checked(
      `Read existing ${table}`,
      supabase.from(table).select("id,legacy_id").range(offset, offset + 999),
    );
    result.push(...(page || []));
    if (!page || page.length < 1000) return result;
  }
}

async function verifyLegacyRows(source, target, sourceRows) {
  const persisted = await readExistingIds(target);
  const legacyIds = new Set((persisted || []).map(row => row.legacy_id).filter(Boolean));
  const missing = sourceRows.reduce((count, row) => count + Number(!legacyIds.has(getId(row))), 0);
  if (missing) throw new Error(`${source}: ${missing} Convex records are missing from Supabase after import.`);
  console.log(`${source}: verified ${sourceRows.length}/${sourceRows.length} records persisted`);
}

async function reportPersistedCount(label, table, expectedAtLeast) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`Verify ${label}: ${error.message}`);
  if ((count || 0) < expectedAtLeast) {
    throw new Error(`Verify ${label}: expected at least ${expectedAtLeast} rows, found ${count || 0}.`);
  }
  console.log(`${label}: ${count || 0} rows persisted (Convex import expected ${expectedAtLeast})`);
}

let usersCreated = 0;
async function findExistingAuthUser(email, legacyId) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not inspect Supabase Auth users: ${error.message}`);
    const match = data.users.find(user => user.email?.toLowerCase() === email || user.user_metadata?.legacy_user_id === legacyId);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
}
for (const user of users) {
  const legacyId = getId(user);
  const email = String(user.email || "").trim().toLowerCase();
  if (!email) throw new Error(`User ${legacyId} has no email address; fix the export before importing.`);
  let authId = userIds[legacyId];
  if (authId) {
    const { data, error } = await supabase.auth.admin.getUserById(authId);
    if (error || !data.user) authId = undefined;
  }
  if (!authId) {
    const existingUser = await findExistingAuthUser(email, legacyId);
    if (existingUser) authId = existingUser.id;
    else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { name: user.name || "Kinda member", legacy_user_id: legacyId },
      });
      if (error || !data.user) throw new Error(`Could not provision a Supabase Auth user (${error?.message || "no user returned"}).`);
      authId = data.user.id;
      usersCreated++;
    }
    userIds[legacyId] = authId;
    await writeFile(mapFile, JSON.stringify(userIds, null, 2), { mode: 0o600 });
  }
  const profile = appProfilesByUser.get(legacyId);
  await checked("Import profile", supabase.from("profiles").upsert({
    id: authId,
    legacy_user_id: legacyId,
    name: user.name || "Kinda member",
    email,
    bio: profile?.bio || "",
    avatar: profile?.avatar || "",
  }, { onConflict: "id" }));
}

const ids = Object.create(null);
const tableSpecs = [
  ["circles", "circles", row => ({ name: row.name, owner_id: userIds[row.ownerId], created_at: asDateTime(row.createdAt) })],
  ["assignments", "assignments", row => ({ circle_id: ids.circles[row.circleId], created_by: userIds[row.createdBy], title: row.title, description: row.description || "", category: row.category || "Personal", due_date: asDate(row.dueDate), priority: row.priority || "normal", target_minutes: row.targetMinutes || 25, created_at: asDateTime(row.createdAt) })],
  ["tasks", "tasks", row => ({ user_id: mapUserId(row.userId, "A task"), title: row.title, description: row.description || "", category: row.category || "Personal", due_date: asDate(row.dueDate), priority: row.priority || "normal", visibility: row.visibility || "private", target_minutes: row.targetMinutes || 25, elapsed_seconds: row.elapsedSeconds || 0, timer_started_at: asDateTime(row.timerStartedAt), done: Boolean(row.done), completed_at: asDateTime(row.completedAt), repeat: row.repeat || "none", reminder_time: row.reminderTime || "", reminder_at: asDateTime(row.reminderAt), tz_offset: row.tzOffset ?? null, assigned_by_name: row.assignedByName || null, shared_with: (row.sharedWith || []).map(id => mapUserId(id, "A shared task")), recurrence_job_for: asDate(row.recurrenceJobFor), moved_from: row.movedFrom || [], created_at: asDateTime(row.createdAt) })],
  ["circleTasks", "circle_tasks", row => ({ circle_id: ids.circles[row.circleId], task_id: ids.tasks[row.taskId], shared_by: userIds[row.sharedBy], created_at: asDateTime(row.createdAt) })],
  ["messages", "messages", row => ({ circle_id: ids.circles[row.circleId], sender_id: mapUserId(row.senderId, "A message"), content: row.content, reply_to: null, mentions: (row.mentions || []).map(id => mapUserId(id, "A message mention")), edited_at: asDateTime(row.editedAt), created_at: asDateTime(row.createdAt) })],
  ["invites", "invites", row => ({ circle_id: ids.circles[row.circleId], token: row.token, created_by: userIds[row.createdBy], created_at: asDateTime(row.createdAt), expires_at: asDateTime(row.expiresAt) })],
  ["activities", "activities", row => ({ user_id: userIds[row.userId], task_id: ids.tasks[row.taskId], type: row.type, created_at: asDateTime(row.createdAt) })],
  ["reactions", "reactions", row => ({ activity_id: ids.activities[row.activityId], user_id: userIds[row.userId], emoji: row.emoji || null, created_at: asDateTime(row.createdAt) })],
  ["nudges", "nudges", row => ({ to_user_id: userIds[row.toUserId], from_user_id: userIds[row.fromUserId], task_id: ids.tasks[row.taskId], seen: Boolean(row.seen), created_at: asDateTime(row.createdAt) })],
  ["pushSubscriptions", "push_subscriptions", row => ({ user_id: userIds[row.userId], endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth, created_at: asDateTime(row.createdAt) })],
  ["calendarFeeds", "calendar_feeds", row => ({ user_id: userIds[row.userId], token: row.token, created_at: asDateTime(row.createdAt) })],
  ["telegramLinks", "telegram_links", row => ({ user_id: userIds[row.userId], chat_id: row.chatId, created_at: asDateTime(row.createdAt) })],
  ["telegramLinkTokens", "telegram_link_tokens", row => ({ user_id: userIds[row.userId], token: row.token, expires_at: asDateTime(row.expiresAt) })],
  ["googleCalendarCredentials", "google_calendar_credentials", row => ({ user_id: userIds[row.userId], access_token: row.accessToken, refresh_token: row.refreshToken, access_token_expires_at: asDateTime(row.accessTokenExpiresAt), updated_at: asDateTime(row.updatedAt) })],
  ["googleCalendarOAuthStates", "google_calendar_oauth_states", row => ({ user_id: userIds[row.userId], state: row.state, expires_at: asDateTime(row.expiresAt) })],
  ["googleCalendarTaskLinks", "google_calendar_task_links", row => ({ user_id: userIds[row.userId], task_id: ids.tasks[row.taskId], event_id: row.eventId, last_title: row.lastTitle, last_description: row.lastDescription || "", last_due_date: asDate(row.lastDueDate), updated_at: asDateTime(row.updatedAt) })],
  ["googleCalendarSyncStates", "google_calendar_sync_states", row => ({ user_id: userIds[row.userId], syncing: Boolean(row.syncing), last_sync_at: asDateTime(row.lastSyncAt), last_error: row.lastError || null })],
];

let totalRows = 0;
for (const [source, target, convert] of tableSpecs) {
  const sourceRows = await readTable(source);
  const idMap = ids[source] = Object.create(null);
  const existing = await readExistingIds(target);
  for (const row of existing || []) if (row.legacy_id) idMap[row.legacy_id] = row.id;
  for (const row of sourceRows) if (!idMap[getId(row)]) idMap[getId(row)] = crypto.randomUUID();
  let imported = 0;
  for (let offset = 0; offset < sourceRows.length; offset += 250) {
    const rows = sourceRows.slice(offset, offset + 250).map(row => ({
      id: idMap[getId(row)], legacy_id: getId(row), ...convert(row),
    }));
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        if (value === undefined) delete row[key];
      }
    }
    if (rows.length) await checked(`Import ${source}`, supabase.from(target).upsert(rows, { onConflict: "legacy_id" }));
    imported += rows.length;
  }
  totalRows += imported;
  console.log(`${source}: ${imported} rows`);
  await verifyLegacyRows(source, target, sourceRows);
}

const circleRows = await readTable("circles");
const circleOwners = new Map(circleRows.map(row => [getId(row), row.ownerId]));
const memberRows = await readTable("circleMembers");
const importedMembers = memberRows.map(row => ({
  circle_id: ids.circles[row.circleId],
  user_id: mapUserId(row.userId, "A circle membership"),
  role: circleOwners.get(row.circleId) === row.userId ? "owner" : (row.role === "admin" ? "admin" : "member"),
  joined_at: asDateTime(row.joinedAt),
}));
if (importedMembers.some(row => !row.circle_id)) throw new Error("A circle membership references a circle missing from the Convex export.");
for (let offset = 0; offset < importedMembers.length; offset += 250) {
  await checked("Import circle members", supabase.from("circle_members").upsert(
    importedMembers.slice(offset, offset + 250),
    { onConflict: "circle_id,user_id" },
  ));
}
totalRows += importedMembers.length;
await reportPersistedCount("circleMembers", "circle_members", importedMembers.length);
const friendshipRows = await readTable("friendships");
const importedFriendships = friendshipRows.map(row => ({
  user_id: mapUserId(row.userId, "A friendship"), friend_id: mapUserId(row.friendId, "A friendship"), created_at: asDateTime(row.createdAt),
}));
for (let offset = 0; offset < importedFriendships.length; offset += 250) {
  await checked("Import friendships", supabase.from("friendships").upsert(
    importedFriendships.slice(offset, offset + 250),
    { onConflict: "user_id,friend_id" },
  ));
}
totalRows += importedFriendships.length;
await reportPersistedCount("friendships", "friendships", importedFriendships.length);
const typingRows = await readTable("typing");
const importedTyping = typingRows.map(row => ({
  circle_id: ids.circles[row.circleId], user_id: mapUserId(row.userId, "A typing record"), updated_at: asDateTime(row.updatedAt),
}));
if (importedTyping.some(row => !row.circle_id)) throw new Error("A typing record references a circle missing from the Convex export.");
for (let offset = 0; offset < importedTyping.length; offset += 250) {
  await checked("Import typing", supabase.from("typing").upsert(
    importedTyping.slice(offset, offset + 250),
    { onConflict: "circle_id,user_id" },
  ));
}
totalRows += importedTyping.length;
await reportPersistedCount("typing", "typing", importedTyping.length);

const taskRows = await readTable("tasks");
if (taskRows.length) {
  const updates = taskRows.filter(row => row.assignmentId || row.seriesId).map(row => {
    const assignmentId = row.assignmentId ? ids.assignments?.[row.assignmentId] : null;
    const seriesId = row.seriesId ? ids.tasks[row.seriesId] : null;
    if (row.assignmentId && !assignmentId) throw new Error("A task assignment reference is missing from the Convex export.");
    if (row.seriesId && !seriesId) throw new Error("A recurring task series reference is missing from the Convex export.");
    return { id: ids.tasks[getId(row)], assignment_id: assignmentId, series_id: seriesId };
  });
  for (const row of updates) await checked("Link imported task", supabase.from("tasks").update({ assignment_id: row.assignment_id, series_id: row.series_id }).eq("id", row.id));
}
const messageRows = await readTable("messages");
for (const row of messageRows.filter(message => message.replyTo)) {
  const replyId = ids.messages[row.replyTo];
  if (!replyId) throw new Error("A message reply reference is missing from the Convex export.");
  await checked("Link imported message reply", supabase.from("messages")
    .update({ reply_to: replyId }).eq("id", ids.messages[getId(row)]));
}

console.log(`Auth users provisioned: ${usersCreated}`);
console.log(`App records imported: ${totalRows}`);
console.log("Existing Better Auth passwords are not imported; users can sign in with Google using the same verified email, or use email recovery if configured.");
