import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

// Runs at the reminder time. It only sends if the task still exists, isn't done,
// and its reminder hasn't been changed since this job was scheduled.
export const fireReminder = internalMutation({
  args: { taskId: v.id("tasks"), reminderAt: v.number() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.done || task.reminderAt !== args.reminderAt) return;
    await ctx.scheduler.runAfter(0, internal.push.notifyUser, {
      userId: task.userId,
      title: "Reminder",
      body: task.title,
      tag: `reminder-${task._id}`
    });
  }
});
