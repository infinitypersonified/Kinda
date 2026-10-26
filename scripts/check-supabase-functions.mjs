const supabaseUrl = process.env.SUPABASE_URL;
if (!supabaseUrl) throw new Error("Set SUPABASE_URL in the private migration env file.");

const checks = [
  {
    name: "API rejects an unauthenticated request",
    url: `${supabaseUrl}/functions/v1/api`,
    body: { path: "/me", method: "GET" },
  },
  {
    name: "Scheduler rejects a request without its secret",
    url: `${supabaseUrl}/functions/v1/scheduler`,
    body: {},
  },
];

let failed = false;
for (const check of checks) {
  const response = await fetch(check.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(check.body),
  });
  console.log(`${check.name}: HTTP ${response.status}`);
  if (response.status !== 401) failed = true;
}

if (failed) process.exitCode = 1;
