import { createClient } from "npm:@supabase/supabase-js@2";
import { scryptAsync } from "npm:@noble/hashes@2.4.0/scrypt.js";
import { hexToBytes } from "npm:@noble/hashes@2.4.0/utils.js";
import type { ApiDatabase } from "../_shared/database.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function serviceKey() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const keys = JSON.parse(secretKeys) as Record<string, string>;
      if (keys.default) return keys.default;
    } catch {
      // Support the service-role key name on older/local runtimes.
    }
  }
  return Deno.env.get("SUPABASE_SECRET_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

let client: ReturnType<typeof createClient<ApiDatabase>> | null = null;
function getClient(): ReturnType<typeof createClient<ApiDatabase>> | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = serviceKey();
  if (!url || !key) return null;
  client ??= createClient<ApiDatabase>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function matchesLegacyHash(password: string, encoded: string) {
  const [salt, expectedHex] = encoded.split(":");
  if (!/^[a-f0-9]{32}$/i.test(salt || "") || !/^[a-f0-9]{128}$/i.test(expectedHex || "")) {
    return false;
  }
  try {
    // Match Better Auth's default scrypt parameters and NFKC normalization.
    const actual = await scryptAsync(password.normalize("NFKC"), salt, {
      N: 16384,
      r: 16,
      p: 1,
      dkLen: 64,
      maxmem: 128 * 16384 * 16 * 2,
    });
    const expected = hexToBytes(expectedHex);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index++) {
      difference |= actual[index] ^ expected[index];
    }
    return difference === 0;
  } catch {
    return false;
  }
}

Deno.serve({ automaticCompression: true }, async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || email.length > 254 || !password || password.length > 128) {
    return json(400, { error: "Invalid email or password." });
  }

  const db = getClient();
  if (!db) return json(503, { error: "Sign-in is temporarily unavailable." });

  const emailHash = await sha256(email);
  const ip = request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "";
  const ipHash = ip ? await sha256(ip) : null;
  const { data: allowed, error: limitError } = await db.rpc(
    "consume_legacy_password_attempt",
    { p_email_hash: emailHash, p_ip_hash: ipHash },
  );
  if (limitError) return json(503, { error: "Sign-in is temporarily unavailable." });
  if (!allowed) return json(429, { error: "Too many sign-in attempts. Try again later." });

  const { data: account, error: accountError } = await db
    .from("legacy_password_import")
    .select("user_id,password_hash")
    .eq("email", email)
    .maybeSingle();
  if (accountError) return json(503, { error: "Sign-in is temporarily unavailable." });
  if (!account || !await matchesLegacyHash(password, account.password_hash)) {
    return json(401, { error: "Invalid email or password." });
  }

  const { error: updateError } = await db.auth.admin.updateUserById(
    account.user_id,
    { password },
  );
  if (updateError) return json(503, { error: "Sign-in is temporarily unavailable." });

  const { error: deleteError } = await db.from("legacy_password_import")
    .delete().eq("user_id", account.user_id);
  if (deleteError) return json(503, { error: "Sign-in is temporarily unavailable." });

  return json(200, { migrated: true });
});
