import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  profiles: defineTable({
    userId: v.string(),
    bio: v.string(),
    avatar: v.optional(v.string())
  }).index("by_user", ["userId"]),
  circles: defineTable({
    name: v.string(),
    ownerId: v.string(),
    createdAt: v.number()
  }).index("by_owner", ["ownerId"]),
  circleMembers: defineTable({
    circleId: v.id("circles"),
    userId: v.string(),
    role: v.optional(v.string()),
    joinedAt: v.number()
  }).index("by_circle", ["circleId"]).index("by_user", ["userId"]).index("by_circle_user", ["circleId", "userId"]),
  invites: defineTable({
    circleId: v.id("circles"),
    token: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number())
  }).index("by_token", ["token"]).index("by_circle", ["circleId"]),
  friendships: defineTable({
    userId: v.string(),
    friendId: v.string(),
    createdAt: v.number()
  }).index("by_user", ["userId"]).index("by_pair", ["userId", "friendId"]),
  tasks: defineTable({
    userId: v.string(),
    title: v.string(),
    description: v.string(),
    category: v.string(),
    dueDate: v.union(v.string(), v.null()),
    priority: v.string(),
    visibility: v.string(),
    targetMinutes: v.number(),
    elapsedSeconds: v.number(),
    timerStartedAt: v.union(v.string(), v.null()),
    done: v.boolean(),
    completedAt: v.optional(v.number()),
    repeat: v.optional(v.string()),
    reminderTime: v.optional(v.string()),
    reminderAt: v.optional(v.number()),
    tzOffset: v.optional(v.number()),
    assignmentId: v.optional(v.id("assignments")),
    assignedByName: v.optional(v.string()),
    sharedWith: v.optional(v.array(v.string())),
    seriesId: v.optional(v.id("tasks")),
    recurrenceJobFor: v.optional(v.string()),
    movedFrom: v.optional(v.array(v.string())),
    createdAt: v.number()
  }).index("by_user", ["userId"]).index("by_user_created", ["userId", "createdAt"]).index("by_user_due", ["userId", "dueDate"]).index("by_assignment", ["assignmentId"]).index("by_series", ["seriesId"]).index("by_series_due", ["seriesId", "dueDate"]),
  assignments: defineTable({
    circleId: v.id("circles"),
    createdBy: v.string(),
    title: v.string(),
    description: v.string(),
    category: v.string(),
    dueDate: v.union(v.string(), v.null()),
    priority: v.string(),
    targetMinutes: v.number(),
    createdAt: v.number()
  }).index("by_circle", ["circleId", "createdAt"]),
  circleTasks: defineTable({
    circleId: v.id("circles"),
    taskId: v.id("tasks"),
    sharedBy: v.string(),
    createdAt: v.number()
  }).index("by_circle", ["circleId"]).index("by_task", ["taskId"]).index("by_circle_task", ["circleId", "taskId"]).index("by_shared_by", ["sharedBy"]),
  messages: defineTable({
    circleId: v.id("circles"),
    senderId: v.string(),
    content: v.string(),
    replyTo: v.optional(v.id("messages")),
    mentions: v.optional(v.array(v.string())),
    editedAt: v.optional(v.number()),
    createdAt: v.number()
  }).index("by_circle", ["circleId"]).index("by_sender_created", ["senderId", "createdAt"]),
  pushSubscriptions: defineTable({
    userId: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    createdAt: v.number()
  }).index("by_user", ["userId"]).index("by_endpoint", ["endpoint"]),
  calendarFeeds: defineTable({
    userId: v.string(),
    token: v.string(),
    createdAt: v.number()
  }).index("by_user", ["userId"]).index("by_token", ["token"]),
  telegramLinks: defineTable({
    userId: v.string(),
    chatId: v.string(),
    createdAt: v.number()
  }).index("by_user", ["userId"]),
  telegramLinkTokens: defineTable({
    userId: v.string(),
    token: v.string(),
    expiresAt: v.number()
  }).index("by_token", ["token"]).index("by_user", ["userId"]),
  googleCalendarCredentials: defineTable({
    userId: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    accessTokenExpiresAt: v.number(),
    updatedAt: v.number()
  }).index("by_user", ["userId"]),
  googleCalendarOAuthStates: defineTable({
    userId: v.string(),
    state: v.string(),
    expiresAt: v.number()
  }).index("by_state", ["state"]).index("by_user", ["userId"]),
  googleCalendarTaskLinks: defineTable({
    userId: v.string(),
    taskId: v.id("tasks"),
    eventId: v.string(),
    lastTitle: v.string(),
    lastDescription: v.string(),
    lastDueDate: v.string(),
    updatedAt: v.number()
  }).index("by_user", ["userId"]).index("by_task", ["taskId"]),
  googleCalendarSyncStates: defineTable({
    userId: v.string(),
    syncing: v.boolean(),
    lastSyncAt: v.optional(v.number()),
    lastError: v.optional(v.string())
  }).index("by_user", ["userId"]),
  typing: defineTable({
    circleId: v.id("circles"),
    userId: v.string(),
    updatedAt: v.number()
  }).index("by_circle", ["circleId"]).index("by_circle_user", ["circleId", "userId"]),
  nudges: defineTable({
    toUserId: v.string(),
    fromUserId: v.string(),
    taskId: v.id("tasks"),
    seen: v.boolean(),
    createdAt: v.number()
  }).index("by_to", ["toUserId", "createdAt"]).index("by_from_task", ["fromUserId", "taskId"]).index("by_task", ["taskId"]),
  activities: defineTable({
    userId: v.string(),
    taskId: v.id("tasks"),
    type: v.union(v.literal("created"), v.literal("completed")),
    createdAt: v.number()
  }).index("by_created", ["createdAt"]).index("by_user", ["userId"]).index("by_task", ["taskId"]),
  reactions: defineTable({
    activityId: v.id("activities"),
    userId: v.string(),
    emoji: v.optional(v.string()),
    createdAt: v.number()
  }).index("by_activity", ["activityId"]).index("by_activity_user", ["activityId", "userId"]).index("by_user", ["userId"])
});
