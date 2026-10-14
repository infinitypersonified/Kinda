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
  { method: "GET", pattern: /^\/groups$/, type: "query", name: "workspace:listCircles", args: () => ({}) }
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

export function createCloudApi(client) {
  return async function cloudApi(path, options = {}) {
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
        args = { activityId: match[1] };
      }
    }
    if (!route) return notFound();
    try {
      const reference = makeFunctionReference(route.name);
      return route.type === "query"
        ? await client.query(reference, args)
        : await client.mutation(reference, args);
    } catch (cause) {
      const message = cause?.data || cause?.message || "The request failed. Please try again.";
      const error = new Error(String(message).replace(/^Uncaught Error:\s*/, ""));
      if (/unauthenticated|not authenticated/i.test(error.message)) error.status = 401;
      throw error;
    }
  };
}
