import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  profiles: defineTable({
    userId: v.string(),
    bio: v.string()
  }).index("by_user", ["userId"]),
  circles: defineTable({
    name: v.string(),
    ownerId: v.string(),
    createdAt: v.number()
  }).index("by_owner", ["ownerId"]),
  circleMembers: defineTable({
    circleId: v.id("circles"),
    userId: v.string(),
    joinedAt: v.number()
  }).index("by_circle", ["circleId"]).index("by_user", ["userId"]).index("by_circle_user", ["circleId", "userId"]),
  invites: defineTable({
    circleId: v.id("circles"),
    token: v.string(),
    createdBy: v.string(),
    createdAt: v.number()
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
    createdAt: v.number()
  }).index("by_user", ["userId"]).index("by_user_created", ["userId", "createdAt"]),
  circleTasks: defineTable({
    circleId: v.id("circles"),
    taskId: v.id("tasks"),
    sharedBy: v.string(),
    createdAt: v.number()
  }).index("by_circle", ["circleId"]).index("by_task", ["taskId"]).index("by_circle_task", ["circleId", "taskId"]),
  messages: defineTable({
    circleId: v.id("circles"),
    senderId: v.string(),
    content: v.string(),
    createdAt: v.number()
  }).index("by_circle", ["circleId"]),
  activities: defineTable({
    userId: v.string(),
    taskId: v.id("tasks"),
    type: v.union(v.literal("created"), v.literal("completed")),
    createdAt: v.number()
  }).index("by_created", ["createdAt"]).index("by_user", ["userId"]),
  reactions: defineTable({
    activityId: v.id("activities"),
    userId: v.string(),
    createdAt: v.number()
  }).index("by_activity", ["activityId"]).index("by_activity_user", ["activityId", "userId"])
});
