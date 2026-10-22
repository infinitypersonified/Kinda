import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { components } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { internal } from "./_generated/api";

type WorkspaceCtx = GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>;

function isValidDate(value: string | null) {
  if (value === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const AVATAR_COLORS = ["terracotta", "sand", "rose", "olive", "sky", "plum", "teal", "gold"];
const AVATAR_EMOJIS = ["🦊", "🐼", "🐯", "🦁", "🐸", "🐙", "🦄", "🐉", "🐧", "🦉", "🐢", "🐨", "🐰", "🐻", "🦋", "🐬", "👻", "👽", "🤖", "🌙", "⭐", "🔥", "🌸", "🍄"];

function validAvatar(value: string) {
  const [color, emoji = ""] = value.split("|");
  return AVATAR_COLORS.includes(color) && (emoji === "" || AVATAR_EMOJIS.includes(emoji));
}

async function avatarOf(ctx: WorkspaceCtx, userId: string) {
  const profile = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", userId)).first();
  return profile?.avatar ?? "";
}

const REACTION_EMOJIS = ["❤️", "🔥", "👏", "🎉", "💪"];
const REPEATS = ["none", "daily", "weekdays", "weekly"];
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function nextDueDate(dueDate: string, repeat: string) {
  const date = new Date(`${dueDate}T00:00:00Z`);
  const step = () => date.setUTCDate(date.getUTCDate() + (repeat === "weekly" ? 7 : 1));
  step();
  if (repeat === "weekdays") while ([0, 6].includes(date.getUTCDay())) step();
  return date.toISOString().slice(0, 10);
}

function checkRepeatAndReminder(repeat: string | undefined, reminderTime: string | undefined) {
  if (repeat !== undefined && !REPEATS.includes(repeat)) throw new ConvexError("Choose a valid repeat option.");
  if (reminderTime !== undefined && reminderTime !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) {
    throw new ConvexError("Choose a valid reminder time.");
  }
}

function reminderTimestamp(dueDate: string | null, reminderTime: string | undefined, tzOffsetMinutes: number | undefined) {
  if (!dueDate || !reminderTime) return undefined;
  const [year, month, day] = dueDate.split("-").map(Number);
  const [hours, minutes] = reminderTime.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hours, minutes) + (tzOffsetMinutes ?? 0) * 60000;
}

async function scheduleReminder(ctx: MutationCtx, taskId: Id<"tasks">, reminderAt: number | undefined) {
  if (reminderAt === undefined || reminderAt < Date.now() - 60000) return;
  await ctx.scheduler.runAt(reminderAt, internal.reminders.fireReminder, { taskId, reminderAt });
}

function localDayKey(timestamp: number, tzOffsetMinutes: number) {
  return new Date(timestamp - tzOffsetMinutes * 60000).toISOString().slice(0, 10);
}

async function requireUser(ctx: Parameters<typeof authComponent.getAuthUser>[0]) {
  const user = await authComponent.getAuthUser(ctx);
  return { id: String(user._id), name: user.name, email: user.email };
}

async function requireCircleMember(ctx: WorkspaceCtx, circleId: Id<"circles">, userId: string) {
  const membership = await ctx.db.query("circleMembers")
    .withIndex("by_circle_user", q => q.eq("circleId", circleId).eq("userId", userId))
    .first();
  if (!membership) throw new ConvexError("You are not a member of that circle.");
  return membership;
}

type CircleRole = "owner" | "admin" | "member";

async function circleRoleOf(ctx: WorkspaceCtx, circle: Doc<"circles">, userId: string): Promise<CircleRole | null> {
  if (circle.ownerId === userId) return "owner";
  const membership = await ctx.db.query("circleMembers")
    .withIndex("by_circle_user", q => q.eq("circleId", circle._id).eq("userId", userId)).first();
  if (!membership) return null;
  return membership.role === "admin" ? "admin" : "member";
}

async function requireCircleManager(ctx: WorkspaceCtx, circleId: Id<"circles">, userId: string) {
  const circle = await ctx.db.get(circleId);
  if (!circle) throw new ConvexError("That circle could not be found.");
  const role = await circleRoleOf(ctx, circle, userId);
  if (role !== "owner" && role !== "admin") throw new ConvexError("Only the circle owner or an admin can do that.");
  return { circle, role };
}

// Removes everything a member contributed to a circle (used when they leave or are removed).
async function removeMemberData(ctx: MutationCtx, circleId: Id<"circles">, userId: string) {
  const membership = await ctx.db.query("circleMembers")
    .withIndex("by_circle_user", q => q.eq("circleId", circleId).eq("userId", userId)).first();
  if (membership) await ctx.db.delete(membership._id);
  for (const assignment of await ctx.db.query("assignments").withIndex("by_circle", q => q.eq("circleId", circleId)).collect()) {
    for (const task of await ctx.db.query("tasks").withIndex("by_assignment", q => q.eq("assignmentId", assignment._id)).collect()) {
      if (task.userId === userId) await removeTaskCompletely(ctx, task);
    }
  }
  for (const link of await ctx.db.query("circleTasks").withIndex("by_circle", q => q.eq("circleId", circleId)).collect()) {
    if (link.sharedBy === userId) await ctx.db.delete(link._id);
  }
  for (const row of await ctx.db.query("typing").withIndex("by_circle_user", q => q.eq("circleId", circleId).eq("userId", userId)).collect()) await ctx.db.delete(row._id);
}

const STREAK_PERCENT = 80;

async function removeTaskCompletely(ctx: MutationCtx, task: Doc<"tasks">) {
  for (const link of await ctx.db.query("circleTasks").withIndex("by_task", q => q.eq("taskId", task._id)).collect()) await ctx.db.delete(link._id);
  for (const nudge of await ctx.db.query("nudges").withIndex("by_task", q => q.eq("taskId", task._id)).collect()) await ctx.db.delete(nudge._id);
  for (const activity of await ctx.db.query("activities").withIndex("by_task", q => q.eq("taskId", task._id)).collect()) {
    for (const reaction of await ctx.db.query("reactions").withIndex("by_activity", q => q.eq("activityId", activity._id)).collect()) await ctx.db.delete(reaction._id);
    await ctx.db.delete(activity._id);
  }
  await ctx.db.delete(task._id);
}

async function deleteCircleAssignments(ctx: MutationCtx, circleId: Id<"circles">) {
  const rows = await ctx.db.query("assignments").withIndex("by_circle", q => q.eq("circleId", circleId)).collect();
  for (const row of rows) {
    for (const task of await ctx.db.query("tasks").withIndex("by_assignment", q => q.eq("assignmentId", row._id)).collect()) await removeTaskCompletely(ctx, task);
    await ctx.db.delete(row._id);
  }
}

async function mapTask(ctx: WorkspaceCtx, task: Doc<"tasks">) {
  const links = await ctx.db.query("circleTasks")
    .withIndex("by_task", q => q.eq("taskId", task._id)).collect();
  return {
    id: String(task._id),
    title: task.title,
    description: task.description,
    category: task.category,
    dueDate: task.dueDate,
    priority: task.priority,
    visibility: task.visibility,
    targetMinutes: task.targetMinutes,
    elapsedSeconds: task.elapsedSeconds,
    timerStartedAt: task.timerStartedAt,
    done: task.done,
    repeat: task.repeat ?? "none",
    reminderTime: task.reminderTime ?? "",
    createdAt: task.createdAt,
    assignmentId: task.assignmentId ? String(task.assignmentId) : null,
    assignedByName: task.assignedByName ?? null,
    sharedWith: task.sharedWith ?? [],
    movedFrom: task.movedFrom ?? [],
    groupIds: links.map(link => String(link.circleId))
  };
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const account = await requireUser(ctx);
    const profile = await ctx.db.query("profiles")
      .withIndex("by_user", q => q.eq("userId", account.id)).first();
    return { ...account, bio: profile?.bio ?? "", avatar: profile?.avatar ?? "" };
  }
});

export const updateProfile = mutation({
  args: { name: v.string(), bio: v.string(), avatar: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    const name = args.name.trim();
    const bio = args.bio.trim();
    if (name.length < 2 || name.length > 60) throw new ConvexError("Your name must be between 2 and 60 characters.");
    if (bio.length > 240) throw new ConvexError("Your bio must be 240 characters or fewer.");
    if (args.avatar !== undefined && !validAvatar(args.avatar)) throw new ConvexError("That avatar isn't available.");
    const user = await authComponent.getAnyUserById(ctx, account.id);
    if (!user) throw new ConvexError("Your account could not be found.");
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: { model: "user", where: [{ field: "_id", value: account.id }], update: { name } }
    });
    const existing = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", account.id)).first();
    const avatar = args.avatar ?? existing?.avatar ?? "";
    if (existing) await ctx.db.patch(existing._id, { bio, avatar });
    else await ctx.db.insert("profiles", { userId: account.id, bio, avatar });
    return { ...account, name, bio, avatar };
  }
});

export const listTasks = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const tasks = await ctx.db.query("tasks").withIndex("by_user_created", q => q.eq("userId", id))
      .order("desc").collect();
    return await Promise.all(tasks.map(task => mapTask(ctx, task)));
  }
});

export const createTask = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    category: v.string(),
    dueDate: v.union(v.string(), v.null()),
    priority: v.string(),
    visibility: v.string(),
    targetMinutes: v.number(),
    repeat: v.optional(v.string()),
    reminderTime: v.optional(v.string()),
    tzOffset: v.optional(v.number()),
    groupIds: v.array(v.id("circles")),
    sharedWith: v.optional(v.array(v.string()))
  },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    checkRepeatAndReminder(args.repeat, args.reminderTime);
    const title = args.title.trim();
    if (!title || title.length > 120) throw new ConvexError("Task titles must be 1–120 characters.");
    if (args.description.length > 2000) throw new ConvexError("Task descriptions must be 2,000 characters or fewer.");
    if (!["private", "friends"].includes(args.visibility)) throw new ConvexError("Choose a valid task visibility.");
    if (!["low", "normal", "high"].includes(args.priority)) throw new ConvexError("Choose a valid priority.");
    if (!isValidDate(args.dueDate)) throw new ConvexError("Choose a valid task due date.");
    if (!Number.isInteger(args.targetMinutes) || args.targetMinutes < 1 || args.targetMinutes > 1440) {
      throw new ConvexError("Focus time must be between 1 and 1,440 minutes.");
    }
    for (const circleId of args.groupIds) await requireCircleMember(ctx, circleId, account.id);
    const sharedWith = [...new Set(args.sharedWith ?? [])];
    for (const friendId of sharedWith) {
      if (friendId === account.id || !await ctx.db.query("friendships").withIndex("by_pair", q => q.eq("userId", account.id).eq("friendId", friendId)).first()) throw new ConvexError("Choose only people who are already your friends.");
    }
    const taskId = await ctx.db.insert("tasks", {
      userId: account.id,
      title,
      description: args.description.trim(),
      category: args.category,
      dueDate: args.dueDate,
      priority: args.priority,
      visibility: sharedWith.length ? "friends" : args.visibility,
      sharedWith,
      targetMinutes: args.targetMinutes,
      elapsedSeconds: 0,
      timerStartedAt: null,
      done: false,
      repeat: args.repeat ?? "none",
      reminderTime: args.reminderTime ?? "",
      tzOffset: args.tzOffset,
      reminderAt: reminderTimestamp(args.dueDate, args.reminderTime, args.tzOffset),
      createdAt: Date.now()
    });
    await scheduleReminder(ctx, taskId, reminderTimestamp(args.dueDate, args.reminderTime, args.tzOffset));
    for (const circleId of args.groupIds) {
      await ctx.db.insert("circleTasks", { circleId, taskId, sharedBy: account.id, createdAt: Date.now() });
    }
    if (args.visibility === "friends") {
      await ctx.db.insert("activities", { userId: account.id, taskId, type: "created", createdAt: Date.now() });
    }
    return await mapTask(ctx, (await ctx.db.get(taskId))!);
  }
});

export const updateTask = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.string(),
    description: v.string(),
    category: v.string(),
    dueDate: v.union(v.string(), v.null()),
    priority: v.string(),
    visibility: v.string(),
    targetMinutes: v.number(),
    repeat: v.optional(v.string()),
    reminderTime: v.optional(v.string()),
    tzOffset: v.optional(v.number()),
    groupIds: v.array(v.id("circles")),
    sharedWith: v.optional(v.array(v.string()))
  },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    checkRepeatAndReminder(args.repeat, args.reminderTime);
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== id) throw new ConvexError("That task could not be found.");
    if (task.assignmentId) {
      const unchanged = args.title === task.title && args.description === (task.description ?? "") && args.category === task.category && args.priority === task.priority && args.visibility === task.visibility && args.targetMinutes === task.targetMinutes && (args.repeat ?? "none") === (task.repeat ?? "none") && (args.reminderTime ?? "") === (task.reminderTime ?? "") && args.groupIds.length === (task.groupIds ?? []).length && args.groupIds.every((groupId, index) => String(groupId) === String(task.groupIds![index]));
      if (!unchanged) throw new ConvexError("This task was assigned by your circle owner, so its details can't be edited.");
      const movedFrom = task.movedFrom ?? [];
      if (!task.done && task.dueDate && args.dueDate !== task.dueDate && !movedFrom.includes(task.dueDate)) movedFrom.push(task.dueDate);
      await ctx.db.patch(task._id, { dueDate: args.dueDate, movedFrom, tzOffset: args.tzOffset, reminderAt: reminderTimestamp(args.dueDate, task.reminderTime ?? "", args.tzOffset) });
      return await mapTask(ctx, (await ctx.db.get(task._id))!);
    }
    const title = args.title.trim();
    if (!title || title.length > 120) throw new ConvexError("Task titles must be 1–120 characters.");
    if (args.description.length > 2000) throw new ConvexError("Task descriptions must be 2,000 characters or fewer.");
    if (!["private", "friends"].includes(args.visibility)) throw new ConvexError("Choose a valid task visibility.");
    if (!["low", "normal", "high"].includes(args.priority)) throw new ConvexError("Choose a valid priority.");
    if (!isValidDate(args.dueDate)) throw new ConvexError("Choose a valid task due date.");
    if (!Number.isInteger(args.targetMinutes) || args.targetMinutes < 1 || args.targetMinutes > 1440) {
      throw new ConvexError("Focus time must be between 1 and 1,440 minutes.");
    }
    for (const circleId of args.groupIds) await requireCircleMember(ctx, circleId, id);
    const sharedWith = [...new Set(args.sharedWith ?? [])];
    for (const friendId of sharedWith) {
      if (friendId === id || !await ctx.db.query("friendships").withIndex("by_pair", q => q.eq("userId", id).eq("friendId", friendId)).first()) throw new ConvexError("Choose only people who are already your friends.");
    }
    // Remember the day an unfinished task was moved away from, so past weekly reports stay honest.
    let movedFrom = task.movedFrom ?? [];
    if (!task.done && task.dueDate && args.dueDate !== task.dueDate && !movedFrom.includes(task.dueDate)) movedFrom = [...movedFrom, task.dueDate];
    await ctx.db.patch(task._id, {
      title, description: args.description.trim(), category: args.category, dueDate: args.dueDate, movedFrom,
      priority: args.priority, visibility: sharedWith.length ? "friends" : args.visibility, sharedWith, targetMinutes: args.targetMinutes,
      repeat: args.repeat ?? "none", reminderTime: args.reminderTime ?? "",
      tzOffset: args.tzOffset, reminderAt: reminderTimestamp(args.dueDate, args.reminderTime, args.tzOffset)
    });
    await scheduleReminder(ctx, task._id, reminderTimestamp(args.dueDate, args.reminderTime, args.tzOffset));
    const existingLinks = await ctx.db.query("circleTasks")
      .withIndex("by_task", q => q.eq("taskId", task._id)).collect();
    const keep = new Set(args.groupIds.map(String));
    for (const link of existingLinks) {
      if (!keep.has(String(link.circleId))) await ctx.db.delete(link._id);
    }
    const existingIds = new Set(existingLinks.map(link => String(link.circleId)));
    for (const circleId of args.groupIds) {
      if (!existingIds.has(String(circleId))) {
        await ctx.db.insert("circleTasks", { circleId, taskId: task._id, sharedBy: id, createdAt: Date.now() });
      }
    }
    return await mapTask(ctx, (await ctx.db.get(task._id))!);
  }
});

export const taskAction = mutation({
  args: {
    taskId: v.id("tasks"),
    action: v.union(v.literal("complete"), v.literal("start"), v.literal("stop")),
    done: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== id) throw new ConvexError("That task could not be found.");
    const now = Date.now();
    if (args.action === "start") {
      if (task.done) throw new ConvexError("Reopen this task before starting its timer.");
      const active = await ctx.db.query("tasks").withIndex("by_user", q => q.eq("userId", id)).collect();
      for (const running of active) {
        if (running.timerStartedAt && running._id !== task._id) {
          const elapsed = Math.max(0, Math.floor((now - Date.parse(running.timerStartedAt)) / 1000));
          await ctx.db.patch(running._id, { elapsedSeconds: running.elapsedSeconds + elapsed, timerStartedAt: null });
        }
      }
      if (!task.timerStartedAt) await ctx.db.patch(task._id, { timerStartedAt: new Date(now).toISOString() });
    } else if (args.action === "stop") {
      if (task.timerStartedAt) {
        const elapsed = Math.max(0, Math.floor((now - Date.parse(task.timerStartedAt)) / 1000));
        await ctx.db.patch(task._id, { elapsedSeconds: task.elapsedSeconds + elapsed, timerStartedAt: null });
      }
    } else {
      const done = Boolean(args.done);
      const elapsed = task.timerStartedAt ? Math.max(0, Math.floor((now - Date.parse(task.timerStartedAt)) / 1000)) : 0;
      await ctx.db.patch(task._id, { done, elapsedSeconds: task.elapsedSeconds + elapsed, timerStartedAt: null });
      if (done && !task.done) {
        await ctx.db.insert("activities", { userId: id, taskId: task._id, type: "completed", createdAt: now });
        if (task.repeat && task.repeat !== "none" && task.dueDate) {
          const nextId = await ctx.db.insert("tasks", {
            userId: id, title: task.title, description: task.description, category: task.category,
            dueDate: nextDueDate(task.dueDate, task.repeat), priority: task.priority, visibility: task.visibility, sharedWith: task.sharedWith,
            targetMinutes: task.targetMinutes, elapsedSeconds: 0, timerStartedAt: null, done: false,
            repeat: task.repeat, reminderTime: task.reminderTime ?? "", tzOffset: task.tzOffset,
            reminderAt: reminderTimestamp(nextDueDate(task.dueDate, task.repeat), task.reminderTime, task.tzOffset), createdAt: now
          });
          await scheduleReminder(ctx, nextId, reminderTimestamp(nextDueDate(task.dueDate, task.repeat), task.reminderTime, task.tzOffset));
          const links = await ctx.db.query("circleTasks").withIndex("by_task", q => q.eq("taskId", task._id)).collect();
          for (const link of links) {
            await ctx.db.insert("circleTasks", { circleId: link.circleId, taskId: nextId, sharedBy: id, createdAt: now });
          }
        }
      }
    }
    return await mapTask(ctx, (await ctx.db.get(task._id))!);
  }
});

export const deleteTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== id) throw new ConvexError("That task could not be found.");
    if (task.assignmentId) throw new ConvexError("This task was assigned by your circle owner, so it can't be deleted.");
    await removeTaskCompletely(ctx, task);
    return { ok: true };
  }
});

export const listCircles = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const memberships = await ctx.db.query("circleMembers").withIndex("by_user", q => q.eq("userId", id)).collect();
    return await Promise.all(memberships.map(async membership => {
      const circle = await ctx.db.get(membership.circleId);
      if (!circle) return null;
      const memberRecords = await ctx.db.query("circleMembers")
        .withIndex("by_circle", q => q.eq("circleId", circle._id)).collect();
      const links = await ctx.db.query("circleTasks")
        .withIndex("by_circle", q => q.eq("circleId", circle._id)).collect();
      const members = await Promise.all(memberRecords.map(async record => {
        const person = await authComponent.getAnyUserById(ctx, record.userId);
        const tasks = await Promise.all(links.filter(link => link.sharedBy === record.userId)
          .map(link => ctx.db.get(link.taskId)));
        const visibleTasks = tasks.filter(Boolean);
        return {
          id: record.userId,
          name: person?.name ?? "Member",
          avatar: await avatarOf(ctx, record.userId),
          role: record.userId === circle.ownerId ? "owner" : record.role === "admin" ? "admin" : "member",
          taskCount: visibleTasks.length,
          doneCount: visibleTasks.filter(task => task!.done).length
        };
      }));
      return {
        id: String(circle._id),
        name: circle.name,
        ownerId: circle.ownerId,
        myRole: members.find(member => member.id === id)?.role ?? "member",
        members,
        memberCount: members.length,
        memberNames: members.map(member => member.name).join(", "),
        taskCount: links.length,
        doneCount: (await Promise.all(links.map(link => ctx.db.get(link.taskId)))).filter(task => task?.done).length
      };
    })).then(circles => circles.filter(Boolean));
  }
});

export const createCircle = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    const name = args.name.trim();
    if (name.length < 2 || name.length > 48) throw new ConvexError("Circle names must be between 2 and 48 characters.");
    const circleId = await ctx.db.insert("circles", { name, ownerId: account.id, createdAt: Date.now() });
    await ctx.db.insert("circleMembers", { circleId, userId: account.id, joinedAt: Date.now() });
    return {
      id: String(circleId), name, ownerId: account.id,
      members: [{ id: account.id, name: account.name, taskCount: 0, doneCount: 0 }],
      memberCount: 1, memberNames: account.name, taskCount: 0, doneCount: 0
    };
  }
});

export const circleTasks = query({
  args: { circleId: v.id("circles") },
  handler: async (ctx, args) => {
    await requireCircleMember(ctx, args.circleId, (await requireUser(ctx)).id);
    const links = await ctx.db.query("circleTasks").withIndex("by_circle", q => q.eq("circleId", args.circleId)).collect();
    return await Promise.all(links.map(async link => {
      const task = await ctx.db.get(link.taskId);
      if (!task) return null;
      const owner = await authComponent.getAnyUserById(ctx, task.userId);
      return { id: String(task._id), ownerId: task.userId, ownerName: owner?.name ?? "Member", title: task.title, category: task.category, dueDate: task.dueDate, createdAt: task.createdAt, done: task.done };
    })).then(tasks => tasks.filter(Boolean));
  }
});

export const addCircleMember = mutation({
  args: { circleId: v.id("circles"), userId: v.string() },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    const circle = await ctx.db.get(args.circleId);
    if (!circle) throw new ConvexError("That circle could not be found.");
    await requireCircleManager(ctx, args.circleId, account.id);
    const friend = await authComponent.getAnyUserById(ctx, args.userId);
    if (!friend) throw new ConvexError("That account could not be found.");
    const friendship = await ctx.db.query("friendships").withIndex("by_pair", q => q.eq("userId", account.id).eq("friendId", args.userId)).first();
    if (!friendship) throw new ConvexError("Add this person as a friend before inviting them to a circle.");
    const existing = await ctx.db.query("circleMembers").withIndex("by_circle_user", q => q.eq("circleId", args.circleId).eq("userId", args.userId)).first();
    if (!existing) await ctx.db.insert("circleMembers", { circleId: args.circleId, userId: args.userId, joinedAt: Date.now() });
    return { ok: true };
  }
});

export const createInvite = mutation({
  args: { circleId: v.id("circles") },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    const circle = await ctx.db.get(args.circleId);
    if (!circle) throw new ConvexError("That circle could not be found.");
    await requireCircleMember(ctx, args.circleId, account.id);
    const existing = await ctx.db.query("invites").withIndex("by_circle", q => q.eq("circleId", args.circleId)).first();
    const now = Date.now();
    const stillValid = existing && (existing.expiresAt === undefined || existing.expiresAt > now);
    const token = stillValid ? existing.token : crypto.randomUUID().replaceAll("-", "");
    const expiresAt = now + INVITE_LIFETIME_MS;
    if (existing) await ctx.db.patch(existing._id, { token, createdBy: account.id, createdAt: now, expiresAt });
    else await ctx.db.insert("invites", { circleId: args.circleId, token, createdBy: account.id, createdAt: now, expiresAt });
    return { token, expiresAt };
  }
});

export const revokeInvite = mutation({
  args: { circleId: v.id("circles") },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    await requireCircleManager(ctx, args.circleId, account.id);
    const invites = await ctx.db.query("invites").withIndex("by_circle", q => q.eq("circleId", args.circleId)).collect();
    for (const invite of invites) await ctx.db.delete(invite._id);
    return { ok: true };
  }
});

export const invitePreview = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.query("invites").withIndex("by_token", q => q.eq("token", args.token)).first();
    const circle = invitation && (invitation.expiresAt === undefined || invitation.expiresAt > Date.now())
      ? await ctx.db.get(invitation.circleId) : null;
    if (!circle) throw new ConvexError("This invite link is invalid or has expired.");
    const owner = await authComponent.getAnyUserById(ctx, circle.ownerId);
    const members = await ctx.db.query("circleMembers").withIndex("by_circle", q => q.eq("circleId", circle._id)).collect();
    return { id: String(circle._id), name: circle.name, ownerName: owner?.name ?? "A Kinda member", memberCount: members.length };
  }
});

export const joinInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    const invitation = await ctx.db.query("invites").withIndex("by_token", q => q.eq("token", args.token)).first();
    if (!invitation || (invitation.expiresAt !== undefined && invitation.expiresAt <= Date.now())) {
      throw new ConvexError("This invite link is invalid or has expired.");
    }
    const circle = await ctx.db.get(invitation.circleId);
    if (!circle) throw new ConvexError("This invite link is invalid or has expired.");
    const existing = await ctx.db.query("circleMembers").withIndex("by_circle_user", q => q.eq("circleId", circle._id).eq("userId", account.id)).first();
    if (!existing) await ctx.db.insert("circleMembers", { circleId: circle._id, userId: account.id, joinedAt: Date.now() });
    return { name: circle.name };
  }
});

async function mapMessage(ctx: WorkspaceCtx, message: Doc<"messages">) {
  const sender = await authComponent.getAnyUserById(ctx, message.senderId);
  let replyTo = null;
  if (message.replyTo) {
    const original = await ctx.db.get(message.replyTo);
    if (original) {
      const originalSender = await authComponent.getAnyUserById(ctx, original.senderId);
      replyTo = { id: String(original._id), senderName: originalSender?.name ?? "Member", content: original.content.slice(0, 120) };
    }
  }
  return {
    id: String(message._id), senderId: message.senderId, senderName: sender?.name ?? "Member",
    senderAvatar: await avatarOf(ctx, message.senderId), content: message.content, replyTo,
    mentions: message.mentions ?? [], edited: Boolean(message.editedAt), createdAt: new Date(message.createdAt).toISOString()
  };
}

export const listMessages = query({
  args: { circleId: v.id("circles"), after: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireCircleMember(ctx, args.circleId, (await requireUser(ctx)).id);
    const records = await ctx.db.query("messages").withIndex("by_circle", q => q.eq("circleId", args.circleId))
      .order("desc").take(100);
    const ordered = records.reverse();
    const afterIndex = args.after ? ordered.findIndex(message => String(message._id) === args.after) : -1;
    const visible = args.after && afterIndex >= 0 ? ordered.slice(afterIndex + 1) : args.after ? ordered.slice(-1) : ordered;
    return await Promise.all(visible.map(message => mapMessage(ctx, message)));
  }
});

export const sendMessage = mutation({
  args: { circleId: v.id("circles"), content: v.string(), replyTo: v.optional(v.id("messages")), mentions: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    await requireCircleMember(ctx, args.circleId, account.id);
    const content = args.content.trim();
    if (!content || content.length > 2000) throw new ConvexError("Messages must be between 1 and 2,000 characters.");
    const createdAt = Date.now();
    const recent = await ctx.db.query("messages")
      .withIndex("by_sender_created", q => q.eq("senderId", account.id).gt("createdAt", createdAt - 10000)).collect();
    if (recent.length >= 8) throw new ConvexError("You're sending messages too quickly. Give it a few seconds.");
    if (args.replyTo) {
      const original = await ctx.db.get(args.replyTo);
      if (!original || original.circleId !== args.circleId) throw new ConvexError("That message could not be found.");
    }
    const mentioned: string[] = [];
    for (const mentionId of [...new Set(args.mentions ?? [])].filter(item => item !== account.id).slice(0, 10)) {
      const member = await ctx.db.query("circleMembers").withIndex("by_circle_user", q => q.eq("circleId", args.circleId).eq("userId", mentionId)).first();
      if (member) mentioned.push(mentionId);
    }
    const id = await ctx.db.insert("messages", {
      circleId: args.circleId, senderId: account.id, content, createdAt,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
      ...(mentioned.length ? { mentions: mentioned } : {})
    });
    const circleDoc = await ctx.db.get(args.circleId);
    await ctx.scheduler.runAfter(0, internal.push.notifyCircleMessage, {
      circleId: args.circleId, excludeUserIds: [account.id, ...mentioned], senderName: account.name, preview: content.slice(0, 120)
    });
    for (const mentionId of mentioned) {
      await ctx.scheduler.runAfter(0, internal.push.notifyUser, {
        userId: mentionId, title: `${account.name} mentioned you in ${circleDoc?.name ?? "a circle"}`,
        body: content.slice(0, 120), tag: `mention-${args.circleId}`
      });
    }
    const typingRow = await ctx.db.query("typing").withIndex("by_circle_user", q => q.eq("circleId", args.circleId).eq("userId", account.id)).first();
    if (typingRow) await ctx.db.delete(typingRow._id);
    return await mapMessage(ctx, (await ctx.db.get(id))!);
  }
});

export const editMessage = mutation({
  args: { messageId: v.id("messages"), content: v.string() },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    const message = await ctx.db.get(args.messageId);
    if (!message || message.senderId !== id) throw new ConvexError("You can only edit your own messages.");
    const content = args.content.trim();
    if (!content || content.length > 2000) throw new ConvexError("Messages must be between 1 and 2,000 characters.");
    await ctx.db.patch(message._id, { content, editedAt: Date.now() });
    return await mapMessage(ctx, (await ctx.db.get(message._id))!);
  }
});

export const deleteMessage = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    const message = await ctx.db.get(args.messageId);
    if (!message || message.senderId !== id) throw new ConvexError("You can only delete your own messages.");
    await ctx.db.delete(message._id);
    return { ok: true };
  }
});

export const setTyping = mutation({
  args: { circleId: v.id("circles") },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    await requireCircleMember(ctx, args.circleId, id);
    const existing = await ctx.db.query("typing").withIndex("by_circle_user", q => q.eq("circleId", args.circleId).eq("userId", id)).first();
    if (existing) await ctx.db.patch(existing._id, { updatedAt: Date.now() });
    else await ctx.db.insert("typing", { circleId: args.circleId, userId: id, updatedAt: Date.now() });
    return { ok: true };
  }
});

export const listTyping = query({
  args: { circleId: v.id("circles") },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    await requireCircleMember(ctx, args.circleId, id);
    const rows = await ctx.db.query("typing").withIndex("by_circle", q => q.eq("circleId", args.circleId)).collect();
    return await Promise.all(rows.filter(row => row.userId !== id).map(async row => {
      const person = await authComponent.getAnyUserById(ctx, row.userId);
      return { userId: row.userId, name: person?.name ?? "Someone", updatedAt: row.updatedAt };
    }));
  }
});

export const listFriends = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const records = await ctx.db.query("friendships").withIndex("by_user", q => q.eq("userId", id)).collect();
    return await Promise.all(records.map(async record => {
      const friend = await authComponent.getAnyUserById(ctx, record.friendId);
      const profile = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", record.friendId)).first();
      return friend ? { id: record.friendId, name: friend.name, email: friend.email, bio: profile?.bio ?? "", avatar: profile?.avatar ?? "" } : null;
    })).then(friends => friends.filter(Boolean));
  }
});

export const searchFriends = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    const search = args.query.trim().slice(0, 80).toLowerCase();
    if (search.length < 2) return [];
    const { page: users } = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user", where: [{ field: "email", value: search }], limit: 20,
      paginationOpts: { numItems: 20, cursor: null }
    }) as { page: Array<{ _id: string; name: string; email: string }> };
    const friendships = await ctx.db.query("friendships").withIndex("by_user", q => q.eq("userId", id)).collect();
    const friendIds = new Set(friendships.map(item => item.friendId));
    const matches = users.filter(person => String(person._id) !== id);
    return await Promise.all(matches.map(async person => ({
      id: String(person._id), name: person.name, bio: "",
      avatar: await avatarOf(ctx, String(person._id)),
      isFriend: friendIds.has(String(person._id))
    })));
  }
});

export const addFriend = mutation({
  args: { email: v.optional(v.string()), friendId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    let friend: { _id: unknown; name: string; email: string } | null | undefined;
    if (args.friendId) {
      friend = await authComponent.getAnyUserById(ctx, args.friendId);
      if (!friend || String(friend._id) === account.id) throw new ConvexError("That person could not be found.");
    } else {
      const email = (args.email ?? "").trim().toLowerCase();
      if (!email || email.length > 254) throw new ConvexError("Enter a valid email address.");
      const { page: people } = await ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: "user", where: [{ field: "email", value: email }], limit: 2,
        paginationOpts: { numItems: 2, cursor: null }
      }) as { page: Array<{ _id: string; name: string; email: string }> };
      friend = people.find(person => String(person._id) !== account.id);
      if (!friend) throw new ConvexError("No Kinda member has that email yet.");
    }
    const pair = await ctx.db.query("friendships").withIndex("by_pair", q => q.eq("userId", account.id).eq("friendId", String(friend._id))).first();
    if (!pair) {
      await ctx.db.insert("friendships", { userId: account.id, friendId: String(friend._id), createdAt: Date.now() });
      await ctx.db.insert("friendships", { userId: String(friend._id), friendId: account.id, createdAt: Date.now() });
    }
    return { id: String(friend._id), name: friend.name };
  }
});

export const friendProfile = query({
  args: { friendId: v.string() },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    const friend = await ctx.db.query("friendships").withIndex("by_pair", q => q.eq("userId", id).eq("friendId", args.friendId)).first();
    if (!friend) throw new ConvexError("That profile isn't in your circle.");
    const person = await authComponent.getAnyUserById(ctx, args.friendId);
    if (!person) throw new ConvexError("That profile could not be found.");
    const profile = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", args.friendId)).first();
    const tasks = await ctx.db.query("tasks").withIndex("by_user", q => q.eq("userId", args.friendId)).collect();
    const visibleTasks = tasks.filter(task => task.visibility === "friends" && (!task.sharedWith?.length || task.sharedWith.includes(id))).slice(0, 30).map(task => ({
      title: task.title, category: task.category, dueDate: task.dueDate, done: task.done, priority: task.priority
    }));
    const friendCount = (await ctx.db.query("friendships").withIndex("by_user", q => q.eq("userId", args.friendId)).collect()).length;
    return { id: args.friendId, name: person.name, bio: profile?.bio ?? "", avatar: profile?.avatar ?? "", tasks: visibleTasks, friendCount };
  }
});

export const listActivity = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const friendRecords = await ctx.db.query("friendships").withIndex("by_user", q => q.eq("userId", id)).collect();
    const allowedUsers = new Set([id, ...friendRecords.map(item => item.friendId)]);
    const records = (await ctx.db.query("activities").withIndex("by_created").order("desc").take(100))
      .filter(item => allowedUsers.has(item.userId));
    const result = [];
    for (const item of records) {
      const task = await ctx.db.get(item.taskId);
      if (!task || task.visibility !== "friends" || (item.userId !== id && task.sharedWith?.length && !task.sharedWith.includes(id))) continue;
      const actor = await authComponent.getAnyUserById(ctx, item.userId);
      const reactions = await ctx.db.query("reactions").withIndex("by_activity", q => q.eq("activityId", item._id)).collect();
      result.push({
        id: String(item._id), actorId: item.userId, actorName: actor?.name ?? "Member", actorAvatar: await avatarOf(ctx, item.userId),
        taskId: String(task._id), taskTitle: task.title, type: item.type,
        createdAt: new Date(item.createdAt).toISOString(), reactionCount: reactions.length,
        reacted: reactions.some(reaction => reaction.userId === id),
        reactions: REACTION_EMOJIS.map(emoji => {
          const matching = reactions.filter(reaction => (reaction.emoji ?? "❤️") === emoji);
          return { emoji, count: matching.length, mine: matching.some(reaction => reaction.userId === id) };
        }).filter(entry => entry.count > 0)
      });
      if (result.length >= 50) break;
    }
    return result;
  }
});

export const toggleReaction = mutation({
  args: { activityId: v.id("activities"), emoji: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    const emoji = args.emoji ?? "❤️";
    if (!REACTION_EMOJIS.includes(emoji)) throw new ConvexError("That reaction isn't available.");
    const activity = await ctx.db.get(args.activityId);
    if (!activity) throw new ConvexError("That activity could not be found.");
    const friendships = await ctx.db.query("friendships").withIndex("by_pair", q => q.eq("userId", id).eq("friendId", activity.userId)).first();
    if (activity.userId !== id && !friendships) throw new ConvexError("That activity could not be found.");
    const task = await ctx.db.get(activity.taskId);
    if (!task || task.visibility !== "friends" || (activity.userId !== id && task.sharedWith?.length && !task.sharedWith.includes(id))) throw new ConvexError("That activity could not be found.");
    const mine = await ctx.db.query("reactions").withIndex("by_activity_user", q => q.eq("activityId", activity._id).eq("userId", id)).collect();
    const existing = mine.find(reaction => (reaction.emoji ?? "❤️") === emoji);
    if (existing) await ctx.db.delete(existing._id);
    else await ctx.db.insert("reactions", { activityId: activity._id, userId: id, emoji, createdAt: Date.now() });
    const all = await ctx.db.query("reactions").withIndex("by_activity", q => q.eq("activityId", activity._id)).collect();
    return {
      reacted: all.some(reaction => reaction.userId === id), reactionCount: all.length,
      reactions: REACTION_EMOJIS.map(option => {
        const matching = all.filter(reaction => (reaction.emoji ?? "❤️") === option);
        return { emoji: option, count: matching.length, mine: matching.some(reaction => reaction.userId === id) };
      }).filter(entry => entry.count > 0)
    };
  }
});

export const myStreak = query({
  args: { tzOffset: v.number() },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const tasks = await ctx.db.query("tasks")
      .withIndex("by_user_created", q => q.eq("userId", id).gte("createdAt", now - 400 * dayMs)).collect();
    const perDay = new Map<string, { total: number; done: number }>();
    for (const task of tasks) {
      const key = task.dueDate ?? localDayKey(task.createdAt, args.tzOffset);
      const entry = perDay.get(key) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (task.done) entry.done += 1;
      perDay.set(key, entry);
      for (const movedDay of task.movedFrom ?? []) {
        if (movedDay === key) continue;
        const movedEntry = perDay.get(movedDay) ?? { total: 0, done: 0 };
        movedEntry.total += 1;
        perDay.set(movedDay, movedEntry);
      }
    }
    // A day counts when at least one task was planned and 80% or more of that day's tasks are done.
    const qualifies = (key: string) => {
      const entry = perDay.get(key);
      return Boolean(entry && entry.total > 0 && entry.done * 100 >= entry.total * STREAK_PERCENT);
    };
    const keyAt = (offsetDays: number) => localDayKey(now - offsetDays * dayMs, args.tzOffset);
    const todayKey = keyAt(0);
    const today = perDay.get(todayKey) ?? { total: 0, done: 0 };
    const qualifiedToday = qualifies(todayKey);
    let current = 0;
    for (let offset = qualifiedToday ? 0 : 1; qualifies(keyAt(offset)); offset++) current++;
    const sorted = [...perDay.keys()].filter(qualifies).sort();
    let best = 0;
    let run = 0;
    let previous = "";
    for (const day of sorted) {
      run = previous && Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)) / dayMs) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      previous = day;
    }
    const needed = today.total ? Math.max(0, Math.ceil((STREAK_PERCENT * today.total) / 100) - today.done) : 0;
    return { current, best, doneToday: qualifiedToday, todayTotal: today.total, todayDone: today.done, needed, percent: STREAK_PERCENT };
  }
});

export const getCalendarFeed = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const feed = await ctx.db.query("calendarFeeds").withIndex("by_user", q => q.eq("userId", id)).first();
    return feed ? { token: feed.token, createdAt: feed.createdAt } : null;
  }
});

export const getGoogleCalendarStatus = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const credentials = await ctx.db.query("googleCalendarCredentials").withIndex("by_user", q => q.eq("userId", id)).first();
    const sync = await ctx.db.query("googleCalendarSyncStates").withIndex("by_user", q => q.eq("userId", id)).first();
    return { connected: Boolean(credentials), syncing: sync?.syncing ?? false, lastSyncAt: sync?.lastSyncAt ?? null, lastError: sync?.lastError ?? null };
  }
});

export const beginGoogleCalendarLink = mutation({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || !siteUrl) throw new ConvexError("Google Calendar is not configured yet.");
    const state = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const pending = await ctx.db.query("googleCalendarOAuthStates").withIndex("by_user", q => q.eq("userId", id)).collect();
    for (const row of pending) await ctx.db.delete(row._id);
    await ctx.db.insert("googleCalendarOAuthStates", { userId: id, state, expiresAt: Date.now() + 10 * 60 * 1000 });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: `${siteUrl.replace(/\/$/, "")}/google-calendar/callback`, response_type: "code", access_type: "offline", prompt: "consent", scope: "https://www.googleapis.com/auth/calendar.events", state }).toString();
    return { url: url.toString() };
  }
});

export const consumeGoogleCalendarState = internalMutation({
  args: { state: v.string(), accessToken: v.string(), refreshToken: v.string(), expiresIn: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("googleCalendarOAuthStates").withIndex("by_state", q => q.eq("state", args.state)).first();
    if (!row || row.expiresAt <= Date.now()) { if (row) await ctx.db.delete(row._id); return false; }
    for (const existing of await ctx.db.query("googleCalendarCredentials").withIndex("by_user", q => q.eq("userId", row.userId)).collect()) await ctx.db.delete(existing._id);
    await ctx.db.insert("googleCalendarCredentials", { userId: row.userId, accessToken: args.accessToken, refreshToken: args.refreshToken, accessTokenExpiresAt: Date.now() + args.expiresIn * 1000, updatedAt: Date.now() });
    await ctx.db.delete(row._id);
    return true;
  }
});

export const googleCalendarSyncData = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => ({
    credentials: await ctx.db.query("googleCalendarCredentials").withIndex("by_user", q => q.eq("userId", args.userId)).first(),
    tasks: await ctx.db.query("tasks").withIndex("by_user", q => q.eq("userId", args.userId)).collect(),
    links: await ctx.db.query("googleCalendarTaskLinks").withIndex("by_user", q => q.eq("userId", args.userId)).collect()
  })
});

export const saveGoogleCalendarSync = internalMutation({
  args: { userId: v.string(), links: v.array(v.object({ taskId: v.id("tasks"), eventId: v.string(), title: v.string(), description: v.string(), dueDate: v.string() })), accessToken: v.optional(v.string()), expiresIn: v.optional(v.number()), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    for (const old of await ctx.db.query("googleCalendarTaskLinks").withIndex("by_user", q => q.eq("userId", args.userId)).collect()) await ctx.db.delete(old._id);
    for (const link of args.links) await ctx.db.insert("googleCalendarTaskLinks", { userId: args.userId, taskId: link.taskId, eventId: link.eventId, lastTitle: link.title, lastDescription: link.description, lastDueDate: link.dueDate, updatedAt: Date.now() });
    const credential = await ctx.db.query("googleCalendarCredentials").withIndex("by_user", q => q.eq("userId", args.userId)).first();
    if (credential && args.accessToken && args.expiresIn) await ctx.db.patch(credential._id, { accessToken: args.accessToken, accessTokenExpiresAt: Date.now() + args.expiresIn * 1000, updatedAt: Date.now() });
    const state = await ctx.db.query("googleCalendarSyncStates").withIndex("by_user", q => q.eq("userId", args.userId)).first();
    const values = { syncing: false, lastSyncAt: args.error ? state?.lastSyncAt : Date.now(), lastError: args.error };
    if (state) await ctx.db.patch(state._id, values); else await ctx.db.insert("googleCalendarSyncStates", { userId: args.userId, ...values });
  }
});

export const applyGoogleCalendarTask = internalMutation({
  args: { taskId: v.id("tasks"), title: v.string(), description: v.string(), dueDate: v.string() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (task) await ctx.db.patch(args.taskId, { title: args.title, description: args.description, dueDate: args.dueDate });
  }
});

export const startGoogleCalendarSync = mutation({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    if (!await ctx.db.query("googleCalendarCredentials").withIndex("by_user", q => q.eq("userId", id)).first()) throw new ConvexError("Connect Google Calendar first.");
    const state = await ctx.db.query("googleCalendarSyncStates").withIndex("by_user", q => q.eq("userId", id)).first();
    if (state?.syncing) return { ok: true };
    if (state) await ctx.db.patch(state._id, { syncing: true, lastError: undefined });
    else await ctx.db.insert("googleCalendarSyncStates", { userId: id, syncing: true });
    await ctx.scheduler.runAfter(0, internal.googleCalendar.sync, { userId: id });
    return { ok: true };
  }
});

export const disconnectGoogleCalendar = mutation({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    for (const row of await ctx.db.query("googleCalendarCredentials").withIndex("by_user", q => q.eq("userId", id)).collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("googleCalendarTaskLinks").withIndex("by_user", q => q.eq("userId", id)).collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("googleCalendarSyncStates").withIndex("by_user", q => q.eq("userId", id)).collect()) await ctx.db.delete(row._id);
    return { ok: true };
  }
});

export const createCalendarFeed = mutation({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const existing = await ctx.db.query("calendarFeeds").withIndex("by_user", q => q.eq("userId", id)).collect();
    for (const feed of existing) await ctx.db.delete(feed._id);
    const token = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    await ctx.db.insert("calendarFeeds", { userId: id, token, createdAt: Date.now() });
    return { token };
  }
});

export const revokeCalendarFeed = mutation({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const feeds = await ctx.db.query("calendarFeeds").withIndex("by_user", q => q.eq("userId", id)).collect();
    for (const feed of feeds) await ctx.db.delete(feed._id);
    return { ok: true };
  }
});

export const calendarFeedData = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const feed = await ctx.db.query("calendarFeeds").withIndex("by_token", q => q.eq("token", args.token)).first();
    if (!feed) return null;
    const tasks = await ctx.db.query("tasks").withIndex("by_user", q => q.eq("userId", feed.userId)).collect();
    return tasks.filter(task => task.dueDate).map(task => ({
      id: String(task._id), title: task.title, description: task.description,
      dueDate: task.dueDate as string, done: task.done, createdAt: task.createdAt
    }));
  }
});

export const getTelegramStatus = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    return Boolean(await ctx.db.query("telegramLinks").withIndex("by_user", q => q.eq("userId", id)).first());
  }
});

export const createTelegramLink = mutation({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
    if (!botUsername || !/^[A-Za-z0-9_]{5,32}$/.test(botUsername)) {
      throw new ConvexError("Telegram reminders are not configured yet.");
    }
    const pending = await ctx.db.query("telegramLinkTokens").withIndex("by_user", q => q.eq("userId", id)).collect();
    for (const row of pending) await ctx.db.delete(row._id);
    const token = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    await ctx.db.insert("telegramLinkTokens", { userId: id, token, expiresAt: Date.now() + 10 * 60 * 1000 });
    return { url: `https://t.me/${botUsername}?start=${token}` };
  }
});

export const unlinkTelegram = mutation({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const links = await ctx.db.query("telegramLinks").withIndex("by_user", q => q.eq("userId", id)).collect();
    for (const link of links) await ctx.db.delete(link._id);
    const pending = await ctx.db.query("telegramLinkTokens").withIndex("by_user", q => q.eq("userId", id)).collect();
    for (const row of pending) await ctx.db.delete(row._id);
    return { ok: true };
  }
});

export const completeTelegramLink = internalMutation({
  args: { token: v.string(), chatId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("telegramLinkTokens").withIndex("by_token", q => q.eq("token", args.token)).first();
    if (!row || row.expiresAt <= Date.now()) {
      if (row) await ctx.db.delete(row._id);
      return false;
    }
    const existing = await ctx.db.query("telegramLinks").withIndex("by_user", q => q.eq("userId", row.userId)).collect();
    for (const link of existing) await ctx.db.delete(link._id);
    await ctx.db.insert("telegramLinks", { userId: row.userId, chatId: args.chatId, createdAt: Date.now() });
    await ctx.db.delete(row._id);
    return true;
  }
});

export const telegramChatId = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => (await ctx.db.query("telegramLinks").withIndex("by_user", q => q.eq("userId", args.userId)).first())?.chatId ?? null
});

export const circleRecap = query({
  args: { circleId: v.id("circles") },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    await requireCircleMember(ctx, args.circleId, id);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const links = await ctx.db.query("circleTasks").withIndex("by_circle", q => q.eq("circleId", args.circleId)).collect();
    const circleTaskIds = new Set(links.map(link => String(link.taskId)));
    const memberRecords = await ctx.db.query("circleMembers").withIndex("by_circle", q => q.eq("circleId", args.circleId)).collect();
    const members = await Promise.all(memberRecords.map(async record => {
      const person = await authComponent.getAnyUserById(ctx, record.userId);
      const activities = await ctx.db.query("activities").withIndex("by_user", q => q.eq("userId", record.userId)).collect();
      const completed = activities.filter(item => item.type === "completed" && item.createdAt >= weekAgo && circleTaskIds.has(String(item.taskId))).length;
      return { id: record.userId, name: person?.name ?? "Member", avatar: await avatarOf(ctx, record.userId), completed };
    }));
    members.sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name));
    const total = members.reduce((sum, member) => sum + member.completed, 0);
    return { total, top: total > 0 ? members[0] : null, members };
  }
});

export const nudgeTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId === account.id || task.done) throw new ConvexError("That task can't be nudged.");
    const links = await ctx.db.query("circleTasks").withIndex("by_task", q => q.eq("taskId", task._id)).collect();
    let shares = false;
    for (const link of links) {
      const membership = await ctx.db.query("circleMembers").withIndex("by_circle_user", q => q.eq("circleId", link.circleId).eq("userId", account.id)).first();
      if (membership) { shares = true; break; }
    }
    if (!shares) throw new ConvexError("That task can't be nudged.");
    const previous = await ctx.db.query("nudges").withIndex("by_from_task", q => q.eq("fromUserId", account.id).eq("taskId", task._id)).collect();
    if (previous.some(item => item.createdAt > Date.now() - 24 * 60 * 60 * 1000)) {
      throw new ConvexError("You already nudged them about this today.");
    }
    await ctx.db.insert("nudges", { toUserId: task.userId, fromUserId: account.id, taskId: task._id, seen: false, createdAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.push.notifyUser, {
      userId: task.userId, title: `${account.name} nudged you`, body: task.title, tag: `nudge-${task._id}`
    });
    return { ok: true };
  }
});

export const listNudges = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const rows = await ctx.db.query("nudges").withIndex("by_to", q => q.eq("toUserId", id)).order("desc").take(20);
    const result = [];
    for (const row of rows) {
      const task = await ctx.db.get(row.taskId);
      if (!task) continue;
      const from = await authComponent.getAnyUserById(ctx, row.fromUserId);
      result.push({
        id: String(row._id), fromName: from?.name ?? "A friend", fromAvatar: await avatarOf(ctx, row.fromUserId),
        taskTitle: task.title, seen: row.seen, createdAt: new Date(row.createdAt).toISOString()
      });
    }
    return result;
  }
});

export const markNudgesSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const rows = await ctx.db.query("nudges").withIndex("by_to", q => q.eq("toUserId", id)).order("desc").take(50);
    for (const row of rows) if (!row.seen) await ctx.db.patch(row._id, { seen: true });
    return { ok: true };
  }
});

export const exportData = query({
  args: {},
  handler: async (ctx) => {
    const account = await requireUser(ctx);
    const profile = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", account.id)).first();
    const tasks = await ctx.db.query("tasks").withIndex("by_user", q => q.eq("userId", account.id)).collect();
    const messages = await ctx.db.query("messages").withIndex("by_sender_created", q => q.eq("senderId", account.id)).collect();
    return {
      exportedAt: new Date().toISOString(),
      account: { name: account.name, email: account.email, bio: profile?.bio ?? "", avatar: profile?.avatar ?? "" },
      tasks: tasks.map(task => ({
        title: task.title, description: task.description, category: task.category, dueDate: task.dueDate,
        priority: task.priority, visibility: task.visibility, done: task.done, repeat: task.repeat ?? "none",
        focusMinutes: task.targetMinutes, createdAt: new Date(task.createdAt).toISOString()
      })),
      messagesSent: messages.map(message => ({ content: message.content, createdAt: new Date(message.createdAt).toISOString() }))
    };
  }
});

export const deleteAccount = mutation({
  args: { confirm: v.string() },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    if (args.confirm !== "DELETE") throw new ConvexError("Type DELETE to confirm.");
    const id = account.id;

    const tasks = await ctx.db.query("tasks").withIndex("by_user", q => q.eq("userId", id)).collect();
    for (const task of tasks) {
      for (const link of await ctx.db.query("circleTasks").withIndex("by_task", q => q.eq("taskId", task._id)).collect()) await ctx.db.delete(link._id);
      for (const nudge of await ctx.db.query("nudges").withIndex("by_task", q => q.eq("taskId", task._id)).collect()) await ctx.db.delete(nudge._id);
      await ctx.db.delete(task._id);
    }
    for (const activity of await ctx.db.query("activities").withIndex("by_user", q => q.eq("userId", id)).collect()) {
      for (const reaction of await ctx.db.query("reactions").withIndex("by_activity", q => q.eq("activityId", activity._id)).collect()) await ctx.db.delete(reaction._id);
      await ctx.db.delete(activity._id);
    }
    for (const reaction of await ctx.db.query("reactions").withIndex("by_user", q => q.eq("userId", id)).collect()) await ctx.db.delete(reaction._id);
    for (const message of await ctx.db.query("messages").withIndex("by_sender_created", q => q.eq("senderId", id)).collect()) await ctx.db.delete(message._id);
    for (const nudge of await ctx.db.query("nudges").withIndex("by_to", q => q.eq("toUserId", id)).collect()) await ctx.db.delete(nudge._id);

    for (const membership of await ctx.db.query("circleMembers").withIndex("by_user", q => q.eq("userId", id)).collect()) {
      const circle = await ctx.db.get(membership.circleId);
      await ctx.db.delete(membership._id);
      for (const row of await ctx.db.query("typing").withIndex("by_circle_user", q => q.eq("circleId", membership.circleId).eq("userId", id)).collect()) await ctx.db.delete(row._id);
      if (!circle || circle.ownerId !== id) continue;
      const others = (await ctx.db.query("circleMembers").withIndex("by_circle", q => q.eq("circleId", circle._id)).collect())
        .sort((a, b) => a.joinedAt - b.joinedAt);
      if (others.length) {
        await ctx.db.patch(circle._id, { ownerId: others[0].userId });
      } else {
        await deleteCircleAssignments(ctx, circle._id);
        for (const link of await ctx.db.query("circleTasks").withIndex("by_circle", q => q.eq("circleId", circle._id)).collect()) await ctx.db.delete(link._id);
        for (const message of await ctx.db.query("messages").withIndex("by_circle", q => q.eq("circleId", circle._id)).collect()) await ctx.db.delete(message._id);
        for (const invite of await ctx.db.query("invites").withIndex("by_circle", q => q.eq("circleId", circle._id)).collect()) await ctx.db.delete(invite._id);
        await ctx.db.delete(circle._id);
      }
    }
    for (const friendship of await ctx.db.query("friendships").withIndex("by_user", q => q.eq("userId", id)).collect()) {
      const reverse = await ctx.db.query("friendships").withIndex("by_pair", q => q.eq("userId", friendship.friendId).eq("friendId", id)).first();
      if (reverse) await ctx.db.delete(reverse._id);
      await ctx.db.delete(friendship._id);
    }
    const profile = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", id)).first();
    if (profile) await ctx.db.delete(profile._id);
    for (const subscription of await ctx.db.query("pushSubscriptions").withIndex("by_user", q => q.eq("userId", id)).collect()) await ctx.db.delete(subscription._id);
    for (const feed of await ctx.db.query("calendarFeeds").withIndex("by_user", q => q.eq("userId", id)).collect()) await ctx.db.delete(feed._id);
    for (const link of await ctx.db.query("telegramLinks").withIndex("by_user", q => q.eq("userId", id)).collect()) await ctx.db.delete(link._id);
    for (const token of await ctx.db.query("telegramLinkTokens").withIndex("by_user", q => q.eq("userId", id)).collect()) await ctx.db.delete(token._id);
    for (const row of await ctx.db.query("googleCalendarCredentials").withIndex("by_user", q => q.eq("userId", id)).collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("googleCalendarOAuthStates").withIndex("by_user", q => q.eq("userId", id)).collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("googleCalendarTaskLinks").withIndex("by_user", q => q.eq("userId", id)).collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("googleCalendarSyncStates").withIndex("by_user", q => q.eq("userId", id)).collect()) await ctx.db.delete(row._id);

    const deletionPagination = { numItems: 1000, cursor: null };
    await ctx.runMutation(components.betterAuth.adapter.deleteMany, { input: { model: "session", where: [{ field: "userId", value: id }] }, paginationOpts: deletionPagination });
    await ctx.runMutation(components.betterAuth.adapter.deleteMany, { input: { model: "account", where: [{ field: "userId", value: id }] }, paginationOpts: deletionPagination });
    await ctx.runMutation(components.betterAuth.adapter.deleteOne, { input: { model: "user", where: [{ field: "_id", value: id }] } });
    return { ok: true };
  }
});

export const savePushSubscription = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    if (!args.endpoint.startsWith("https://") || args.endpoint.length > 1000) throw new ConvexError("That device can't receive notifications.");
    const existing = await ctx.db.query("pushSubscriptions").withIndex("by_endpoint", q => q.eq("endpoint", args.endpoint)).first();
    if (existing) await ctx.db.patch(existing._id, { userId: id, p256dh: args.p256dh, auth: args.auth });
    else await ctx.db.insert("pushSubscriptions", { userId: id, endpoint: args.endpoint, p256dh: args.p256dh, auth: args.auth, createdAt: Date.now() });
    return { ok: true };
  }
});

export const removePushSubscription = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    const rows = await ctx.db.query("pushSubscriptions").withIndex("by_endpoint", q => q.eq("endpoint", args.endpoint)).collect();
    for (const row of rows) if (row.userId === id) await ctx.db.delete(row._id);
    return { ok: true };
  }
});

export const leaveCircle = mutation({
  args: { circleId: v.id("circles") },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    await requireCircleMember(ctx, args.circleId, id);
    const circle = await ctx.db.get(args.circleId);
    if (!circle) throw new ConvexError("That circle could not be found.");
    await removeMemberData(ctx, args.circleId, id);
    const remaining = (await ctx.db.query("circleMembers").withIndex("by_circle", q => q.eq("circleId", args.circleId)).collect())
      .sort((a, b) => a.joinedAt - b.joinedAt);
    if (remaining.length === 0) {
      await deleteCircleAssignments(ctx, args.circleId);
      for (const link of await ctx.db.query("circleTasks").withIndex("by_circle", q => q.eq("circleId", args.circleId)).collect()) await ctx.db.delete(link._id);
      for (const message of await ctx.db.query("messages").withIndex("by_circle", q => q.eq("circleId", args.circleId)).collect()) await ctx.db.delete(message._id);
      for (const invite of await ctx.db.query("invites").withIndex("by_circle", q => q.eq("circleId", args.circleId)).collect()) await ctx.db.delete(invite._id);
      await ctx.db.delete(args.circleId);
    } else if (circle.ownerId === id) {
      // Ownership passes to an admin first, otherwise to the member who has been here longest.
      const next = remaining.find(member => member.role === "admin") ?? remaining[0];
      await ctx.db.patch(args.circleId, { ownerId: next.userId });
      if (next.role === "admin") await ctx.db.patch(next._id, { role: "member" });
    }
    return { ok: true };
  }
});

export const setCircleAdmin = mutation({
  args: { circleId: v.id("circles"), userId: v.string(), admin: v.boolean() },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    const circle = await ctx.db.get(args.circleId);
    if (!circle || circle.ownerId !== account.id) throw new ConvexError("Only the circle owner can change admins.");
    if (args.userId === circle.ownerId) throw new ConvexError("The owner already has every permission.");
    const membership = await ctx.db.query("circleMembers")
      .withIndex("by_circle_user", q => q.eq("circleId", args.circleId).eq("userId", args.userId)).first();
    if (!membership) throw new ConvexError("That person is not in this circle.");
    await ctx.db.patch(membership._id, { role: args.admin ? "admin" : "member" });
    return { ok: true };
  }
});

export const removeCircleMember = mutation({
  args: { circleId: v.id("circles"), userId: v.string() },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    const { circle, role } = await requireCircleManager(ctx, args.circleId, account.id);
    if (args.userId === account.id) throw new ConvexError("Use Leave to remove yourself from a circle.");
    if (args.userId === circle.ownerId) throw new ConvexError("The circle owner can't be removed.");
    const membership = await ctx.db.query("circleMembers")
      .withIndex("by_circle_user", q => q.eq("circleId", args.circleId).eq("userId", args.userId)).first();
    if (!membership) throw new ConvexError("That person is not in this circle.");
    if (role === "admin" && membership.role === "admin") throw new ConvexError("Only the owner can remove an admin.");
    await removeMemberData(ctx, args.circleId, args.userId);
    return { ok: true };
  }
});

export const createAssignment = mutation({
  args: {
    circleId: v.id("circles"),
    title: v.string(),
    description: v.string(),
    category: v.string(),
    dueDate: v.union(v.string(), v.null()),
    priority: v.string(),
    targetMinutes: v.number(),
    includeSelf: v.boolean(),
    assigneeIds: v.optional(v.array(v.string()))
  },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    const { circle } = await requireCircleManager(ctx, args.circleId, account.id);
    const title = args.title.trim();
    if (!title || title.length > 120) throw new ConvexError("Task titles must be 1–120 characters.");
    if (args.description.length > 2000) throw new ConvexError("Task descriptions must be 2,000 characters or fewer.");
    if (!["low", "normal", "high"].includes(args.priority)) throw new ConvexError("Choose a valid priority.");
    if (!isValidDate(args.dueDate)) throw new ConvexError("Choose a valid due date.");
    if (!Number.isInteger(args.targetMinutes) || args.targetMinutes < 1 || args.targetMinutes > 1440) {
      throw new ConvexError("Focus time must be between 1 and 1,440 minutes.");
    }
    const members = await ctx.db.query("circleMembers").withIndex("by_circle", q => q.eq("circleId", args.circleId)).collect();
    let assignees = members.filter(member => args.includeSelf || member.userId !== account.id);
    if (args.assigneeIds && args.assigneeIds.length > 0) {
      const wanted = new Set(args.assigneeIds);
      assignees = members.filter(member => wanted.has(member.userId));
      if (assignees.length !== wanted.size) throw new ConvexError("Choose people who are in this circle.");
    } else if (!assignees.length) {
      throw new ConvexError("Invite someone to your circle before assigning tasks.");
    }
    const now = Date.now();
    const assignmentId = await ctx.db.insert("assignments", {
      circleId: args.circleId, createdBy: account.id, title, description: args.description.trim(),
      category: args.category, dueDate: args.dueDate, priority: args.priority, targetMinutes: args.targetMinutes, createdAt: now
    });
    await Promise.all(assignees.map(async member => {
      const taskId = await ctx.db.insert("tasks", {
        userId: member.userId, title, description: args.description.trim(), category: args.category,
        dueDate: args.dueDate, priority: args.priority, visibility: "private", targetMinutes: args.targetMinutes,
        elapsedSeconds: 0, timerStartedAt: null, done: false, repeat: "none", reminderTime: "",
        assignmentId, assignedByName: account.name, createdAt: now
      });
      await ctx.db.insert("circleTasks", { circleId: args.circleId, taskId, sharedBy: member.userId, createdAt: now });
      if (member.userId !== account.id) {
        await ctx.scheduler.runAfter(0, internal.push.notifyUser, {
          userId: member.userId, title: `${account.name} assigned a task in ${circle.name}`, body: title, tag: `assign-${assignmentId}`
        });
      }
    }));
    return { id: String(assignmentId), assigned: assignees.length };
  }
});

export const listAssignments = query({
  args: { circleId: v.id("circles") },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    await requireCircleMember(ctx, args.circleId, id);
    const circle = await ctx.db.get(args.circleId);
    const role = circle ? await circleRoleOf(ctx, circle, id) : null;
    const canManage = role === "owner" || role === "admin";
    const rows = await ctx.db.query("assignments").withIndex("by_circle", q => q.eq("circleId", args.circleId)).order("desc").take(30);
    const result = await Promise.all(rows.map(async row => {
      const tasks = await ctx.db.query("tasks").withIndex("by_assignment", q => q.eq("assignmentId", row._id)).collect();
      const mine = tasks.find(task => task.userId === id);
      if (!canManage && !mine) return null;
      const creator = await authComponent.getAnyUserById(ctx, row.createdBy);
      const members = canManage ? await Promise.all(tasks.map(async task => {
        const person = await authComponent.getAnyUserById(ctx, task.userId);
        return { id: task.userId, name: person?.name ?? "Member", avatar: await avatarOf(ctx, task.userId), done: task.done };
      })) : [];
      return {
        id: String(row._id), title: row.title, description: row.description, category: row.category,
        dueDate: row.dueDate, priority: row.priority, createdAt: new Date(row.createdAt).toISOString(),
        createdByName: creator?.name ?? "Owner", total: tasks.length, doneCount: tasks.filter(task => task.done).length,
        members, mineDone: mine ? mine.done : null
      };
    }));
    return result.filter(Boolean);
  }
});

export const deleteAssignment = mutation({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    const row = await ctx.db.get(args.assignmentId);
    if (!row) throw new ConvexError("That assignment could not be found.");
    await requireCircleManager(ctx, row.circleId, id);
    for (const task of await ctx.db.query("tasks").withIndex("by_assignment", q => q.eq("assignmentId", row._id)).collect()) await removeTaskCompletely(ctx, task);
    await ctx.db.delete(row._id);
    return { ok: true };
  }
});

export const circleWeekly = query({
  args: { circleId: v.id("circles"), weekStart: v.string(), tzOffset: v.number() },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    await requireCircleManager(ctx, args.circleId, id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.weekStart)) throw new ConvexError("Choose a valid week.");
    const addDays = (key: string, amount: number) => {
      const date = new Date(`${key}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + amount);
      return date.toISOString().slice(0, 10);
    };
    const keys = Array.from({ length: 7 }, (_, index) => addDays(args.weekStart, index));
    const links = await ctx.db.query("circleTasks").withIndex("by_circle", q => q.eq("circleId", args.circleId)).collect();
    const memberRecords = await ctx.db.query("circleMembers").withIndex("by_circle", q => q.eq("circleId", args.circleId)).collect();
    const people = new Map<string, { id: string; name: string; avatar: string; done: number; open: number; moved: number; days: { key: string; done: number; open: number }[] }>();
    for (const record of memberRecords) {
      const person = await authComponent.getAnyUserById(ctx, record.userId);
      people.set(record.userId, {
        id: record.userId, name: person?.name ?? "Member", avatar: await avatarOf(ctx, record.userId), done: 0, open: 0, moved: 0,
        days: keys.map(key => ({ key, done: 0, open: 0 }))
      });
    }
    const rows: { member: string; memberId: string; title: string; category: string; day: string; status: "done" | "open" | "moved"; movedTo: string | null }[] = [];
    const seen = new Set<string>();
    for (const link of links) {
      if (seen.has(String(link.taskId))) continue;
      seen.add(String(link.taskId));
      const task = await ctx.db.get(link.taskId);
      const person = task ? people.get(task.userId) : undefined;
      if (!task || !person) continue;
      const day = task.dueDate ?? localDayKey(task.createdAt, args.tzOffset);
      const entries: { day: string; status: "done" | "open" | "moved"; movedTo: string | null }[] = [];
      for (const from of task.movedFrom ?? []) if (from !== day) entries.push({ day: from, status: "moved", movedTo: day });
      entries.push({ day, status: task.done ? "done" : "open", movedTo: null });
      for (const entry of entries) {
        const index = keys.indexOf(entry.day);
        if (index < 0) continue;
        if (entry.status === "done") { person.done += 1; person.days[index].done += 1; }
        else { person.open += 1; person.days[index].open += 1; if (entry.status === "moved") person.moved += 1; }
        if (rows.length < 600) rows.push({ member: person.name, memberId: person.id, title: task.title, category: task.category, day: entry.day, status: entry.status, movedTo: entry.movedTo });
      }
    }
    const members = [...people.values()].map(person => {
      const total = person.done + person.open;
      return { ...person, total, completion: total ? Math.round((person.done / total) * 100) : 0 };
    }).sort((a, b) => b.completion - a.completion || b.done - a.done || a.name.localeCompare(b.name));
    const done = members.reduce((sum, person) => sum + person.done, 0);
    const open = members.reduce((sum, person) => sum + person.open, 0);
    const circle = await ctx.db.get(args.circleId);
    return {
      circleName: circle?.name ?? "Circle", weekStart: args.weekStart, members, rows,
      totals: { done, open, total: done + open, completion: done + open ? Math.round((done / (done + open)) * 100) : 0 }
    };
  }
});
