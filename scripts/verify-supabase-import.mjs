import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in the private migration env file.");
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const tables = [
  "profiles", "circles", "circle_members", "invites", "friendships", "assignments",
  "tasks", "circle_tasks", "messages", "push_subscriptions", "calendar_feeds",
  "telegram_links", "telegram_link_tokens", "google_calendar_credentials",
  "google_calendar_oauth_states", "google_calendar_task_links",
  "google_calendar_sync_states", "typing", "nudges", "activities", "reactions",
];

const counts = {};
for (const table of tables) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`Count failed for ${table}: ${error.code}`);
  counts[table] = count;
}

let authUsers = 0;
let confirmedUsers = 0;
let emailIdentityUsers = 0;
for (let page = 1; ; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw new Error(`Auth count failed: ${error.code}`);
  authUsers += data.users.length;
  confirmedUsers += data.users.filter((user) => Boolean(user.email_confirmed_at)).length;
  emailIdentityUsers += data.users.filter((user) =>
    user.identities?.some((identity) => identity.provider === "email")
  ).length;
  if (data.users.length < 1000) break;
}

console.log(JSON.stringify({ authUsers, confirmedUsers, emailIdentityUsers, tables: counts }, null, 2));
