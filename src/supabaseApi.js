function parseBody(options) {
  if (!options?.body) return {};
  try {
    return JSON.parse(options.body);
  } catch {
    throw new Error("The request data was invalid. Please try again.");
  }
}

function friendlyError(cause) {
  const message = cause?.message || cause?.error?.message || "The request failed. Please try again.";
  const error = new Error(String(message));
  if (/unauthenticated|not authenticated|jwt|session/i.test(error.message)) error.status = 401;
  return error;
}

export function createSupabaseApi(client) {
  return async function supabaseApi(path, options = {}) {
    const url = new URL(path, window.location.origin);
    const method = options.method || "GET";
    try {
      const invoke = async (query) => {
        const { data, error } = await client.functions.invoke("api", {
          body: {
            path: url.pathname,
            method,
            query,
            body: parseBody(options),
          },
        });
        if (error) {
          const details = await error.context?.json?.().catch(() => null);
          throw friendlyError(details?.error ? new Error(details.error) : error);
        }
        if (data?.error) throw friendlyError(new Error(data.error));
        return data;
      };
      const query = Object.fromEntries(url.searchParams.entries());
      if (method === "GET" && url.pathname === "/tasks") {
        const pageSize = 500;
        const rows = [];
        for (let offset = 0; ; offset += pageSize) {
          const page = await invoke({ ...query, limit: pageSize, offset });
          if (!Array.isArray(page)) return page;
          rows.push(...page);
          if (page.length < pageSize) return rows;
        }
      }
      return await invoke(query);
    } catch (cause) {
      throw friendlyError(cause);
    }
  };
}

const tablesForPath = (path) => {
  if (path === "/tasks" || path.startsWith("/tasks/")) return ["tasks", "circle_tasks"];
  if (path === "/groups") return ["circles", "circle_members", "circle_tasks", "tasks", "profiles"];
  if (path === "/friends" || path.startsWith("/friends")) return ["friendships", "profiles"];
  if (path === "/activity" || path.startsWith("/activity/")) return ["activities", "reactions", "tasks", "profiles"];
  if (path === "/nudges") return ["nudges"];
  if (path === "/streak") return ["tasks"];
  if (path === "/me") return ["profiles"];
  const group = path.match(/^\/groups\/([^/]+)\/(goals|messages|typing|assignments|recap|weekly)/);
  if (!group) return [];
  const [_, circleId, feature] = group;
  if (feature === "messages") return [["messages", `circle_id=eq.${circleId}`]];
  if (feature === "typing") return [["typing", `circle_id=eq.${circleId}`]];
  if (feature === "assignments") return [["assignments", `circle_id=eq.${circleId}`], ["tasks"]];
  if (feature === "goals") return [["circle_tasks", `circle_id=eq.${circleId}`], ["tasks"]];
  return [["tasks"], ["activities"], ["circle_members", `circle_id=eq.${circleId}`]];
};

// Convex query subscriptions currently power multiple UI panels. Refresh the
// matching edge-function query whenever a relevant Postgres change arrives.
export function createSupabaseLive(client, api) {
  return function live(path, onData, onError = () => {}) {
    let stopped = false;
    let pending = false;
    const channelName = `kinda:${crypto.randomUUID()}`;
    const channel = client.channel(channelName);
    const refresh = () => {
      if (stopped || pending) return;
      pending = true;
      window.setTimeout(async () => {
        pending = false;
        if (stopped) return;
        try {
          onData(await api(path));
        } catch (error) {
          onError(friendlyError(error));
        }
      }, 80);
    };
    for (const tableSpec of tablesForPath(new URL(path, window.location.origin).pathname)) {
      const [table, filter] = Array.isArray(tableSpec) ? tableSpec : [tableSpec, undefined];
      channel.on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, refresh);
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") refresh();
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onError(new Error("Live updates could not connect."));
    });
    return () => {
      stopped = true;
      client.removeChannel(channel);
    };
  };
}
