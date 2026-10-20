import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

export const notifyReminder = internalAction({
  args: { userId: v.string(), title: v.string() },
  handler: async (ctx, args) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    const chatId = await ctx.runQuery(internal.workspace.telegramChatId, { userId: args.userId });
    if (!chatId) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `Kinda reminder: ${args.title}` })
    });
  }
});
