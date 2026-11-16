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
  const cache = new Map();
  const inFlightGets = new Map();
  const cacheTtlMs = 8_000;
  let cacheRevision = 0;

  const invalidateReadCache = () => {
    cache.clear();
    inFlightGets.clear();
  };
  const invalidateCache = () => {
    invalidateReadCache();
    cacheRevision++;
  };

  const api = async function supabaseApi(path, options = {}) {
    const url = new URL(path, window.location.origin);
    const method = options.method || "GET";
    const cacheKey = `${url.pathname}${url.search}`;
    const canCache = method === "GET" && options.cache !== "no-store";

    if (method === "GET") {
      if (canCache) {
        const cached = cache.get(cacheKey); 
        if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.data);
        if (cached) cache.delete(cacheKey);
      }
      const pending = inFlightGets.get(cacheKey);
      if (pending) return structuredClone(await pending);
    } else {
      invalidateCache();
    }

    const requestRevision = cacheRevision;
    const request = (async () => {
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
      let result;
      if (method === "GET" && url.pathname === "/tasks") {
        const pageSize = 500;
        const rows = [];
        for (let offset = 0; ; offset += pageSize) {
          const page = await invoke({ ...query, limit: pageSize, offset });
          if (!Array.isArray(page)) {
            result = page;
            break;
          }
          rows.push(...page);
          if (page.length < pageSize) {
            result = rows;
            break;
          }
        }
      } else {
        result = await invoke(query);
      }
      if (canCache && requestRevision === cacheRevision)
        cache.set(cacheKey, { data: structuredClone(result), expiresAt: Date.now() + cacheTtlMs });
      return result;
    } catch (cause) {
      throw friendlyError(cause);
    } finally {
      if (method === "GET" && inFlightGets.get(cacheKey) === request)
        inFlightGets.delete(cacheKey);
    }
    })();

    if (method === "GET") inFlightGets.set(cacheKey, request);
    return request;
  };

  api.invalidateCache = invalidateCache;
  api.invalidateReadCache = invalidateReadCache;
  api.revision = () => cacheRevision;
  client.auth.onAuthStateChange(() => invalidateCache());
  return api;
}

const tablesForPath = (path, userId, options = {}) => {
  const idsFilter = (column, ids) => {
    const uniqueIds = [...new Set((ids || []).filter(Boolean))];
    return uniqueIds.length ? `${column}=in.(${uniqueIds.join(",")})` : null;
  };
  const audienceIds = [...new Set([userId, ...(options.friendIds || [])].filter(Boolean))];
  const memberIds = [...new Set((options.memberIds || []).filter(Boolean))];
  const circleIds = [...new Set((options.circleIds || []).filter(Boolean))];
  const filtered = (table, column, ids, fallbackColumn = column) => {
    const filter = idsFilter(column, ids);
    return filter ? [table, filter] : userId ? [table, `${fallbackColumn}=eq.${userId}`] : null;
  };
  const tables = [];
  const add = (spec) => {
    if (spec) tables.push(spec);
  };
  if (path === "/tasks" || path.startsWith("/tasks/")) {
    add(filtered("tasks", "user_id", [userId]));
    add(filtered("circle_tasks", "shared_by", [userId]));
    return tables;
  }
  if (path === "/groups") {
    add(filtered("circles", "id", circleIds, "owner_id"));
    if (circleIds.length) add(filtered("circle_members", "circle_id", circleIds));
    if (userId) add(["circle_members", `user_id=eq.${userId}`]);
    add(filtered("circle_tasks", "circle_id", circleIds, "shared_by"));
    add(filtered("tasks", "user_id", memberIds, "user_id"));
    add(filtered("profiles", "id", memberIds, "id"));
    return tables;
  }
  if (path === "/friends" || path.startsWith("/friends")) {
    if (userId) {
      add(["friendships", `user_id=eq.${userId}`]);
      add(["friendships", `friend_id=eq.${userId}`]);
    }
    add(filtered("profiles", "id", options.friendIds, "id"));
    return tables;
  }
  if (path === "/activity" || path.startsWith("/activity/")) {
    add(filtered("activities", "user_id", audienceIds));
    const reactionFilter = idsFilter("activity_id", options.activityIds);
    if (reactionFilter) add(["reactions", reactionFilter]);
    add(filtered("tasks", "user_id", audienceIds));
    add(filtered("profiles", "id", audienceIds, "id"));
    return tables;
  }
  if (path === "/nudges") {
    if (userId) add(["nudges", `to_user_id=eq.${userId}`]);
    return tables;
  }
  if (path === "/streak") {
    add(filtered("tasks", "user_id", [userId]));
    return tables;
  }
  if (path === "/me") {
    add(filtered("profiles", "id", [userId], "id"));
    return tables;
  }
  const group = path.match(/^\/groups\/([^/]+)\/(goals|messages|typing|assignments|recap|weekly)/);
  if (!group) return tables;
  const [_, circleId, feature] = group;
  if (feature === "messages") return [["messages", `circle_id=eq.${circleId}`]];
  if (feature === "typing") return [["typing", `circle_id=eq.${circleId}`]];
  if (feature === "assignments") {
    return [["assignments", `circle_id=eq.${circleId}`], filtered("tasks", "user_id", memberIds)];
  }
  if (feature === "goals") {
    return [
      ["circle_tasks", `circle_id=eq.${circleId}`],
      filtered("tasks", "user_id", memberIds),
    ].filter(Boolean);
  }
  return [
    filtered("tasks", "user_id", memberIds),
    filtered("activities", "user_id", memberIds),
    ["circle_members", `circle_id=eq.${circleId}`],
  ].filter(Boolean);
};

// Refresh the matching edge-function query whenever a relevant Postgres
// change arrives.
export function createSupabaseLive(client, api) {
  return function live(path, onData, onError = () => {}, options = {}) {
    let stopped = false;
    let pendingTimer = null;
    let inFlight = false;
    let changedDuringFetch = false;
    let fallbackTimer = null;
    let channel = null;
    const pathname = new URL(path, window.location.origin).pathname;
    const shouldPoll = pathname === "/tasks" || pathname === "/groups" ||
      /^\/groups\/[^/]+\/goals$/.test(pathname);
    // Chat and typing should feel instant. Everything else waits a moment so a
    // burst of changes causes one reload instead of many.
    const delay = /\/(messages|typing)$/.test(pathname) ? 100 : 1500;
    const refresh = () => {
      if (stopped) return;
      if (inFlight) {
        changedDuringFetch = true;
        return;
      }
      if (pendingTimer !== null) window.clearTimeout(pendingTimer);
      pendingTimer = window.setTimeout(async () => {
        pendingTimer = null;
        if (stopped || inFlight) return;
        inFlight = true;
        try {
          api.invalidateReadCache?.();
          const revision = api.revision?.();
          const data = await api(path, { cache: "no-store" });
          if (revision == null || revision === api.revision?.()) onData(data);
        } catch (error) {
          onError(friendlyError(error));
        } finally {
          inFlight = false;
          if (changedDuringFetch) {
            changedDuringFetch = false;
            refresh();
          }
        }
      }, delay);
    };
    const stopFallback = () => {
      if (fallbackTimer !== null) {
        window.clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    };
    const startFallback = () => {
      if (!shouldPoll || fallbackTimer !== null || stopped) return;
      // Keep tasks and circle views current if a network blocks Realtime sockets.
      // Skip background tabs to avoid spending API quota while the app is unused.
      refresh();
      fallbackTimer = window.setInterval(() => {
        if (document.visibilityState === "visible") refresh();
      }, 60_000);
    };
    const onVisibilityChange = () => {
      if (
        !stopped && document.visibilityState === "visible" &&
        fallbackTimer !== null
      ) refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const connect = (userId) => {
      if (stopped) return;
      channel = client.channel(`kinda:${crypto.randomUUID()}`);
      for (const tableSpec of tablesForPath(pathname, userId, options)) {
        const [table, filter] = tableSpec;
        channel.on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, refresh);
      }
      channel.subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          stopFallback();
          if (options.initialRefresh !== false) refresh();
        }
        if (
          status === "CHANNEL_ERROR" || status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          startFallback();
          const detail = error?.message ? ` (${error.message})` : "";
          onError(
            new Error(
              `Live updates could not connect${detail}. Task and circle data will sync every minute.`,
            ),
          );
        }
      });
    };
    client.auth.getSession()
      .then(({ data }) => connect(data?.session?.user?.id))
      .catch(() => connect(undefined));

    return () => {
      stopped = true;
      stopFallback();
      if (pendingTimer !== null) window.clearTimeout(pendingTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (channel) client.removeChannel(channel);
    };
  };
}
