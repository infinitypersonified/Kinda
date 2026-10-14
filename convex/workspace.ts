import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { components } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";

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
    createdAt: task.createdAt,
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
    groupIds: v.array(v.id("circles"))
  },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
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
    const taskId = await ctx.db.insert("tasks", {
      userId: account.id,
      title,
      description: args.description.trim(),
      category: args.category,
      dueDate: args.dueDate,
      priority: args.priority,
      visibility: args.visibility,
      targetMinutes: args.targetMinutes,
      elapsedSeconds: 0,
      timerStartedAt: null,
      done: false,
      createdAt: Date.now()
    });
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
    groupIds: v.array(v.id("circles"))
  },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== id) throw new ConvexError("That task could not be found.");
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
    await ctx.db.patch(task._id, {
      title, description: args.description.trim(), category: args.category, dueDate: args.dueDate,
      priority: args.priority, visibility: args.visibility, targetMinutes: args.targetMinutes
    });
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
    const links = await ctx.db.query("circleTasks").withIndex("by_task", q => q.eq("taskId", task._id)).collect();
    const activities = await ctx.db.query("activities").withIndex("by_user", q => q.eq("userId", id)).collect();
    const taskActivities = activities.filter(item => item.taskId === task._id);
    for (const link of links) await ctx.db.delete(link._id);
    for (const activity of taskActivities) {
      const reactions = await ctx.db.query("reactions").withIndex("by_activity", q => q.eq("activityId", activity._id)).collect();
      for (const reaction of reactions) await ctx.db.delete(reaction._id);
      await ctx.db.delete(activity._id);
    }
    await ctx.db.delete(task._id);
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
          taskCount: visibleTasks.length,
          doneCount: visibleTasks.filter(task => task!.done).length
        };
      }));
      return {
        id: String(circle._id),
        name: circle.name,
        ownerId: circle.ownerId,
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
      return { id: String(task._id), ownerId: task.userId, ownerName: owner?.name ?? "Member", title: task.title, category: task.category, dueDate: task.dueDate, done: task.done };
    })).then(tasks => tasks.filter(Boolean));
  }
});

export const addCircleMember = mutation({
  args: { circleId: v.id("circles"), userId: v.string() },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    const circle = await ctx.db.get(args.circleId);
    if (!circle || circle.ownerId !== account.id) throw new ConvexError("Only the circle owner can add members.");
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
    const token = existing?.token ?? crypto.randomUUID().replaceAll("-", "");
    if (existing) await ctx.db.patch(existing._id, { token, createdBy: account.id, createdAt: Date.now() });
    else await ctx.db.insert("invites", { circleId: args.circleId, token, createdBy: account.id, createdAt: Date.now() });
    return { token };
  }
});

export const invitePreview = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.query("invites").withIndex("by_token", q => q.eq("token", args.token)).first();
    const circle = invitation ? await ctx.db.get(invitation.circleId) : null;
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
    if (!invitation) throw new ConvexError("This invite link is invalid or has expired.");
    const circle = await ctx.db.get(invitation.circleId);
    if (!circle) throw new ConvexError("This invite link is invalid or has expired.");
    const existing = await ctx.db.query("circleMembers").withIndex("by_circle_user", q => q.eq("circleId", circle._id).eq("userId", account.id)).first();
    if (!existing) await ctx.db.insert("circleMembers", { circleId: circle._id, userId: account.id, joinedAt: Date.now() });
    return { name: circle.name };
  }
});

export const listMessages = query({
  args: { circleId: v.id("circles"), after: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireCircleMember(ctx, args.circleId, (await requireUser(ctx)).id);
    const records = await ctx.db.query("messages").withIndex("by_circle", q => q.eq("circleId", args.circleId))
      .order("desc").take(100);
    const ordered = records.reverse();
    const afterIndex = args.after ? ordered.findIndex(message => String(message._id) === args.after) : -1;
    const visible = args.after && afterIndex >= 0 ? ordered.slice(afterIndex + 1) : args.after ? ordered.slice(-1) : ordered;
    return await Promise.all(visible.map(async message => {
      const sender = await authComponent.getAnyUserById(ctx, message.senderId);
      return { id: String(message._id), senderId: message.senderId, senderName: sender?.name ?? "Member", senderAvatar: await avatarOf(ctx, message.senderId), content: message.content, createdAt: new Date(message.createdAt).toISOString() };
    }));
  }
});

export const sendMessage = mutation({
  args: { circleId: v.id("circles"), content: v.string() },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    await requireCircleMember(ctx, args.circleId, account.id);
    const content = args.content.trim();
    if (!content || content.length > 2000) throw new ConvexError("Messages must be between 1 and 2,000 characters.");
    const createdAt = Date.now();
    const id = await ctx.db.insert("messages", { circleId: args.circleId, senderId: account.id, content, createdAt });
    return { id: String(id), senderId: account.id, senderName: account.name, senderAvatar: await avatarOf(ctx, account.id), content, createdAt: new Date(createdAt).toISOString() };
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
      model: "user", limit: 50, paginationOpts: { numItems: 50, cursor: null }
    });
    const friendships = await ctx.db.query("friendships").withIndex("by_user", q => q.eq("userId", id)).collect();
    const friendIds = new Set(friendships.map(item => item.friendId));
    const matches = users.filter(person => String(person._id) !== id
      && (`${person.name} ${person.email}`.toLowerCase().includes(search))).slice(0, 20);
    return await Promise.all(matches.map(async person => ({
      id: String(person._id), name: person.name, email: person.email, bio: "",
      avatar: await avatarOf(ctx, String(person._id)),
      isFriend: friendIds.has(String(person._id))
    })));
  }
});

export const addFriend = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const account = await requireUser(ctx);
    const email = args.email.trim().toLowerCase();
    if (email.length > 254) throw new ConvexError("Enter a valid email address.");
    const { page: people } = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user", where: [{ field: "email", value: email }], limit: 2,
      paginationOpts: { numItems: 2, cursor: null }
    });
    const friend = people.find(person => String(person._id) !== account.id);
    if (!friend) throw new ConvexError("No Kinda member has that email yet.");
    const pair = await ctx.db.query("friendships").withIndex("by_pair", q => q.eq("userId", account.id).eq("friendId", String(friend._id))).first();
    if (!pair) {
      await ctx.db.insert("friendships", { userId: account.id, friendId: String(friend._id), createdAt: Date.now() });
      await ctx.db.insert("friendships", { userId: String(friend._id), friendId: account.id, createdAt: Date.now() });
    }
    return { id: String(friend._id), name: friend.name, email: friend.email };
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
    const visibleTasks = tasks.filter(task => task.visibility === "friends").slice(0, 30).map(task => ({
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
      if (!task || task.visibility !== "friends") continue;
      const actor = await authComponent.getAnyUserById(ctx, item.userId);
      const reactions = await ctx.db.query("reactions").withIndex("by_activity", q => q.eq("activityId", item._id)).collect();
      result.push({
        id: String(item._id), actorId: item.userId, actorName: actor?.name ?? "Member", actorAvatar: await avatarOf(ctx, item.userId),
        taskId: String(task._id), taskTitle: task.title, type: item.type,
        createdAt: new Date(item.createdAt).toISOString(), reactionCount: reactions.length,
        reacted: reactions.some(reaction => reaction.userId === id)
      });
      if (result.length >= 50) break;
    }
    return result;
  }
});

export const toggleReaction = mutation({
  args: { activityId: v.id("activities") },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    const activity = await ctx.db.get(args.activityId);
    if (!activity) throw new ConvexError("That activity could not be found.");
    const friendships = await ctx.db.query("friendships").withIndex("by_pair", q => q.eq("userId", id).eq("friendId", activity.userId)).first();
    if (activity.userId !== id && !friendships) throw new ConvexError("That activity could not be found.");
    const task = await ctx.db.get(activity.taskId);
    if (!task || task.visibility !== "friends") throw new ConvexError("That activity could not be found.");
    const existing = await ctx.db.query("reactions").withIndex("by_activity_user", q => q.eq("activityId", activity._id).eq("userId", id)).first();
    if (existing) await ctx.db.delete(existing._id);
    else await ctx.db.insert("reactions", { activityId: activity._id, userId: id, createdAt: Date.now() });
    const all = await ctx.db.query("reactions").withIndex("by_activity", q => q.eq("activityId", activity._id)).collect();
    return { reacted: !existing, reactionCount: all.length };
  }
});
