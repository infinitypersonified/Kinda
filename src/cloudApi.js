import { makeFunctionReference } from "convex/server";

const routes = [
  { method: "GET", pattern: /^\/me$/, type: "query", name: "workspace:me", args: () => ({}) },
  { method: "PATCH", pattern: /^\/profile$/, type: "mutation", name: "workspace:updateProfile", args: body => body },
  { method: "GET", pattern: /^\/tasks$/, type: "query", name: "workspace:listTasks", args: () => ({}) },
  { method: "POST", pattern: /^\/tasks$/, type: "mutation", name: "workspace:createTask", args: body => body },
  { method: "GET", pattern: /^\/friends$/, type: "query", name: "workspace:listFriends", args: () => ({}) },
  { method: "POST", pattern: /^\/friends$/, type: "mutation", name: "workspace:addFriend", args: body => body },
  { method: "GET", pattern: /^\/friends\/search$/, type: "query", name: "workspace:searchFriends", args: (_, url) => ({ query: url.searchParams.get("q") || "" }) },
  { method: "GET", pattern: /^\/activity$/, type: "query", name: "workspace:listActivity", args: () => ({}) },
  { method: "POST", pattern: /^\/groups$/, type: "mutation", name: "workspace:createCircle", args: body => body },
  { method: "GET", pattern: /^\/groups$/, type: "query", name: "workspace:listCircles", args: () => ({}) },
  { method: "GET", pattern: /^\/nudges$/, type: "query", name: "workspace:listNudges", args: () => ({}) },
  { method: "POST", pattern: /^\/nudges\/seen$/, type: "mutation", name: "workspace:markNudgesSeen", args: () => ({}) },
  { method: "GET", pattern: /^\/streak$/, type: "query", name: "workspace:myStreak", args: (_, url) => ({ tzOffset: Number(url.searchParams.get("tz") || 0) }) },
  { method: "GET", pattern: /^\/export$/, type: "query", name: "workspace:exportData", args: () => ({}) },
  { method: "POST", pattern: /^\/push\/subscribe$/, type: "mutation", name: "workspace:savePushSubscription", args: body => body },
  { method: "POST", pattern: /^\/push\/unsubscribe$/, type: "mutation", name: "workspace:removePushSubscription", args: body => body },
  { method: "GET", pattern: /^\/calendar\/feed$/, type: "query", name: "workspace:getCalendarFeed", args: () => ({}) },
  { method: "GET", pattern: /^\/google-calendar\/status$/, type: "query", name: "workspace:getGoogleCalendarStatus", args: () => ({}) },
  { method: "POST", pattern: /^\/google-calendar\/connect$/, type: "mutation", name: "workspace:beginGoogleCalendarLink", args: () => ({}) },
  { method: "POST", pattern: /^\/google-calendar\/sync$/, type: "mutation", name: "workspace:startGoogleCalendarSync", args: () => ({}) },
  { method: "DELETE", pattern: /^\/google-calendar$/, type: "mutation", name: "workspace:disconnectGoogleCalendar", args: () => ({}) },
  { method: "POST", pattern: /^\/calendar\/feed$/, type: "mutation", name: "workspace:createCalendarFeed", args: () => ({}) },
  { method: "DELETE", pattern: /^\/calendar\/feed$/, type: "mutation", name: "workspace:revokeCalendarFeed", args: () => ({}) },
  { method: "GET", pattern: /^\/telegram\/status$/, type: "query", name: "workspace:getTelegramStatus", args: () => ({}) },
  { method: "POST", pattern: /^\/telegram\/link$/, type: "mutation", name: "workspace:createTelegramLink", args: () => ({}) },
  { method: "DELETE", pattern: /^\/telegram\/link$/, type: "mutation", name: "workspace:unlinkTelegram", args: () => ({}) },
  { method: "POST", pattern: /^\/account\/delete$/, type: "mutation", name: "workspace:deleteAccount", args: body => body }
];

function readBody(options) {
  if (!options.body) return {};
  try {
    return JSON.parse(options.body);
  } catch {
    throw new Error("The request data was invalid. Please try again.");
  }
}

function notFound() {
  const error = new Error("That Kinda feature isn't available yet.");
  error.status = 404;
  throw error;
}

function resolveRoute(path, options = {}) {
    const url = new URL(path, window.location.origin);
    const method = options.method || "GET";
    const body = readBody(options);
    let route = routes.find(item => item.method === method && item.pattern.test(url.pathname));
    let args = route?.args(body, url) || {};
    if (!route) {
      let match = url.pathname.match(/^\/tasks\/([^/]+)$/);
      if (match && method === "PATCH") {
        route = { type: "mutation", name: "workspace:updateTask" };
        args = { ...body, taskId: match[1] };
      } else if (match && method === "DELETE") {
        route = { type: "mutation", name: "workspace:deleteTask" };
        args = { taskId: match[1] };
      } else if ((match = url.pathname.match(/^\/tasks\/([^/]+)\/(complete|start|stop)$/)) && method === "POST") {
        route = { type: "mutation", name: "workspace:taskAction" };
        args = { taskId: match[1], action: match[2], ...body };
      } else if ((match = url.pathname.match(/^\/groups\/([^/]+)\/members$/)) && method === "POST") {
        route = { type: "mutation", name: "workspace:addCircleMember" };
        args = { circleId: match[1], ...body };
      } else if ((match = url.pathname.match(/^\/groups\/([^/]+)\/invite$/)) && method === "POST") {
        route = { type: "mutation", name: "workspace:createInvite" };
        args = { circleId: match[1] };
      } else if ((match = url.pathname.match(/^\/groups\/([^/]+)\/goals$/)) && method === "GET") {
        route = { type: "query", name: "workspace:circleTasks" };
        args = { circleId: match[1] };
      } else if ((match = url.pathname.match(/^\/groups\/([^/]+)\/messages$/)) && method === "GET") {
        route = { type: "query", name: "workspace:listMessages" };
        args = { circleId: match[1], after: url.searchParams.get("after") || undefined };
      } else if ((match = url.pathname.match(/^\/groups\/([^/]+)\/messages$/)) && method === "POST") {
        route = { type: "mutation", name: "workspace:sendMessage" };
        args = { circleId: match[1], ...body };
      } else if ((match = url.pathname.match(/^\/invites\/([^/]+)$/)) && method === "GET") {
        route = { type: "query", name: "workspace:invitePreview" };
        args = { token: match[1] };
      } else if ((match = url.pathname.match(/^\/invites\/([^/]+)\/join$/)) && method === "POST") {
        route = { type: "mutation", name: "workspace:joinInvite" };
        args = { token: match[1] };
      } else if ((match = url.pathname.match(/^\/friends\/([^/]+)\/profile$/)) && method === "GET") {
        route = { type: "query", name: "workspace:friendProfile" };
        args = { friendId: match[1] };
      } else if ((match = url.pathname.match(/^\/activity\/([^/]+)\/react$/)) && method === "POST") {
        route = { type: "mutation", name: "workspace:toggleReaction" };
        args = { activityId: match[1], ...body };
      } else if ((match = url.pathname.match(/^\/groups\/([^/]+)\/invite\/revoke$/)) && method === "POST") {
        route = { type: "mutation", name: "workspace:revokeInvite" };
        args = { circleId: match[1] };
      } else if ((match = url.pathname.match(/^\/groups\/([^/]+)\/leave$/)) && method === "POST") {
        route = { type: "mutation", name: "workspace:leaveCircle" };
        args = { circleId: match[1] };
      } else if ((match = url.pathname.match(/^\/groups\/([^/]+)\/recap$/)) && method === "GET") {
        route = { type: "query", name: "workspace:circleRecap" };
        args = { circleId: match[1] };
      } else if ((match = url.pathname.match(/^\/groups\/([^/]+)\/members\/([^/]+)\/admin$/)) && method === "POST") {
        route = { type: "mutation", name: "workspace:setCircleAdmin" };
        args = { circleId: match[1], userId: decodeURIComponent(match[2]), ...body };
      } else if ((match = url.pathname.match(/^\/groups\/([^/]+)\/members\/([^/]+)$/)) && method === "DELETE") {
        route = { type: "mutation", name: "workspace:removeCircleMember" };
        args = { circleId: match[1], userId: decodeURIComponent(match[2]) };
      } else if ((match = url.pathname.match(/^\/groups\/([^/]+)\/weekly$/)) && method === "GET") {
        route = { type: "query", name: "workspace:circleWeekly" };
        args = { circleId: match[1], weekStart: url.searchParams.get("week") || "", tzOffset: Number(url.searchParams.get("tz") || 0) };
      } else if ((match = url.pathname.match(/^\/groups\/([^/]+)\/assignments$/)) && method === "GET") {
        route = { type: "query", name: "workspace:listAssignments" };
        args = { circleId: match[1] };
      } else if ((match = url.pathname.match(/^\/groups\/([^/]+)\/assignments$/)) && method === "POST") {
        route = { type: "mutation", name: "workspace:createAssignment" };
        args = { circleId: match[1], ...body };
      } else if ((match = url.pathname.match(/^\/assignments\/([^/]+)$/)) && method === "DELETE") {
        route = { type: "mutation", name: "workspace:deleteAssignment" };
        args = { assignmentId: match[1] };
      } else if ((match = url.pathname.match(/^\/groups\/([^/]+)\/typing$/)) && method === "GET") {
        route = { type: "query", name: "workspace:listTyping" };
        args = { circleId: match[1] };
      } else if ((match = url.pathname.match(/^\/groups\/([^/]+)\/typing$/)) && method === "POST") {
        route = { type: "mutation", name: "workspace:setTyping" };
        args = { circleId: match[1] };
      } else if ((match = url.pathname.match(/^\/messages\/([^/]+)$/)) && method === "PATCH") {
        route = { type: "mutation", name: "workspace:editMessage" };
        args = { messageId: match[1], ...body };
      } else if ((match = url.pathname.match(/^\/messages\/([^/]+)$/)) && method === "DELETE") {
        route = { type: "mutation", name: "workspace:deleteMessage" };
        args = { messageId: match[1] };
      } else if ((match = url.pathname.match(/^\/tasks\/([^/]+)\/nudge$/)) && method === "POST") {
        route = { type: "mutation", name: "workspace:nudgeTask" };
        args = { taskId: match[1] };
      }
    }
    if (!route) return notFound();
    return { route, args };
}

function friendlyError(cause) {
  const message = cause?.data || cause?.message || "The request failed. Please try again.";
  const error = new Error(String(message).replace(/^Uncaught Error:\s*/, ""));
  if (/unauthenticated|not authenticated/i.test(error.message)) error.status = 401;
  return error;
}

export function createCloudApi(client) {
  return async function cloudApi(path, options = {}) {
    const { route, args } = resolveRoute(path, options);
    try {
      const reference = makeFunctionReference(route.name);
      return route.type === "query"
        ? await client.query(reference, args)
        : await client.mutation(reference, args);
    } catch (cause) {
      throw friendlyError(cause);
    }
  };
}

// Subscribes to a GET path; onData fires on every change pushed by Convex. Returns an unsubscribe function.
export function createCloudLive(client) {
  return function live(path, onData, onError = () => {}) {
    let route;
    let args;
    try {
      ({ route, args } = resolveRoute(path));
    } catch (error) {
      onError(error);
      return () => {};
    }
    const watch = client.watchQuery(makeFunctionReference(route.name), args);
    const deliver = () => {
      try {
        const result = watch.localQueryResult();
        if (result !== undefined) onData(result);
      } catch (cause) {
        onError(friendlyError(cause));
      }
    };
    const unsubscribe = watch.onUpdate(deliver);
    deliver();
    return unsubscribe;
  };
}
