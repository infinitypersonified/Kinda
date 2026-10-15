"use node";
import webpush from "web-push";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";

type Subscription = { endpoint: string; p256dh: string; auth: string };

function configure() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:hello@kinda.app", publicKey, privateKey);
  return true;
}

async function deliver(ctx: ActionCtx, subscriptions: Subscription[], payload: { title: string; body: string; tag: string }) {
  await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({ ...payload, url: "/" })
      );
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await ctx.runMutation(internal.pushData.dropSubscription, { endpoint: subscription.endpoint });
    }
  }));
}

export const notifyCircleMessage = internalAction({
  args: { circleId: v.id("circles"), senderId: v.string(), senderName: v.string(), preview: v.string() },
  handler: async (ctx, args) => {
    if (!configure()) return;
    const { circleName, subscriptions } = await ctx.runQuery(internal.pushData.circleRecipients, {
      circleId: args.circleId, excludeUserId: args.senderId
    });
    await deliver(ctx, subscriptions, { title: `${args.senderName} · ${circleName}`, body: args.preview, tag: `chat-${args.circleId}` });
  }
});

export const notifyUser = internalAction({
  args: { userId: v.string(), title: v.string(), body: v.string(), tag: v.string() },
  handler: async (ctx, args) => {
    if (!configure()) return;
    const subscriptions = await ctx.runQuery(internal.pushData.subscriptionsForUser, { userId: args.userId });
    await deliver(ctx, subscriptions, { title: args.title, body: args.body, tag: args.tag });
  }
});
