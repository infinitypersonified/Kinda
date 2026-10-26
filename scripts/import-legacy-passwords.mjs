import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const exportDir = path.resolve(process.argv[2] || "./convex-export-live");
const mapFile = path.resolve("./.supabase-user-map.json");
const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in the private migration env file.");
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const userIds = JSON.parse(await readFile(mapFile, "utf8"));

async function documents(file) {
  const content = await readFile(path.join(exportDir, file), "utf8");
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

const users = await documents("_components/betterAuth/user/documents.jsonl");
const accounts = await documents("_components/betterAuth/account/documents.jsonl");
const userEmails = new Map(users.map((user) => [
  String(user._id),
  String(user.email || "").trim().toLowerCase(),
]));
const credentials = accounts.filter((account) =>
  account.providerId === "credential" && typeof account.password === "string"
);
if (!credentials.length) {
  throw new Error("The Convex export has no credential account password hashes.");
}

const rows = credentials.map((account) => {
  const legacyUserId = String(account.userId || "");
  const userId = userIds[legacyUserId];
  const email = userEmails.get(legacyUserId);
  if (!userId || !email) {
    throw new Error("A password account could not be matched to an imported Supabase user.");
  }
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(account.password)) {
    throw new Error("A credential hash is not in the supported Better Auth scrypt format.");
  }
  return { user_id: userId, email, password_hash: account.password };
});
if (new Set(rows.map((row) => row.user_id)).size !== rows.length) {
  throw new Error("The export has duplicate credential accounts for an imported user.");
}

const { error } = await supabase.from("legacy_password_import").upsert(rows, {
  onConflict: "user_id",
});
if (error) throw new Error(`Could not import legacy password hashes: ${error.message}`);
console.log(`Imported ${rows.length} protected legacy password hashes. Hash values were not printed.`);
