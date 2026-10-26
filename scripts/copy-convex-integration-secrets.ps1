$ErrorActionPreference = "Stop"

$deployment = "outgoing-cuttlefish-138"
$names = @(
  "SITE_URL",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET"
)
$values = [ordered]@{}

foreach ($name in $names) {
  $captured = (& npx.cmd convex env get $name --deployment $deployment 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or !$captured) {
    throw "Could not retrieve the existing Convex setting $name. No values were printed."
  }
  $values[$name] = $captured
}

$schedulerBytes = [byte[]]::new(32)
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($schedulerBytes)
$rng.Dispose()
$schedulerSecret = [Convert]::ToBase64String($schedulerBytes).TrimEnd([char]'=').Replace('+', '-').Replace('/', '_')
$values["KINDA_SCHEDULER_SECRET"] = $schedulerSecret

$functionEnvPath = Join-Path $PSScriptRoot "..\supabase\functions\.env"
$functionEnvPath = [IO.Path]::GetFullPath($functionEnvPath)
$envLines = foreach ($entry in $values.GetEnumerator()) { "$($entry.Key)=$($entry.Value)" }
[IO.File]::WriteAllLines($functionEnvPath, [string[]]$envLines, [Text.UTF8Encoding]::new($false))

$frontendEnvPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.env.local"))
$frontendEnv = [IO.File]::ReadAllText($frontendEnvPath)
$publicKeyLine = "VITE_VAPID_PUBLIC_KEY=$($values['VAPID_PUBLIC_KEY'])"
if ($frontendEnv -match '(?m)^VITE_VAPID_PUBLIC_KEY=.*$') {
  $frontendEnv = [regex]::Replace($frontendEnv, '(?m)^VITE_VAPID_PUBLIC_KEY=.*$', [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $publicKeyLine }, 1)
} else {
  $frontendEnv = $frontendEnv.TrimEnd() + "`r`n$publicKeyLine`r`n"
}
[IO.File]::WriteAllText($frontendEnvPath, $frontendEnv, [Text.UTF8Encoding]::new($false))

$schedulerUrl = "https://wftwfejbakomjzzhwrir.supabase.co/functions/v1/scheduler"
$escapedSchedulerSecret = $schedulerSecret.Replace("'", "''")
$schedulerSql = @'
-- Run once after the Supabase frontend cutover to enable background jobs.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('__SCHEDULER_URL__', 'kinda_scheduler_url');
select vault.create_secret('__SCHEDULER_SECRET__', 'kinda_scheduler_secret');
select cron.schedule(
  'kinda-background-jobs',
  '* * * * *',
  $$ select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'kinda_scheduler_url'),
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-kinda-scheduler-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'kinda_scheduler_secret')),
       body := '{}'::jsonb
     ); $$
);
'@
$schedulerSql = $schedulerSql.Replace("__SCHEDULER_URL__", $schedulerUrl).Replace("__SCHEDULER_SECRET__", $escapedSchedulerSecret)
$schedulerSqlPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\supabase\scheduler-setup.local.sql"))
[IO.File]::WriteAllText($schedulerSqlPath, $schedulerSql, [Text.UTF8Encoding]::new($false))

$null = & npx.cmd supabase secrets set --env-file (Join-Path $PSScriptRoot "..\supabase\functions\.env") 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "Supabase rejected the integration secrets upload. CLI output suppressed to avoid exposing values."
}

Write-Output "Transferred the existing site, push, and Google Calendar settings to Supabase (values hidden)."
Write-Output "Updated the local VITE_VAPID_PUBLIC_KEY setting."
Write-Output "Generated a private scheduler key and saved one-time cron setup SQL to supabase/scheduler-setup.local.sql."
Write-Output "The cron SQL was prepared but not run; the scheduler remains inactive until the app cutover."
