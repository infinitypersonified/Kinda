import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const circleRecipients = internalQuery({
  args: { circleId: v.id("circles"), excludeUserId: v.string() },
  handler: async (ctx, args) => {
    const circle = await ctx.db.get(args.circleId);
    const members = await ctx.db.query("circleMembers").withIndex("by_circle", q => q.eq("circleId", args.circleId)).collect();
    const subscriptions: { endpoint: string; p256dh: string; auth: string }[] = [];
    for (const member of members) {
      if (member.userId === args.excludeUserId) continue;
      const rows = await ctx.db.query("pushSubscriptions").withIndex("by_user", q => q.eq("userId", member.userId)).collect();
      for (const row of rows) subscriptions.push({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
    }
    return { circleName: circle?.name ?? "your circle", subscriptions };
  }
});

export const subscriptionsForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("pushSubscriptions").withIndex("by_user", q => q.eq("userId", args.userId)).collect();
    return rows.map(row => ({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }));
  }
});

export const dropSubscription = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("pushSubscriptions").withIndex("by_endpoint", q => q.eq("endpoint", args.endpoint)).collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
});
