import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseFile = path.resolve(process.env.KINDA_DB_PATH || path.join(root, "data", "kinda.sqlite"));
mkdirSync(path.dirname(databaseFile), { recursive: true });
const db = new DatabaseSync(databaseFile);
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    bio TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS group_invites (
    group_id INTEGER PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS friendships (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, friend_id),
    CHECK (user_id <> friend_id)
  );
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Personal',
    due TEXT NOT NULL DEFAULT 'Today',
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'normal',
    visibility TEXT NOT NULL DEFAULT 'private',
    target_minutes INTEGER NOT NULL DEFAULT 25,
    elapsed_seconds INTEGER NOT NULL DEFAULT 0,
    timer_started_at TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS goals_user_created ON goals(user_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_group_id ON messages(group_id, id);
  CREATE TABLE IF NOT EXISTS task_activities (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('created', 'completed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS task_activities_recent ON task_activities(created_at DESC);
  CREATE TABLE IF NOT EXISTS activity_reactions (
    activity_id INTEGER NOT NULL REFERENCES task_activities(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (activity_id, user_id)
  );
`);
db.exec("PRAGMA journal_mode = WAL");

function ensureColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!existing.some(item => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("users", "bio", "TEXT NOT NULL DEFAULT ''");
ensureColumn("goals", "due_date", "TEXT");
ensureColumn("goals", "priority", "TEXT NOT NULL DEFAULT 'normal'");
const groupIndexes = db.prepare("PRAGMA index_list(groups)").all();
const hasSingleGroupPerOwner = groupIndexes.some(index => index.unique && db.prepare(`PRAGMA index_info(${index.name})`)
  .all().map(column => column.name).join(",") === "owner_id");
if (hasSingleGroupPerOwner) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN IMMEDIATE;
    CREATE TABLE groups_replacement (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO groups_replacement (id, name, owner_id, created_at)
      SELECT id, name, owner_id, created_at FROM groups;
    DROP TABLE groups;
    ALTER TABLE groups_replacement RENAME TO groups;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}
const groupGoalsExisted = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'group_goals'").get());
db.exec(`
  CREATE TABLE IF NOT EXISTS group_goals (
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    shared_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, goal_id)
  );
  CREATE INDEX IF NOT EXISTS group_goals_goal_id ON group_goals(goal_id);
`);
if (!groupGoalsExisted) {
  db.exec(`INSERT OR IGNORE INTO group_goals (group_id, goal_id, shared_by)
    SELECT group_members.group_id, goals.id, goals.user_id
    FROM group_members
    JOIN goals ON goals.user_id = group_members.user_id AND goals.visibility = 'friends';`);
}
db.exec(`
  UPDATE goals SET due_date = date('now')
    WHERE due_date IS NULL AND due = 'Today';
  UPDATE goals SET due_date = date('now', '+7 days')
    WHERE due_date IS NULL AND due = 'This week';
`);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};
const sessionDuration = 14 * 24 * 60 * 60 * 1000;

function json(response, status, value, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  response.end(JSON.stringify(value));
}

function cookieHeader(token, clear = false) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `kinda_session=${clear ? "" : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : Math.floor(sessionDuration / 1000)}${secure}`;
}

function sessionHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function readCookie(request, name) {
  const cookies = String(request.headers.cookie || "").split(";").map(item => item.trim());
  const item = cookies.find(cookie => cookie.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}

function getAccount(request) {
  const token = readCookie(request, "kinda_session");
  if (!token) return null;
  const record = db.prepare(`
    SELECT users.id, users.name, users.email, sessions.expires_at
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
  `).get(sessionHash(token));
  if (!record) return null;
  if (record.expires_at <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sessionHash(token));
    return null;
  }
  return { id: record.id, name: record.name, email: record.email };
}

function createSession(userId, response) {
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    sessionHash(token), userId, Date.now() + sessionDuration
  );
  response.setHeader("Set-Cookie", cookieHeader(token));
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 64 * 1024) {
      const error = new Error("Request is too large.");
      error.status = 413;
      throw error;
    }
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    const error = new Error("Please send valid JSON.");
    error.status = 400;
    throw error;
  }
}

function publicGoal(row) {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    description: row.note,
    category: row.category,
    due: row.due_date || row.due,
    dueDate: row.due_date,
    priority: row.priority || "normal",
    visibility: row.visibility,
    targetMinutes: row.target_minutes,
    elapsedSeconds: row.elapsed_seconds,
    timerStartedAt: row.timer_started_at,
    done: Boolean(row.done)
  };
}

function taskWithGroups(row) {
  return {
    ...publicGoal(row),
    groupIds: db.prepare("SELECT group_id FROM group_goals WHERE goal_id = ? ORDER BY group_id").all(row.id).map(item => item.group_id)
  };
}

function recordActivity(userId, taskId, type) {
  db.prepare("INSERT INTO task_activities (user_id, task_id, type) VALUES (?, ?, ?)").run(userId, taskId, type);
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validGroupIds(groupIds, userId) {
  if (!Array.isArray(groupIds) || groupIds.length > 20 || groupIds.some(id => !Number.isSafeInteger(id) || id < 1)) {
    return false;
  }
  if (new Set(groupIds).size !== groupIds.length) return false;
  if (!groupIds.length) return true;
  const placeholders = groupIds.map(() => "?").join(", ");
  const membership = db.prepare(`SELECT COUNT(*) AS count FROM group_members WHERE user_id = ? AND group_id IN (${placeholders})`)
    .get(userId, ...groupIds);
  return Number(membership.count) === groupIds.length;
}

function listGoals(userId) {
  return db.prepare("SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC, id DESC")
    .all(userId).map(taskWithGroups);
}

function messagesFor(groupId, after) {
  const rows = after
    ? db.prepare(`SELECT messages.id, messages.sender_id, users.name AS sender_name, messages.content, messages.created_at
        FROM messages JOIN users ON users.id = messages.sender_id
        WHERE messages.group_id = ? AND messages.id > ? ORDER BY messages.id ASC LIMIT 100`).all(groupId, after)
    : db.prepare(`SELECT messages.id, messages.sender_id, users.name AS sender_name, messages.content, messages.created_at
        FROM messages JOIN users ON users.id = messages.sender_id
        WHERE messages.group_id = ? ORDER BY messages.id DESC LIMIT 60`).all(groupId).reverse();
  return rows.map(row => ({
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    content: row.content,
    createdAt: row.created_at
  }));
}

async function serveStatic(request, response, pathname) {
  const dist = path.join(root, "dist");
  const indexFile = path.join(dist, "index.html");
  if (!existsSync(indexFile)) {
    json(response, 404, { error: "The app isn't built yet. Run npm run build first." });
    return;
  }
  const requested = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const target = path.resolve(dist, `.${requested}`);
  if (!target.startsWith(`${dist}${path.sep}`) && target !== indexFile) {
    json(response, 400, { error: "Invalid path." });
    return;
  }
  let file = target;
  try {
    const details = await stat(file);
    if (details.isDirectory()) file = indexFile;
  } catch {
    file = indexFile;
  }
  const contents = await readFile(file);
  response.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable"
  });
  response.end(contents);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname === "/api/health" && request.method === "GET") {
      json(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      const body = await readBody(request);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const inviteToken = String(body.inviteToken || "");
      const invitation = inviteToken
        ? db.prepare("SELECT groups.id, groups.name FROM group_invites JOIN groups ON groups.id = group_invites.group_id WHERE group_invites.token_hash = ?").get(sessionHash(inviteToken))
        : null;
      if (inviteToken && !invitation) {
        json(response, 404, { error: "That circle invite link is invalid or has been replaced." });
        return;
      }
      if (name.length < 2 || name.length > 60) {
        json(response, 400, { error: "Your name must be between 2 and 60 characters." });
        return;
      }
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        json(response, 400, { error: "Enter a valid email address." });
        return;
      }
      if (password.length < 8 || password.length > 128) {
        json(response, 400, { error: "Your password must be between 8 and 128 characters." });
        return;
      }
      const salt = randomBytes(16).toString("hex");
      const hash = scryptSync(password, salt, 64).toString("hex");
      let userId;
      try {
        db.exec("BEGIN IMMEDIATE");
        const result = db.prepare("INSERT INTO users (name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)")
          .run(name, email, hash, salt);
        userId = Number(result.lastInsertRowid);
        if (invitation) db.prepare("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)").run(invitation.id, userId);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        if (String(error.message).includes("UNIQUE constraint failed: users.email")) {
          json(response, 409, { error: "An account with that email already exists. Try logging in instead." });
          return;
        }
        throw error;
      }
      createSession(userId, response);
      json(response, 201, { ...db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(userId), joinedCircle: invitation?.name || null });
      return;
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const body = await readBody(request);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const inviteToken = String(body.inviteToken || "");
      const user = db.prepare("SELECT id, name, email, password_hash, password_salt FROM users WHERE email = ?").get(email);
      const candidate = user ? scryptSync(password, user.password_salt, 64) : Buffer.alloc(64);
      const valid = Boolean(user) && timingSafeEqual(candidate, Buffer.from(user.password_hash, "hex"));
      if (!valid) {
        json(response, 401, { error: "That email and password don't match. Please try again." });
        return;
      }
      const invitation = inviteToken
        ? db.prepare("SELECT groups.id, groups.name FROM group_invites JOIN groups ON groups.id = group_invites.group_id WHERE group_invites.token_hash = ?").get(sessionHash(inviteToken))
        : null;
      if (inviteToken && !invitation) {
        json(response, 404, { error: "That circle invite link is invalid or has been replaced." });
        return;
      }
      if (invitation) {
        db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)").run(invitation.id, user.id);
      }
      createSession(user.id, response);
      json(response, 200, { id: user.id, name: user.name, email: user.email, joinedCircle: invitation?.name || null });
      return;
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const token = readCookie(request, "kinda_session");
      if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sessionHash(token));
      json(response, 200, { ok: true }, { "Set-Cookie": cookieHeader("", true) });
      return;
    }

    const invitePreview = url.pathname.match(/^\/api\/invites\/([A-Za-z0-9_-]{32,})$/);
    if (invitePreview && request.method === "GET") {
      const invitation = db.prepare(`SELECT groups.id, groups.name, owners.name AS owner_name,
          COUNT(group_members.user_id) AS member_count
        FROM group_invites JOIN groups ON groups.id = group_invites.group_id
        JOIN users AS owners ON owners.id = groups.owner_id
        LEFT JOIN group_members ON group_members.group_id = groups.id
        WHERE group_invites.token_hash = ? GROUP BY groups.id`)
        .get(sessionHash(invitePreview[1]));
      if (!invitation) {
        json(response, 404, { error: "That circle invite link is invalid or has been replaced." });
        return;
      }
      json(response, 200, { id: invitation.id, name: invitation.name, ownerName: invitation.owner_name, memberCount: invitation.member_count });
      return;
    }

    const user = getAccount(request);
    if (url.pathname === "/api/me" && request.method === "GET") {
      json(response, 200, user);
      return;
    }
    if (!url.pathname.startsWith("/api/")) {
      await serveStatic(request, response, url.pathname);
      return;
    }
    if (!user) {
      json(response, 401, { error: "Your session has ended. Please log in again." });
      return;
    }

    if ((url.pathname === "/api/tasks" || url.pathname === "/api/goals") && request.method === "GET") {
      const tasks = db.prepare("SELECT * FROM goals WHERE user_id = ? ORDER BY done ASC, due_date IS NULL, due_date ASC, created_at DESC, id DESC")
        .all(user.id).map(taskWithGroups);
      json(response, 200, tasks);
      return;
    }
    if ((url.pathname === "/api/tasks" || url.pathname === "/api/goals") && request.method === "POST") {
      const body = await readBody(request);
      const title = String(body.title || "").trim();
      const categories = new Set(["Personal", "Learning", "Building", "Health", "Creative work", "Relationships"]);
      const targetMinutes = Number(body.targetMinutes);
      if (!title || title.length > 120) {
        json(response, 400, { error: "A task needs a title of 1 to 120 characters." });
        return;
      }
      if (!Number.isInteger(targetMinutes) || targetMinutes < 1 || targetMinutes > 180) {
        json(response, 400, { error: "Choose a focus timer between 1 and 180 minutes." });
        return;
      }
      const dueDate = body.dueDate === null
        ? null
        : body.dueDate || body.due || new Date().toISOString().slice(0, 10);
      if (dueDate !== null && !isValidDate(dueDate)) {
        json(response, 400, { error: "Choose a valid due date." });
        return;
      }
      const groupIds = body.groupIds ?? [];
      if (!validGroupIds(groupIds, user.id)) {
        json(response, 400, { error: "Choose circles you belong to before sharing a task." });
        return;
      }
      const priority = ["low", "normal", "high"].includes(body.priority) ? body.priority : "normal";
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = db.prepare(`INSERT INTO goals (user_id, title, note, category, due, due_date, priority, visibility, target_minutes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          user.id, title, String(body.description ?? body.note ?? "").trim().slice(0, 500),
          categories.has(body.category) ? body.category : "Personal",
          dueDate || "Long-term", dueDate, priority, groupIds.length ? "private" : body.visibility === "friends" ? "friends" : "private",
          targetMinutes
        );
        const taskId = Number(result.lastInsertRowid);
        const share = db.prepare("INSERT INTO group_goals (group_id, goal_id, shared_by) VALUES (?, ?, ?)");
        for (const groupId of groupIds) share.run(groupId, taskId, user.id);
        recordActivity(user.id, taskId, "created");
        db.exec("COMMIT");
        json(response, 201, taskWithGroups(db.prepare("SELECT * FROM goals WHERE id = ? AND user_id = ?").get(taskId, user.id)));
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return;
    }
    const taskUpdate = url.pathname.match(/^\/api\/(?:tasks|goals)\/(\d+)$/);
    if (taskUpdate && request.method === "PATCH") {
      const taskId = Number(taskUpdate[1]);
      const task = db.prepare("SELECT * FROM goals WHERE id = ? AND user_id = ?").get(taskId, user.id);
      if (!task) {
        json(response, 404, { error: "That task could not be found." });
        return;
      }
      const body = await readBody(request);
      const changes = [];
      const values = [];
      const addChange = (column, value) => {
        changes.push(`${column} = ?`);
        values.push(value);
      };
      if (Object.hasOwn(body, "title")) {
        const title = String(body.title || "").trim();
        if (!title || title.length > 120) {
          json(response, 400, { error: "A task title must be between 1 and 120 characters." });
          return;
        }
        addChange("title", title);
      }
      if (Object.hasOwn(body, "description") || Object.hasOwn(body, "note")) {
        addChange("note", String(body.description ?? body.note ?? "").trim().slice(0, 500));
      }
      if (Object.hasOwn(body, "category")) {
        const categories = new Set(["Personal", "Learning", "Building", "Health", "Creative work", "Relationships"]);
        if (!categories.has(body.category)) {
          json(response, 400, { error: "Choose a valid task category." });
          return;
        }
        addChange("category", body.category);
      }
      if (Object.hasOwn(body, "dueDate")) {
        if (body.dueDate !== null && !isValidDate(body.dueDate)) {
          json(response, 400, { error: "Choose a valid due date." });
          return;
        }
        addChange("due_date", body.dueDate);
        addChange("due", body.dueDate || "Long-term");
      }
      if (Object.hasOwn(body, "priority")) {
        if (!["low", "normal", "high"].includes(body.priority)) {
          json(response, 400, { error: "Choose low, normal, or high priority." });
          return;
        }
        addChange("priority", body.priority);
      }
      if (Object.hasOwn(body, "visibility")) {
        if (!["private", "friends"].includes(body.visibility)) {
          json(response, 400, { error: "Choose whether the task is private or shared with friends." });
          return;
        }
        addChange("visibility", body.visibility);
      }
      const hasGroupIds = Object.hasOwn(body, "groupIds");
      if (hasGroupIds && !validGroupIds(body.groupIds, user.id)) {
        json(response, 400, { error: "Choose circles you belong to before sharing a task." });
        return;
      }
      if (!changes.length && !hasGroupIds) {
        json(response, 400, { error: "There are no task changes to save." });
        return;
      }
      db.exec("BEGIN IMMEDIATE");
      try {
        if (changes.length) {
          values.push(taskId, user.id);
          db.prepare(`UPDATE goals SET ${changes.join(", ")} WHERE id = ? AND user_id = ?`).run(...values);
        }
        if (hasGroupIds) {
          db.prepare("DELETE FROM group_goals WHERE goal_id = ?").run(taskId);
          const share = db.prepare("INSERT INTO group_goals (group_id, goal_id, shared_by) VALUES (?, ?, ?)");
          for (const groupId of body.groupIds) share.run(groupId, taskId, user.id);
        }
        db.exec("COMMIT");
        json(response, 200, taskWithGroups(db.prepare("SELECT * FROM goals WHERE id = ? AND user_id = ?").get(taskId, user.id)));
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return;
    }
    const goalAction = url.pathname.match(/^\/api\/(?:tasks|goals)\/(\d+)\/(complete|start|stop)$/);
    if (goalAction && request.method === "POST") {
      const [, id, action] = goalAction;
      const goalId = Number(id);
      const goal = db.prepare("SELECT * FROM goals WHERE id = ? AND user_id = ?").get(goalId, user.id);
      if (!goal) {
        json(response, 404, { error: "That task could not be found." });
        return;
      }
      if (action === "start") {
        if (goal.done) {
          json(response, 400, { error: "Reopen this task before starting its focus timer." });
          return;
        }
        db.exec("BEGIN IMMEDIATE");
        try {
          const running = db.prepare("SELECT id, elapsed_seconds, timer_started_at FROM goals WHERE user_id = ? AND timer_started_at IS NOT NULL AND id <> ?").all(user.id, goalId);
          const pause = db.prepare("UPDATE goals SET elapsed_seconds = ?, timer_started_at = NULL WHERE id = ? AND user_id = ?");
          for (const timer of running) {
            const extra = Math.max(0, Math.floor((Date.now() - Date.parse(timer.timer_started_at)) / 1000));
            pause.run(timer.elapsed_seconds + extra, timer.id, user.id);
          }
          if (!goal.timer_started_at) db.prepare("UPDATE goals SET timer_started_at = ? WHERE id = ? AND user_id = ?").run(new Date().toISOString(), goalId, user.id);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      } else if (action === "stop") {
        if (goal.timer_started_at) {
          const extra = Math.max(0, Math.floor((Date.now() - Date.parse(goal.timer_started_at)) / 1000));
          db.prepare("UPDATE goals SET elapsed_seconds = elapsed_seconds + ?, timer_started_at = NULL WHERE id = ? AND user_id = ?")
            .run(extra, goalId, user.id);
        }
      } else {
        const body = await readBody(request);
        const done = Boolean(body.done);
        const elapsedExtra = goal.timer_started_at ? Math.max(0, Math.floor((Date.now() - Date.parse(goal.timer_started_at)) / 1000)) : 0;
        db.prepare("UPDATE goals SET done = ?, elapsed_seconds = elapsed_seconds + ?, timer_started_at = NULL WHERE id = ? AND user_id = ?")
          .run(done ? 1 : 0, elapsedExtra, goalId, user.id);
        if (done && !goal.done) recordActivity(user.id, goalId, "completed");
      }
      json(response, 200, taskWithGroups(db.prepare("SELECT * FROM goals WHERE id = ? AND user_id = ?").get(goalId, user.id)));
      return;
    }
    const goalDelete = url.pathname.match(/^\/api\/(?:tasks|goals)\/(\d+)$/);
    if (goalDelete && request.method === "DELETE") {
      const result = db.prepare("DELETE FROM goals WHERE id = ? AND user_id = ?").run(Number(goalDelete[1]), user.id);
      if (!result.changes) {
        json(response, 404, { error: "That task could not be found." });
        return;
      }
      json(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/profile" && request.method === "PATCH") {
      const body = await readBody(request);
      const name = String(body.name ?? user.name).trim();
      const bio = String(body.bio ?? "").trim();
      if (name.length < 2 || name.length > 60) {
        json(response, 400, { error: "Your name must be between 2 and 60 characters." });
        return;
      }
      if (bio.length > 240) {
        json(response, 400, { error: "Your bio must be 240 characters or fewer." });
        return;
      }
      db.prepare("UPDATE users SET name = ?, bio = ? WHERE id = ?").run(name, bio, user.id);
      json(response, 200, db.prepare("SELECT id, name, email, bio FROM users WHERE id = ?").get(user.id));
      return;
    }

    const friendProfile = url.pathname.match(/^\/api\/friends\/(\d+)\/profile$/);
    if (friendProfile && request.method === "GET") {
      const friendId = Number(friendProfile[1]);
      const isFriend = db.prepare("SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?").get(user.id, friendId);
      if (!isFriend) {
        json(response, 404, { error: "That profile isn't in your circle." });
        return;
      }
      const profile = db.prepare("SELECT id, name, bio FROM users WHERE id = ?").get(friendId);
      if (!profile) {
        json(response, 404, { error: "That profile could not be found." });
        return;
      }
      const tasks = db.prepare(`SELECT title, category, due_date, done, priority FROM goals
        WHERE user_id = ? AND visibility = 'friends' ORDER BY done ASC, due_date IS NULL, due_date ASC LIMIT 30`)
        .all(friendId).map(task => ({ title: task.title, category: task.category, dueDate: task.due_date, done: Boolean(task.done), priority: task.priority }));
      const friendCount = Number(db.prepare("SELECT COUNT(*) AS count FROM friendships WHERE user_id = ?").get(friendId).count);
      json(response, 200, { ...profile, tasks, friendCount });
      return;
    }

    if (url.pathname === "/api/activity" && request.method === "GET") {
      const activities = db.prepare(`SELECT task_activities.id, task_activities.user_id AS actor_id,
          users.name AS actor_name, goals.id AS task_id, goals.title AS task_title, task_activities.type,
          task_activities.created_at,
          (SELECT COUNT(*) FROM activity_reactions WHERE activity_id = task_activities.id) AS reaction_count,
          EXISTS(SELECT 1 FROM activity_reactions WHERE activity_id = task_activities.id AND user_id = ?) AS reacted
        FROM task_activities
        JOIN goals ON goals.id = task_activities.task_id AND goals.visibility = 'friends'
        JOIN users ON users.id = task_activities.user_id
        WHERE task_activities.user_id = ? OR task_activities.user_id IN (
          SELECT friend_id FROM friendships WHERE user_id = ?
        )
        ORDER BY task_activities.created_at DESC, task_activities.id DESC
        LIMIT 50`).all(user.id, user.id, user.id);
      json(response, 200, activities.map(item => ({
        id: item.id,
        actorId: item.actor_id,
        actorName: item.actor_name,
        taskId: item.task_id,
        taskTitle: item.task_title,
        type: item.type,
        createdAt: item.created_at,
        reactionCount: item.reaction_count,
        reacted: Boolean(item.reacted)
      })));
      return;
    }
    const activityReaction = url.pathname.match(/^\/api\/activity\/(\d+)\/react$/);
    if (activityReaction && request.method === "POST") {
      const activityId = Number(activityReaction[1]);
      const activity = db.prepare(`SELECT task_activities.id FROM task_activities
        JOIN goals ON goals.id = task_activities.task_id AND goals.visibility = 'friends'
        WHERE task_activities.id = ? AND (
          task_activities.user_id = ? OR task_activities.user_id IN (
            SELECT friend_id FROM friendships WHERE user_id = ?
          )
        )`).get(activityId, user.id, user.id);
      if (!activity) {
        json(response, 404, { error: "That activity could not be found." });
        return;
      }
      const existing = db.prepare("SELECT 1 FROM activity_reactions WHERE activity_id = ? AND user_id = ?").get(activityId, user.id);
      if (existing) {
        db.prepare("DELETE FROM activity_reactions WHERE activity_id = ? AND user_id = ?").run(activityId, user.id);
      } else {
        db.prepare("INSERT INTO activity_reactions (activity_id, user_id) VALUES (?, ?)").run(activityId, user.id);
      }
      json(response, 200, {
        reacted: !existing,
        reactionCount: Number(db.prepare("SELECT COUNT(*) AS count FROM activity_reactions WHERE activity_id = ?").get(activityId).count)
      });
      return;
    }

    if (url.pathname === "/api/friends" && request.method === "GET") {
      const friends = db.prepare(`SELECT users.id, users.name, users.email, users.bio FROM friendships
        JOIN users ON users.id = friendships.friend_id WHERE friendships.user_id = ? ORDER BY users.name COLLATE NOCASE`)
        .all(user.id);
      json(response, 200, friends);
      return;
    }
    if (url.pathname === "/api/friends/search" && request.method === "GET") {
      const query = String(url.searchParams.get("q") || "").trim().slice(0, 80);
      if (query.length < 2) {
        json(response, 200, []);
        return;
      }
      const friends = db.prepare("SELECT friend_id FROM friendships WHERE user_id = ?").all(user.id).map(item => item.friend_id);
      const found = db.prepare(`SELECT id, name, email, bio FROM users
        WHERE id <> ? AND (name LIKE ? COLLATE NOCASE OR email LIKE ? COLLATE NOCASE)
        ORDER BY name COLLATE NOCASE LIMIT 20`).all(user.id, `%${query}%`, `%${query}%`);
      json(response, 200, found.map(person => ({ ...person, isFriend: friends.includes(person.id) })));
      return;
    }
    if (url.pathname === "/api/friends" && request.method === "POST") {
      const body = await readBody(request);
      const email = String(body.email || "").trim().toLowerCase();
      const friend = db.prepare("SELECT id, name, email, bio FROM users WHERE email = ?").get(email);
      if (!friend) {
        json(response, 404, { error: "We couldn't find an account with that email. Ask them to sign up first." });
        return;
      }
      if (friend.id === user.id) {
        json(response, 400, { error: "You are already in your own circle." });
        return;
      }
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)").run(user.id, friend.id);
        db.prepare("INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)").run(friend.id, user.id);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      json(response, 201, friend);
      return;
    }

    if (url.pathname === "/api/groups" && request.method === "GET") {
      const rows = db.prepare(`SELECT groups.id, groups.name, groups.owner_id, owners.name AS owner_name,
          COUNT(group_members.user_id) AS member_count, GROUP_CONCAT(members.name, ', ') AS member_names
          , (SELECT COUNT(*) FROM group_goals WHERE group_id = groups.id) AS task_count
          , (SELECT COUNT(*) FROM group_goals JOIN goals ON goals.id = group_goals.goal_id
             WHERE group_goals.group_id = groups.id AND goals.done = 1) AS done_count
        FROM group_members AS user_membership
        JOIN groups ON groups.id = user_membership.group_id
        JOIN group_members ON group_members.group_id = groups.id
        JOIN users AS owners ON owners.id = groups.owner_id
        JOIN users AS members ON members.id = group_members.user_id
        WHERE user_membership.user_id = ? GROUP BY groups.id ORDER BY groups.name COLLATE NOCASE`)
        .all(user.id);
      const members = db.prepare(`SELECT users.id, users.name, COUNT(goals.id) AS task_count,
          COALESCE(SUM(CASE WHEN goals.done = 1 THEN 1 ELSE 0 END), 0) AS done_count
        FROM group_members
        JOIN users ON users.id = group_members.user_id
        LEFT JOIN group_goals ON group_goals.group_id = group_members.group_id AND group_goals.shared_by = users.id
        LEFT JOIN goals ON goals.id = group_goals.goal_id
        WHERE group_members.group_id = ?
        GROUP BY users.id ORDER BY done_count DESC, users.name COLLATE NOCASE`);
      json(response, 200, rows.map(group => ({
        id: group.id,
        name: group.name,
        ownerId: group.owner_id,
        ownerName: group.owner_name,
        memberCount: group.member_count,
        memberNames: group.member_names,
        members: members.all(group.id).map(member => ({
          id: member.id,
          name: member.name,
          taskCount: member.task_count,
          doneCount: member.done_count
        })),
        taskCount: group.task_count,
        doneCount: group.done_count
      })));
      return;
    }
    if (url.pathname === "/api/groups" && request.method === "POST") {
      const body = await readBody(request);
      const name = String(body.name || "").trim();
      if (name.length < 2 || name.length > 60) {
        json(response, 400, { error: "A circle name must be between 2 and 60 characters." });
        return;
      }
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = db.prepare("INSERT INTO groups (name, owner_id) VALUES (?, ?)").run(name, user.id);
        const groupId = Number(result.lastInsertRowid);
        db.prepare("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)").run(groupId, user.id);
        db.exec("COMMIT");
        json(response, 201, {
          id: groupId, name, ownerId: user.id, ownerName: user.name, memberCount: 1,
          memberNames: user.name,
          members: [{ id: user.id, name: user.name, taskCount: 0, doneCount: 0 }],
          taskCount: 0, doneCount: 0
        });
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return;
    }
    const groupMember = url.pathname.match(/^\/api\/groups\/(\d+)\/members$/);
    if (groupMember && request.method === "POST") {
      const groupId = Number(groupMember[1]);
      const group = db.prepare("SELECT id, owner_id FROM groups WHERE id = ?").get(groupId);
      if (!group || group.owner_id !== user.id) {
        json(response, 404, { error: "Only the circle owner can add members." });
        return;
      }
      const body = await readBody(request);
      const friendId = Number(body.userId);
      const friend = db.prepare(`SELECT users.id, users.name FROM users
        JOIN friendships ON friendships.friend_id = users.id
        WHERE friendships.user_id = ? AND users.id = ?`).get(user.id, friendId);
      if (!friend) {
        json(response, 400, { error: "Only people you have added as friends can join this circle." });
        return;
      }
      const result = db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)").run(groupId, friendId);
      if (!result.changes) {
        json(response, 409, { error: "That person is already in this circle." });
        return;
      }
      json(response, 201, friend);
      return;
    }
    const groupInvite = url.pathname.match(/^\/api\/groups\/(\d+)\/invite$/);
    if (groupInvite && request.method === "POST") {
      const groupId = Number(groupInvite[1]);
      const group = db.prepare("SELECT id, name FROM groups WHERE id = ? AND owner_id = ?").get(groupId, user.id);
      if (!group) {
        json(response, 404, { error: "Only the circle owner can create an invite link." });
        return;
      }
      const token = randomBytes(32).toString("base64url");
      db.prepare(`INSERT INTO group_invites (group_id, token_hash, created_by)
        VALUES (?, ?, ?) ON CONFLICT(group_id) DO UPDATE SET
          token_hash = excluded.token_hash, created_by = excluded.created_by, created_at = CURRENT_TIMESTAMP`)
        .run(groupId, sessionHash(token), user.id);
      json(response, 201, { token, circleName: group.name });
      return;
    }
    const inviteJoin = url.pathname.match(/^\/api\/invites\/([A-Za-z0-9_-]{32,})\/join$/);
    if (inviteJoin && request.method === "POST") {
      const invitation = db.prepare("SELECT groups.id, groups.name FROM group_invites JOIN groups ON groups.id = group_invites.group_id WHERE group_invites.token_hash = ?")
        .get(sessionHash(inviteJoin[1]));
      if (!invitation) {
        json(response, 404, { error: "That circle invite link is invalid or has been replaced." });
        return;
      }
      db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)").run(invitation.id, user.id);
      json(response, 200, { id: invitation.id, name: invitation.name });
      return;
    }
    const groupGoals = url.pathname.match(/^\/api\/groups\/(\d+)\/goals$/);
    if (groupGoals && request.method === "GET") {
      const groupId = Number(groupGoals[1]);
      const member = db.prepare("SELECT 1 AS member FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, user.id);
      if (!member) {
        json(response, 404, { error: "You aren't part of this circle." });
        return;
      }
      const shared = db.prepare(`SELECT goals.id, goals.user_id AS owner_id, users.name AS owner_name, goals.title,
          goals.category, goals.due_date, goals.done
        FROM group_goals
        JOIN goals ON goals.id = group_goals.goal_id
        JOIN users ON users.id = goals.user_id
        WHERE group_goals.group_id = ?
        ORDER BY goals.done ASC, goals.created_at DESC`).all(groupId);
      json(response, 200, shared.map(goal => ({
        id: goal.id,
        ownerId: goal.owner_id,
        ownerName: goal.owner_name,
        title: goal.title,
        category: goal.category,
        dueDate: goal.due_date,
        done: Boolean(goal.done)
      })));
      return;
    }
    const groupMessages = url.pathname.match(/^\/api\/groups\/(\d+)\/messages$/);
    if (groupMessages && request.method === "GET") {
      const groupId = Number(groupMessages[1]);
      const member = db.prepare("SELECT 1 AS member FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, user.id);
      if (!member) {
        json(response, 404, { error: "You aren't part of this circle." });
        return;
      }
      const after = Math.max(0, Number(url.searchParams.get("after")) || 0);
      json(response, 200, messagesFor(groupId, after));
      return;
    }
    if (groupMessages && request.method === "POST") {
      const groupId = Number(groupMessages[1]);
      const member = db.prepare("SELECT 1 AS member FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, user.id);
      if (!member) {
        json(response, 404, { error: "You aren't part of this circle." });
        return;
      }
      const body = await readBody(request);
      const content = String(body.content || "").trim();
      if (!content || content.length > 1000) {
        json(response, 400, { error: "Messages need to be between 1 and 1,000 characters." });
        return;
      }
      const result = db.prepare("INSERT INTO messages (group_id, sender_id, content, created_at) VALUES (?, ?, ?, ?)")
        .run(groupId, user.id, content, new Date().toISOString());
      json(response, 201, messagesFor(groupId, Number(result.lastInsertRowid) - 1)[0]);
      return;
    }

    json(response, 404, { error: "That page could not be found." });
  } catch (error) {
    console.error("Request failed:", error);
    if (!response.headersSent) json(response, error.status || 500, { error: error.status ? error.message : "Something went wrong on the server. Please try again." });
    else response.destroy();
  }
});

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
server.listen(port, host, () => {
  console.log(`Kinda server listening on http://${host}:${port}`);
});

function close() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
