


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "private"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), coalesce(new.email, ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;


ALTER FUNCTION "private"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_circle_manager"("target_circle" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (select 1 from public.circles c where c.id = target_circle and c.owner_id = (select auth.uid()))
    or exists (select 1 from public.circle_members m where m.circle_id = target_circle and m.user_id = (select auth.uid()) and m.role = 'admin')
$$;


ALTER FUNCTION "private"."is_circle_manager"("target_circle" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_circle_member"("target_circle" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (select 1 from public.circle_members m where m.circle_id = target_circle and m.user_id = (select auth.uid()))
$$;


ALTER FUNCTION "private"."is_circle_member"("target_circle" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_friend"("target_user" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (select 1 from public.friendships f where f.user_id = (select auth.uid()) and f.friend_id = target_user)
$$;


ALTER FUNCTION "private"."is_friend"("target_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_legacy_password_attempt"("p_email_hash" "text", "p_ip_hash" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_now timestamptz := clock_timestamp();
  email_attempts integer;
  ip_attempts integer := 0;
begin
  insert into private.legacy_password_attempts as existing
    (bucket, window_started_at, attempts)
  values ('email:' || p_email_hash, v_now, 1)
  on conflict (bucket) do update set
    attempts = case
      when existing.window_started_at < v_now - interval '15 minutes' then 1
      else existing.attempts + 1
    end,
    window_started_at = case
      when existing.window_started_at < v_now - interval '15 minutes' then v_now
      else existing.window_started_at
    end
  returning attempts into email_attempts;

  if p_ip_hash is not null and p_ip_hash <> '' then
    insert into private.legacy_password_attempts as existing
      (bucket, window_started_at, attempts)
    values ('ip:' || p_ip_hash, v_now, 1)
    on conflict (bucket) do update set
      attempts = case
        when existing.window_started_at < v_now - interval '15 minutes' then 1
        else existing.attempts + 1
      end,
      window_started_at = case
        when existing.window_started_at < v_now - interval '15 minutes' then v_now
        else existing.window_started_at
      end
    returning attempts into ip_attempts;
  end if;

  return email_attempts <= 10 and (p_ip_hash is null or p_ip_hash = '' or ip_attempts <= 30);
end;
$$;


ALTER FUNCTION "public"."consume_legacy_password_attempt"("p_email_hash" "text", "p_ip_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "private"."legacy_password_attempts" (
    "bucket" "text" NOT NULL,
    "window_started_at" timestamp with time zone NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "private"."legacy_password_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "user_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activities_type_check" CHECK (("type" = ANY (ARRAY['created'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignments" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "circle_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT 'Personal'::"text" NOT NULL,
    "due_date" "date",
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "target_minutes" integer DEFAULT 25 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assignments_target_minutes_check" CHECK ((("target_minutes" >= 1) AND ("target_minutes" <= 1440)))
);


ALTER TABLE "public"."assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_feeds" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."calendar_feeds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_members" (
    "challenge_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."challenge_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "circle_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "intro" "text" DEFAULT ''::"text" NOT NULL,
    "starts_on" "date" NOT NULL,
    "days" integer NOT NULL,
    "daily_tasks" "text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "challenges_daily_tasks_check" CHECK ((("array_length"("daily_tasks", 1) >= 1) AND ("array_length"("daily_tasks", 1) <= 8))),
    CONSTRAINT "challenges_days_check" CHECK ((("days" >= 3) AND ("days" <= 60))),
    CONSTRAINT "challenges_intro_check" CHECK (("char_length"("intro") <= 500)),
    CONSTRAINT "challenges_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 60)))
);


ALTER TABLE "public"."challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."circle_members" (
    "circle_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "circle_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."circle_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."circle_tasks" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "circle_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "shared_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."circle_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."circles" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "name" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."circles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "user_id" "uuid" NOT NULL,
    "friend_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friendships_check" CHECK (("user_id" <> "friend_id"))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."google_calendar_credentials" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "user_id" "uuid" NOT NULL,
    "access_token" "text" NOT NULL,
    "refresh_token" "text" NOT NULL,
    "access_token_expires_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."google_calendar_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."google_calendar_oauth_states" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "user_id" "uuid" NOT NULL,
    "state" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."google_calendar_oauth_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."google_calendar_sync_states" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "user_id" "uuid" NOT NULL,
    "syncing" boolean DEFAULT false NOT NULL,
    "last_sync_at" timestamp with time zone,
    "last_error" "text"
);


ALTER TABLE "public"."google_calendar_sync_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."google_calendar_task_links" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "user_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "event_id" "text" NOT NULL,
    "last_title" "text" NOT NULL,
    "last_description" "text" DEFAULT ''::"text" NOT NULL,
    "last_due_date" "date" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."google_calendar_task_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invites" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "circle_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legacy_password_import" (
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."legacy_password_import" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "circle_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "reply_to" "uuid",
    "mentions" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "edited_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nudges" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "to_user_id" "uuid" NOT NULL,
    "from_user_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "seen" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."nudges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "legacy_user_id" "text",
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "bio" "text" DEFAULT ''::"text" NOT NULL,
    "avatar" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "streak_base" integer DEFAULT 0 NOT NULL,
    "streak_base_date" "date"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reactions" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "activity_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scheduler_lock" (
    "id" integer NOT NULL,
    "locked_until" timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone NOT NULL
);


ALTER TABLE "public"."scheduler_lock" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."streak_log" (
    "user_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "streak_current" integer NOT NULL,
    "streak_best" integer NOT NULL,
    "qualified" boolean NOT NULL,
    "total" integer NOT NULL,
    "done" integer NOT NULL,
    "tasks_loaded" integer DEFAULT 0 NOT NULL,
    "tz_offset" integer DEFAULT 0 NOT NULL,
    "dropped_from" integer,
    "reason" "text",
    "first_seen" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."streak_log" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."streak_monitor" WITH ("security_invoker"='true') AS
 SELECT "l"."day",
    "p"."name",
    "p"."email",
    "l"."streak_current",
    "l"."streak_best",
    "l"."qualified",
    "l"."total",
    "l"."done",
    "l"."dropped_from",
    "l"."reason",
    "l"."tasks_loaded",
    "l"."tz_offset",
    "l"."updated_at"
   FROM ("public"."streak_log" "l"
     JOIN "public"."profiles" "p" ON (("p"."id" = "l"."user_id")))
  ORDER BY "l"."day" DESC, "l"."updated_at" DESC;


ALTER VIEW "public"."streak_monitor" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT 'Personal'::"text" NOT NULL,
    "due_date" "date",
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "visibility" "text" DEFAULT 'private'::"text" NOT NULL,
    "target_minutes" integer DEFAULT 25 NOT NULL,
    "elapsed_seconds" integer DEFAULT 0 NOT NULL,
    "timer_started_at" timestamp with time zone,
    "done" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "repeat" "text" DEFAULT 'none'::"text" NOT NULL,
    "reminder_time" "text" DEFAULT ''::"text" NOT NULL,
    "reminder_at" timestamp with time zone,
    "tz_offset" integer,
    "assignment_id" "uuid",
    "assigned_by_name" "text",
    "shared_with" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "series_id" "uuid",
    "recurrence_job_for" "date",
    "moved_from" "date"[] DEFAULT '{}'::"date"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reminder_sent_for" timestamp with time zone,
    "challenge_id" "uuid",
    CONSTRAINT "tasks_elapsed_seconds_check" CHECK (("elapsed_seconds" >= 0)),
    CONSTRAINT "tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text"]))),
    CONSTRAINT "tasks_repeat_check" CHECK (("repeat" ~ '^(none|daily|weekdays|weekly|custom:[1-7](,[1-7]){0,6})$'::"text")),
    CONSTRAINT "tasks_target_minutes_check" CHECK ((("target_minutes" >= 1) AND ("target_minutes" <= 1440))),
    CONSTRAINT "tasks_visibility_check" CHECK (("visibility" = ANY (ARRAY['private'::"text", 'friends'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."telegram_link_tokens" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."telegram_link_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."telegram_links" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "legacy_id" "text",
    "user_id" "uuid" NOT NULL,
    "chat_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."telegram_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."typing" (
    "circle_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."typing" OWNER TO "postgres";


ALTER TABLE ONLY "private"."legacy_password_attempts"
    ADD CONSTRAINT "legacy_password_attempts_pkey" PRIMARY KEY ("bucket");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_feeds"
    ADD CONSTRAINT "calendar_feeds_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."calendar_feeds"
    ADD CONSTRAINT "calendar_feeds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_feeds"
    ADD CONSTRAINT "calendar_feeds_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."calendar_feeds"
    ADD CONSTRAINT "calendar_feeds_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."challenge_members"
    ADD CONSTRAINT "challenge_members_pkey" PRIMARY KEY ("challenge_id", "user_id");



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."circle_members"
    ADD CONSTRAINT "circle_members_pkey" PRIMARY KEY ("circle_id", "user_id");



ALTER TABLE ONLY "public"."circle_tasks"
    ADD CONSTRAINT "circle_tasks_circle_id_task_id_key" UNIQUE ("circle_id", "task_id");



ALTER TABLE ONLY "public"."circle_tasks"
    ADD CONSTRAINT "circle_tasks_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."circle_tasks"
    ADD CONSTRAINT "circle_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."circles"
    ADD CONSTRAINT "circles_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."circles"
    ADD CONSTRAINT "circles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("user_id", "friend_id");



ALTER TABLE ONLY "public"."google_calendar_credentials"
    ADD CONSTRAINT "google_calendar_credentials_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."google_calendar_credentials"
    ADD CONSTRAINT "google_calendar_credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."google_calendar_credentials"
    ADD CONSTRAINT "google_calendar_credentials_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."google_calendar_oauth_states"
    ADD CONSTRAINT "google_calendar_oauth_states_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."google_calendar_oauth_states"
    ADD CONSTRAINT "google_calendar_oauth_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."google_calendar_oauth_states"
    ADD CONSTRAINT "google_calendar_oauth_states_state_key" UNIQUE ("state");



ALTER TABLE ONLY "public"."google_calendar_sync_states"
    ADD CONSTRAINT "google_calendar_sync_states_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."google_calendar_sync_states"
    ADD CONSTRAINT "google_calendar_sync_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."google_calendar_sync_states"
    ADD CONSTRAINT "google_calendar_sync_states_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."google_calendar_task_links"
    ADD CONSTRAINT "google_calendar_task_links_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."google_calendar_task_links"
    ADD CONSTRAINT "google_calendar_task_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."google_calendar_task_links"
    ADD CONSTRAINT "google_calendar_task_links_user_id_task_id_key" UNIQUE ("user_id", "task_id");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_circle_id_key" UNIQUE ("circle_id");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."legacy_password_import"
    ADD CONSTRAINT "legacy_password_import_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."legacy_password_import"
    ADD CONSTRAINT "legacy_password_import_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nudges"
    ADD CONSTRAINT "nudges_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."nudges"
    ADD CONSTRAINT "nudges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_legacy_user_id_key" UNIQUE ("legacy_user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reactions"
    ADD CONSTRAINT "reactions_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."reactions"
    ADD CONSTRAINT "reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduler_lock"
    ADD CONSTRAINT "scheduler_lock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."streak_log"
    ADD CONSTRAINT "streak_log_pkey" PRIMARY KEY ("user_id", "day");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_link_tokens"
    ADD CONSTRAINT "telegram_link_tokens_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."telegram_link_tokens"
    ADD CONSTRAINT "telegram_link_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_link_tokens"
    ADD CONSTRAINT "telegram_link_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."telegram_links"
    ADD CONSTRAINT "telegram_links_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."telegram_links"
    ADD CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_links"
    ADD CONSTRAINT "telegram_links_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."typing"
    ADD CONSTRAINT "typing_pkey" PRIMARY KEY ("circle_id", "user_id");



CREATE INDEX "activities_recent_idx" ON "public"."activities" USING "btree" ("created_at" DESC);



CREATE INDEX "activities_user_created_idx" ON "public"."activities" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "assignments_circle_created_idx" ON "public"."assignments" USING "btree" ("circle_id", "created_at" DESC);



CREATE INDEX "challenges_circle_idx" ON "public"."challenges" USING "btree" ("circle_id", "starts_on" DESC);



CREATE INDEX "circle_members_user_idx" ON "public"."circle_members" USING "btree" ("user_id");



CREATE INDEX "circle_tasks_circle_idx" ON "public"."circle_tasks" USING "btree" ("circle_id", "created_at" DESC);



CREATE INDEX "circle_tasks_task_idx" ON "public"."circle_tasks" USING "btree" ("task_id");



CREATE INDEX "messages_circle_created_idx" ON "public"."messages" USING "btree" ("circle_id", "created_at" DESC);



CREATE INDEX "nudges_sender_task_created_idx" ON "public"."nudges" USING "btree" ("from_user_id", "task_id", "created_at" DESC);



CREATE INDEX "nudges_to_created_idx" ON "public"."nudges" USING "btree" ("to_user_id", "created_at" DESC);



CREATE UNIQUE INDEX "reactions_activity_user_emoji_idx" ON "public"."reactions" USING "btree" ("activity_id", "user_id", COALESCE("emoji", '❤️'::"text"));



CREATE INDEX "streak_log_day_idx" ON "public"."streak_log" USING "btree" ("day" DESC);



CREATE INDEX "tasks_assignment_idx" ON "public"."tasks" USING "btree" ("assignment_id");



CREATE INDEX "tasks_challenge_idx" ON "public"."tasks" USING "btree" ("challenge_id", "due_date");



CREATE INDEX "tasks_due_reminders_idx" ON "public"."tasks" USING "btree" ("reminder_at") WHERE (("reminder_at" IS NOT NULL) AND ("done" = false));



CREATE INDEX "tasks_friend_feed_idx" ON "public"."tasks" USING "btree" ("user_id", "done", "created_at" DESC) WHERE ("visibility" = 'friends'::"text");



CREATE INDEX "tasks_recurring_due_idx" ON "public"."tasks" USING "btree" ("due_date") WHERE (("due_date" IS NOT NULL) AND ("repeat" <> 'none'::"text"));



CREATE INDEX "tasks_series_due_idx" ON "public"."tasks" USING "btree" ("series_id", "due_date");



CREATE INDEX "tasks_user_created_idx" ON "public"."tasks" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "tasks_user_due_idx" ON "public"."tasks" USING "btree" ("user_id", "due_date");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_feeds"
    ADD CONSTRAINT "calendar_feeds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_members"
    ADD CONSTRAINT "challenge_members_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_members"
    ADD CONSTRAINT "challenge_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circle_members"
    ADD CONSTRAINT "circle_members_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circle_members"
    ADD CONSTRAINT "circle_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circle_tasks"
    ADD CONSTRAINT "circle_tasks_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circle_tasks"
    ADD CONSTRAINT "circle_tasks_shared_by_fkey" FOREIGN KEY ("shared_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circle_tasks"
    ADD CONSTRAINT "circle_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."circles"
    ADD CONSTRAINT "circles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."google_calendar_credentials"
    ADD CONSTRAINT "google_calendar_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."google_calendar_oauth_states"
    ADD CONSTRAINT "google_calendar_oauth_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."google_calendar_sync_states"
    ADD CONSTRAINT "google_calendar_sync_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."google_calendar_task_links"
    ADD CONSTRAINT "google_calendar_task_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."google_calendar_task_links"
    ADD CONSTRAINT "google_calendar_task_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."legacy_password_import"
    ADD CONSTRAINT "legacy_password_import_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_reply_to_fkey" FOREIGN KEY ("reply_to") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nudges"
    ADD CONSTRAINT "nudges_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nudges"
    ADD CONSTRAINT "nudges_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nudges"
    ADD CONSTRAINT "nudges_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reactions"
    ADD CONSTRAINT "reactions_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reactions"
    ADD CONSTRAINT "reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."streak_log"
    ADD CONSTRAINT "streak_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."telegram_link_tokens"
    ADD CONSTRAINT "telegram_link_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."telegram_links"
    ADD CONSTRAINT "telegram_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."typing"
    ADD CONSTRAINT "typing_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."typing"
    ADD CONSTRAINT "typing_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activities create self" ON "public"."activities" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "activities"."task_id") AND ("t"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "activities read self or friend" ON "public"."activities" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_friend"("activities"."user_id") AS "is_friend")));



ALTER TABLE "public"."assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assignments manager create" ON "public"."assignments" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_circle_manager"("assignments"."circle_id") AS "is_circle_manager") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "assignments manager delete" ON "public"."assignments" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_circle_manager"("assignments"."circle_id") AS "is_circle_manager"));



CREATE POLICY "assignments manager update" ON "public"."assignments" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_circle_manager"("assignments"."circle_id") AS "is_circle_manager")) WITH CHECK (( SELECT "private"."is_circle_manager"("assignments"."circle_id") AS "is_circle_manager"));



CREATE POLICY "assignments read circle" ON "public"."assignments" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_circle_member"("assignments"."circle_id") AS "is_circle_member"));



CREATE POLICY "calendar credentials self" ON "public"."google_calendar_credentials" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "calendar feed self" ON "public"."calendar_feeds" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "calendar links self" ON "public"."google_calendar_task_links" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "calendar oauth states self" ON "public"."google_calendar_oauth_states" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "calendar sync state self" ON "public"."google_calendar_sync_states" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."calendar_feeds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."challenge_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."challenges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "circle tasks create own task" ON "public"."circle_tasks" FOR INSERT TO "authenticated" WITH CHECK ((("shared_by" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_circle_member"("circle_tasks"."circle_id") AS "is_circle_member") AND (EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "circle_tasks"."task_id") AND ("t"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "circle tasks manager delete or owner unlink" ON "public"."circle_tasks" FOR DELETE TO "authenticated" USING ((( SELECT "private"."is_circle_manager"("circle_tasks"."circle_id") AS "is_circle_manager") OR ("shared_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "circle tasks read members" ON "public"."circle_tasks" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_circle_member"("circle_tasks"."circle_id") AS "is_circle_member"));



ALTER TABLE "public"."circle_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."circle_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."circles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "circles create as owner" ON "public"."circles" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "circles manager update" ON "public"."circles" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_circle_manager"("circles"."id") AS "is_circle_manager")) WITH CHECK (( SELECT "private"."is_circle_manager"("circles"."id") AS "is_circle_manager"));



CREATE POLICY "circles owner delete" ON "public"."circles" FOR DELETE TO "authenticated" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "circles read members" ON "public"."circles" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_circle_member"("circles"."id") AS "is_circle_member"));



ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friendships create own" ON "public"."friendships" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("friend_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "friendships delete own" ON "public"."friendships" FOR DELETE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("friend_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "friendships read own" ON "public"."friendships" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("friend_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."google_calendar_credentials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."google_calendar_oauth_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."google_calendar_sync_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."google_calendar_task_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invites manager create" ON "public"."invites" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_circle_manager"("invites"."circle_id") AS "is_circle_manager") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "invites manager delete" ON "public"."invites" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_circle_manager"("invites"."circle_id") AS "is_circle_manager"));



CREATE POLICY "invites manager read" ON "public"."invites" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_circle_manager"("invites"."circle_id") AS "is_circle_manager"));



CREATE POLICY "invites manager update" ON "public"."invites" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_circle_manager"("invites"."circle_id") AS "is_circle_manager")) WITH CHECK (( SELECT "private"."is_circle_manager"("invites"."circle_id") AS "is_circle_manager"));



ALTER TABLE "public"."legacy_password_import" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "managers add members" ON "public"."circle_members" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_circle_manager"("circle_members"."circle_id") AS "is_circle_manager"));



CREATE POLICY "managers or self remove membership" ON "public"."circle_members" FOR DELETE TO "authenticated" USING ((( SELECT "private"."is_circle_manager"("circle_members"."circle_id") AS "is_circle_manager") OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers update membership" ON "public"."circle_members" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_circle_manager"("circle_members"."circle_id") AS "is_circle_manager")) WITH CHECK (( SELECT "private"."is_circle_manager"("circle_members"."circle_id") AS "is_circle_manager"));



CREATE POLICY "members read circle" ON "public"."circle_members" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_circle_member"("circle_members"."circle_id") AS "is_circle_member"));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages delete own or manager" ON "public"."messages" FOR DELETE TO "authenticated" USING ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_circle_manager"("messages"."circle_id") AS "is_circle_manager")));



CREATE POLICY "messages edit own" ON "public"."messages" FOR UPDATE TO "authenticated" USING ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_circle_member"("messages"."circle_id") AS "is_circle_member"))) WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_circle_member"("messages"."circle_id") AS "is_circle_member")));



CREATE POLICY "messages read members" ON "public"."messages" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_circle_member"("messages"."circle_id") AS "is_circle_member"));



CREATE POLICY "messages send as self" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_circle_member"("messages"."circle_id") AS "is_circle_member")));



ALTER TABLE "public"."nudges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nudges create as sender" ON "public"."nudges" FOR INSERT TO "authenticated" WITH CHECK (("from_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "nudges read sender or recipient" ON "public"."nudges" FOR SELECT TO "authenticated" USING ((("to_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("from_user_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles insert self" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "profiles read self or friend" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_friend"("profiles"."id") AS "is_friend")));



CREATE POLICY "profiles update self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "push subscriptions self" ON "public"."push_subscriptions" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reactions manage own" ON "public"."reactions" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "reactions read activity audience" ON "public"."reactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."activities" "a"
  WHERE (("a"."id" = "reactions"."activity_id") AND (("a"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_friend"("a"."user_id") AS "is_friend"))))));



CREATE POLICY "recipients update own nudge" ON "public"."nudges" FOR UPDATE TO "authenticated" USING (("to_user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("to_user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."scheduler_lock" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sender delete own nudge" ON "public"."nudges" FOR DELETE TO "authenticated" USING ((("from_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("to_user_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."streak_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks delete own" ON "public"."tasks" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tasks insert own" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tasks read owner or shared circle or friend" ON "public"."tasks" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("visibility" = 'friends'::"text") AND ( SELECT "private"."is_friend"("tasks"."user_id") AS "is_friend") AND (("cardinality"("shared_with") = 0) OR (( SELECT "auth"."uid"() AS "uid") = ANY ("shared_with")))) OR (EXISTS ( SELECT 1
   FROM "public"."circle_tasks" "ct"
  WHERE (("ct"."task_id" = "ct"."id") AND ( SELECT "private"."is_circle_member"("ct"."circle_id") AS "is_circle_member"))))));



CREATE POLICY "tasks update own" ON "public"."tasks" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "telegram links self" ON "public"."telegram_links" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "telegram tokens self" ON "public"."telegram_link_tokens" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."telegram_link_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."telegram_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."typing" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "typing read circle" ON "public"."typing" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_circle_member"("typing"."circle_id") AS "is_circle_member"));



CREATE POLICY "typing remove own" ON "public"."typing" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "typing set own" ON "public"."typing" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_circle_member"("typing"."circle_id") AS "is_circle_member")));



CREATE POLICY "typing update own" ON "public"."typing" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."activities";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."assignments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."circle_members";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."circle_tasks";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."circles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friendships";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."nudges";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tasks";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."typing";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






GRANT USAGE ON SCHEMA "private" TO "authenticated";











































































































































































REVOKE ALL ON FUNCTION "private"."handle_new_user"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."is_circle_manager"("target_circle" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_circle_manager"("target_circle" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_circle_member"("target_circle" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_circle_member"("target_circle" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_friend"("target_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_friend"("target_user" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."consume_legacy_password_attempt"("p_email_hash" "text", "p_ip_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_legacy_password_attempt"("p_email_hash" "text", "p_ip_hash" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";
























GRANT ALL ON TABLE "public"."activities" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."activities" TO "authenticated";



GRANT ALL ON TABLE "public"."assignments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."assignments" TO "authenticated";



GRANT ALL ON TABLE "public"."calendar_feeds" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."calendar_feeds" TO "authenticated";



GRANT ALL ON TABLE "public"."challenge_members" TO "anon";
GRANT ALL ON TABLE "public"."challenge_members" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_members" TO "service_role";



GRANT ALL ON TABLE "public"."challenges" TO "anon";
GRANT ALL ON TABLE "public"."challenges" TO "authenticated";
GRANT ALL ON TABLE "public"."challenges" TO "service_role";



GRANT ALL ON TABLE "public"."circle_members" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."circle_members" TO "authenticated";



GRANT ALL ON TABLE "public"."circle_tasks" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."circle_tasks" TO "authenticated";



GRANT ALL ON TABLE "public"."circles" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."circles" TO "authenticated";



GRANT ALL ON TABLE "public"."friendships" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."friendships" TO "authenticated";



GRANT ALL ON TABLE "public"."google_calendar_credentials" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."google_calendar_credentials" TO "authenticated";



GRANT ALL ON TABLE "public"."google_calendar_oauth_states" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."google_calendar_oauth_states" TO "authenticated";



GRANT ALL ON TABLE "public"."google_calendar_sync_states" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."google_calendar_sync_states" TO "authenticated";



GRANT ALL ON TABLE "public"."google_calendar_task_links" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."google_calendar_task_links" TO "authenticated";



GRANT ALL ON TABLE "public"."invites" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."invites" TO "authenticated";



GRANT ALL ON TABLE "public"."legacy_password_import" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."messages" TO "authenticated";



GRANT ALL ON TABLE "public"."nudges" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."nudges" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."push_subscriptions" TO "authenticated";



GRANT ALL ON TABLE "public"."reactions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."reactions" TO "authenticated";



GRANT ALL ON TABLE "public"."scheduler_lock" TO "anon";
GRANT ALL ON TABLE "public"."scheduler_lock" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduler_lock" TO "service_role";



GRANT ALL ON TABLE "public"."streak_log" TO "service_role";



GRANT ALL ON TABLE "public"."streak_monitor" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."tasks" TO "authenticated";



GRANT ALL ON TABLE "public"."telegram_link_tokens" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."telegram_link_tokens" TO "authenticated";



GRANT ALL ON TABLE "public"."telegram_links" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."telegram_links" TO "authenticated";



GRANT ALL ON TABLE "public"."typing" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."typing" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































