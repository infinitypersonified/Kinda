import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useConvex } from "convex/react";
import posthog from "posthog-js";
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, CheckSquare2, Clock3, Heart,
  House, LogOut, MessageCircle, MoreHorizontal, Pause, Pencil, Play, Plus,
  Search, Send, Settings, SlidersHorizontal, Sparkles, Target, Trash2, Trophy, UserRound,
  Users, X
} from "lucide-react";
import { createCloudApi } from "./cloudApi.js";

const categories = ["Personal", "Learning", "Building", "Health", "Creative work", "Relationships"];
const pages = [
  { id: "home", label: "Home", icon: House },
  { id: "tasks", label: "My Tasks", icon: CheckSquare2 },
  { id: "circles", label: "Circles", icon: Users },
  { id: "activity", label: "Activity", icon: Heart },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "settings", label: "Settings", icon: Settings }
];
const photoOne = "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1200&q=85";
const photoTwo = "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1000&q=85";

function localDate(value = new Date()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayLabel(value) {
  if (!value) return "No due date";
  const date = new Date(`${value}T12:00:00`);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (localDate(date) === localDate(today)) return "Today";
  if (localDate(date) === localDate(tomorrow)) return "Tomorrow";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function initials(name) {
  return (name || "You").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, totalSeconds);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function dateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function prepareCelebrationSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) throw new Error("this browser does not support audio playback");
  const context = new AudioContext();
  return context.resume().then(() => context);
}

function playCelebrationSound(context) {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((frequency, index) => {
    const start = context.currentTime + index * 0.16;
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(0.13, start + 0.025);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
    oscillator.connect(volume);
    volume.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.56);
  });
  window.setTimeout(() => context.close(), 1100);
}

function App({ authClient }) {
  const convexClient = useConvex();
  const api = useMemo(() => createCloudApi(convexClient), [convexClient]);
  const { data: authSession, isPending: authPending } = authClient.useSession();
  const inviteTokenFromUrl = window.location.pathname.match(/^\/join\/([A-Za-z0-9_-]{32,})\/?$/)?.[1] || "";
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState(inviteTokenFromUrl ? "invite" : window.location.hash === "#login" ? "login" : window.location.hash === "#signup" ? "signup" : "landing");
  const [inviteToken, setInviteToken] = useState(inviteTokenFromUrl);
  const [invitePreview, setInvitePreview] = useState(null);
  const [inviteError, setInviteError] = useState("");
  const [page, setPage] = useState("home");
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [sharedTasks, setSharedTasks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activity, setActivity] = useState([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [profile, setProfile] = useState(null);
  const [taskDialog, setTaskDialog] = useState(null);
  const [friendDialog, setFriendDialog] = useState(false);
  const [circleDialog, setCircleDialog] = useState(false);
  const [inviteLinks, setInviteLinks] = useState({});
  const [profileEditing, setProfileEditing] = useState(false);
  const [chatMobileOpen, setChatMobileOpen] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [filter, setFilter] = useState("Today");
  const [toast, setToast] = useState("");
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [leaderboardGroupId, setLeaderboardGroupId] = useState(null);
  const [tick, setTick] = useState(Date.now());

  const loadWorkspace = useCallback(async () => {
    const [taskData, friendData, groupData] = await Promise.all([
      api("/tasks"), api("/friends"), api("/groups")
    ]);
    setTasks(taskData);
    setFriends(friendData);
    setGroups(groupData);
    setActiveGroup(current => groupData.find(group => group.id === current?.id) || groupData[0] || null);
  }, [api]);

  const loadActivity = useCallback(async () => {
    setActivity(await api("/activity"));
  }, [api]);

  useEffect(() => {
    if (inviteToken) {
      api(`/invites/${inviteToken}`).then(setInvitePreview).catch(error => setInviteError(error.message));
    }
  }, [inviteToken, api]);

  useEffect(() => {
    if (authPending) return;
    const account = authSession?.user;
    if (!account) {
      setUser(null);
      setProfile(null);
      setTasks([]);
      setFriends([]);
      setGroups([]);
      setActiveGroup(null);
      setSharedTasks([]);
      setMessages([]);
      setActivity([]);
      setScreen(current => current === "dashboard" ? "landing" : current);
      setLoading(false);
      return;
    }
    let cancelled = false;
    authClient.convex.token().then(() => api("/me")).then(value => {
      if (!cancelled) {
        setUser(value);
        setProfile(value);
        setScreen("dashboard");
        setLoading(false);
      }
    }).catch(error => {
      if (!cancelled) {
        setLoading(false);
        setScreen("login");
        setToast(`Your cloud session could not be verified: ${error.message}`);
      }
    });
    if (inviteToken) {
      authClient.convex.token().then(() => api(`/invites/${inviteToken}/join`, { method: "POST" })).then(joined => {
        if (cancelled) return;
        setToast(`You joined ${joined.name}.`);
        window.history.replaceState(null, "", "/");
        setInviteToken("");
      }).catch(error => {
        if (!cancelled) setToast(error.message);
      });
    }
    return () => { cancelled = true; };
  }, [authPending, authSession?.user?.id, inviteToken, api, authClient]);

  useEffect(() => {
    if (screen === "invite" || inviteTokenFromUrl) return;
    posthog.capture("$pageview", { page, screen });
  }, [page, screen]);

  useEffect(() => {
    if (!user) return undefined;
    Promise.all([loadWorkspace(), loadActivity()]).catch(error => setToast(error.message));
    const clock = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, [user?.id, loadWorkspace, loadActivity]);

  useEffect(() => {
    if (!user || !activeGroup) {
      setMessages([]);
      setSharedTasks([]);
      return undefined;
    }
    let cancelled = false;
    let newestId = 0;
    let running = false;
    const refresh = async initial => {
      if (running) return;
      running = true;
      try {
        const query = initial ? "" : `?after=${newestId}`;
        const [incoming, visibleTasks, circleData] = await Promise.all([
          api(`/groups/${activeGroup.id}/messages${query}`),
          api(`/groups/${activeGroup.id}/goals`),
          api("/groups")
        ]);
        if (cancelled) return;
        setSharedTasks(visibleTasks);
        setGroups(circleData);
        setActiveGroup(current => {
          const refreshed = circleData.find(group => group.id === activeGroup.id);
          if (!refreshed) return circleData[0] || null;
          const currentMembers = current?.members?.map(member => member.id).join(",");
          const refreshedMembers = refreshed.members.map(member => member.id).join(",");
          if (current?.id === refreshed.id && currentMembers === refreshedMembers
            && current.taskCount === refreshed.taskCount && current.doneCount === refreshed.doneCount) return current;
          return refreshed;
        });
        if (initial) setMessages(incoming);
        else if (incoming.length) setMessages(current => [
          ...current,
          ...incoming.filter(message => !current.some(existing => existing.id === message.id))
        ]);
        if (incoming.length) newestId = incoming[incoming.length - 1].id;
      } catch (error) {
        if (!cancelled) setToast(error.message);
      } finally {
        running = false;
      }
    };
    refresh(true);
    const poll = window.setInterval(() => refresh(false), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [user, activeGroup]);

  useEffect(() => {
    if (page !== "chat" || !chatMobileOpen) return;
    const node = document.querySelector(".chat-messages");
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, page, chatMobileOpen]);

  useEffect(() => {
    if (!user || page !== "circles" || friendSearch.trim().length < 2) {
      setSearchResults([]);
      return undefined;
    }
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      api(`/friends/search?q=${encodeURIComponent(friendSearch.trim())}`)
        .then(results => { if (!cancelled) setSearchResults(results); })
        .catch(error => { if (!cancelled) setToast(error.message); });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [user, page, friendSearch]);

  const doneTasks = tasks.filter(task => task.done);
  const openTasks = tasks.filter(task => !task.done);
  const todayTasks = tasks.filter(task => task.dueDate === localDate());
  const openTodayTasks = todayTasks.filter(task => !task.done);
  const filteredTasks = useMemo(() => {
    if (filter === "Completed") return doneTasks;
    if (filter === "Upcoming") return openTasks.filter(task => task.dueDate && task.dueDate > localDate());
    if (filter === "No date") return openTasks.filter(task => !task.dueDate);
    return todayTasks;
  }, [filter, doneTasks, openTasks, todayTasks]);

  function notify(message) {
    setToast(message);
    window.clearTimeout(notify.timeout);
    notify.timeout = window.setTimeout(() => setToast(""), 3200);
  }

  function navigate(nextPage) {
    setPage(nextPage);
    setChatMobileOpen(false);
    if (nextPage === "activity") loadActivity().catch(error => notify(error.message));
    if (nextPage === "profile") api("/me").then(setProfile).catch(error => notify(error.message));
  }

  async function submitAuth(event) {
    event.preventDefault();
    setAuthError("");
    setAuthBusy(true);
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || "").trim(),
      email: String(form.get("email") || "").trim(),
      password: String(form.get("password") || "")
    };
    try {
      const response = screen === "signup"
        ? await authClient.signUp.email(payload)
        : await authClient.signIn.email({ email: payload.email, password: payload.password });
      if (response.error) throw new Error(response.error.message || "Could not sign in. Please try again.");
      const account = response.data?.user;
      if (!account) throw new Error("Sign-in completed without an account. Please try again.");
      await authClient.convex.token();
      setPage("home");
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    try {
      const response = await authClient.signOut();
      if (response.error) throw new Error(response.error.message || "Could not log out. Please try again.");
      setUser(null);
      setProfile(null);
      setTasks([]);
      setFriends([]);
      setGroups([]);
      setActiveGroup(null);
      setSharedTasks([]);
      setMessages([]);
      setActivity([]);
      setScreen("landing");
      setPage("home");
    } catch (error) {
      notify(error.message);
    }
  }

  async function saveTask(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      title: String(form.get("title") || "").trim(),
      description: String(form.get("description") || "").trim(),
      groupIds: form.getAll("groupIds").map(String),
      dueDate: String(form.get("dueDate") || "") || null,
      priority: String(form.get("priority") || "normal"),
      category: String(form.get("category") || "Personal"),
      visibility: String(form.get("visibility") || "private"),
      targetMinutes: Number(form.get("targetMinutes") || 25)
    };
    try {
      if (taskDialog?.task) {
        const updated = await api(`/tasks/${taskDialog.task.id}`, { method: "PATCH", body: JSON.stringify(body) });
        setTasks(current => current.map(task => task.id === updated.id ? updated : task));
      } else {
        const created = await api("/tasks", { method: "POST", body: JSON.stringify(body) });
        setTasks(current => [created, ...current]);
        loadActivity().catch(error => notify(error.message));
      }
      setTaskDialog(null);
    } catch (error) {
      notify(error.message);
    }
  }

  async function updateTask(task, action, body = {}) {
    const willFinishAllTasks = action === "complete" && body.done && !task.done
      && tasks.length > 0 && tasks.every(item => item.id === task.id || item.done);
    let soundReady = null;
    if (willFinishAllTasks) {
      try {
        soundReady = prepareCelebrationSound();
      } catch (error) {
        notify(`The celebration sound couldn't play: ${error.message}`);
      }
    }
    try {
      const updated = await api(`/tasks/${task.id}/${action}`, { method: "POST", body: JSON.stringify(body) });
      setTasks(current => current.map(item => item.id === task.id ? updated : item));
      if (action === "complete" && updated.done) {
        loadActivity().catch(error => notify(error.message));
        if (willFinishAllTasks) {
          setCelebrationOpen(true);
          if (soundReady) {
            soundReady.then(playCelebrationSound).catch(error => notify(`The celebration sound couldn't play: ${error.message}`));
          }
        }
      }
    } catch (error) {
      if (soundReady) soundReady.then(context => context.close()).catch(() => {});
      notify(error.message);
    }
  }

  async function deleteTask(task) {
    try {
      await api(`/tasks/${task.id}`, { method: "DELETE" });
      setTasks(current => current.filter(item => item.id !== task.id));
      notify("Task deleted.");
    } catch (error) {
      notify(error.message);
    }
  }

  async function addFriend(email) {
    try {
      const added = await api("/friends", { method: "POST", body: JSON.stringify({ email }) });
      await Promise.all([loadWorkspace(), loadActivity()]);
      setSearchResults(current => current.map(person => person.id === added.id ? { ...person, isFriend: true } : person));
      setFriendDialog(false);
      setProfile(null);
      notify(`${added.name} added as a friend. Add them to a circle when you're ready.`);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }

  async function createCircle(name) {
    try {
      const circle = await api("/groups", { method: "POST", body: JSON.stringify({ name }) });
      setGroups(current => [...current, circle]);
      setActiveGroup(circle);
      setCircleDialog(false);
      notify(`${circle.name} created.`);
    } catch (error) {
      notify(error.message);
      throw error;
    }
  }

  async function addCircleMember(group, friend) {
    try {
      await api(`/groups/${group.id}/members`, {
        method: "POST", body: JSON.stringify({ userId: friend.id })
      });
      await loadWorkspace();
      notify(`${friend.name} added to ${group.name}.`);
    } catch (error) {
      notify(error.message);
    }
  }

  async function createInviteLink(group) {
    try {
      const invitation = await api(`/groups/${group.id}/invite`, { method: "POST", body: JSON.stringify({}) });
      const link = `${window.location.origin}/join/${invitation.token}`;
      setInviteLinks(current => ({ ...current, [group.id]: link }));
      notify("Invite link ready. Share it with your people.");
    } catch (error) {
      notify(error.message);
    }
  }

  async function copyInviteLink(group) {
    const link = inviteLinks[group.id];
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      notify("Circle invite link copied.");
    } catch (error) {
      notify(`Couldn't copy the link. Select and copy it manually: ${error.message}`);
    }
  }

  async function openFriend(person) {
    try {
      setProfile(await api(`/friends/${person.id}/profile`));
      setPage("circles");
    } catch (error) {
      notify(error.message);
    }
  }

  async function reactToActivity(item) {
    try {
      const response = await api(`/activity/${item.id}/react`, { method: "POST", body: JSON.stringify({}) });
      setActivity(current => current.map(entry => entry.id === item.id ? { ...entry, ...response } : entry));
    } catch (error) {
      notify(error.message);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const updated = await api("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: String(form.get("name") || "").trim(),
          bio: String(form.get("bio") || "").trim()
        })
      });
      setProfile(updated);
      setUser(updated);
      setProfileEditing(false);
      notify("Profile saved.");
    } catch (error) {
      notify(error.message);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!activeGroup || !newMessage.trim()) return;
    try {
      const message = await api(`/groups/${activeGroup.id}/messages`, {
        method: "POST", body: JSON.stringify({ content: newMessage.trim() })
      });
      setMessages(current => [...current, message]);
      setNewMessage("");
    } catch (error) {
      notify(error.message);
    }
  }

  if (loading) return <div className="loading-screen"><span className="wordmark">kinda<span>.</span></span><p>Getting things ready…</p></div>;
  if (screen === "invite" && !user) return <InviteScreen invitation={invitePreview} error={inviteError} onSignup={() => setScreen("signup")} onLogin={() => setScreen("login")} onHome={() => { setInviteToken(""); setScreen("landing"); window.history.replaceState(null, "", "/"); }} />;
  if (screen === "landing" && !user) return <Landing onStart={() => setScreen("signup")} onLogin={() => setScreen("login")} />;
  if ((screen === "signup" || screen === "login") && !user) {
    return <AuthScreen mode={screen} setMode={setScreen} onSubmit={submitAuth} error={authError} busy={authBusy} inviteName={invitePreview?.name} />;
  }

  const activeTimer = tasks.find(task => task.timerStartedAt && !task.done);
  const activePage = pages.find(item => item.id === page) || pages[0];
  const todayDoneTasks = todayTasks.filter(task => task.done);
  const todayCompletion = todayTasks.length ? Math.round(todayDoneTasks.length / todayTasks.length * 100) : 0;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="wordmark wordmark-button" onClick={() => navigate("home")}>kinda<span>.</span></button>
        <p className="side-label">YOUR SPACE</p>
        <nav className="side-nav" aria-label="Main navigation">
          {pages.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => navigate(id)} title={label}>
            <Icon size={18}/><span>{label}</span>
          </button>)}
        </nav>
        <div className="sidebar-friends"><div className="side-section-heading"><span>YOUR CIRCLES</span><button className="icon-quiet" onClick={() => setCircleDialog(true)} aria-label="Create circle"><Plus size={15}/></button></div>
          {groups.slice(0, 5).map((group, index) => <button className="friend-mini" key={group.id} onClick={() => { setActiveGroup(group); navigate("circles"); }}><Avatar name={group.name} index={index}/><span>{group.name}</span></button>)}
          {!groups.length && <p className="sidebar-empty">Create a circle for your people.</p>}
          <button className="sidebar-add-friend" onClick={() => setCircleDialog(true)}><Plus size={14}/> Create circle</button>
        </div>
        <div className="sidebar-bottom"><div className="profile-mini"><Avatar name={user.name} index={-1}/><button className="profile-name" onClick={() => navigate("profile")}>{user.name}<small>View profile</small></button><button className="icon-quiet signout-icon" onClick={signOut} aria-label="Log out"><LogOut size={15}/></button></div></div>
      </aside>

      <nav className="mobile-nav" aria-label="Mobile navigation">{pages.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? "active" : ""} onClick={() => navigate(id)} aria-label={label}><Icon size={20}/><span>{label}</span></button>)}</nav>

      <section className="main-area">
        {page === "home" && <HomePage
          user={user} tasks={todayTasks} done={todayDoneTasks.length} total={todayTasks.length} completion={todayCompletion}
          remainingTasks={openTasks.length}
          leaderboardGroupId={leaderboardGroupId ?? groups[0]?.id}
          onSelectLeaderboardGroup={setLeaderboardGroupId}
          activity={activity.slice(0, 4)} groups={groups} tick={tick}
          onCreate={() => setTaskDialog({ task: null })} onEdit={task => setTaskDialog({ task })}
          onComplete={(task, done) => updateTask(task, "complete", { done })}
          onTimer={(task, action) => updateTask(task, action)} onReact={reactToActivity}
          onPage={navigate} onCircle={group => { setActiveGroup(group); navigate("circles"); }} onCreateCircle={() => setCircleDialog(true)}
        />}
        {page === "tasks" && <TasksPage
          tasks={filteredTasks} filter={filter} setFilter={setFilter} allCount={tasks.length}
          tick={tick} onCreate={() => setTaskDialog({ task: null })}
          onEdit={task => setTaskDialog({ task })} onComplete={(task, done) => updateTask(task, "complete", { done })}
          onTimer={(task, action) => updateTask(task, action)} onDelete={deleteTask}
        />}
        {page === "circles" && <CirclesPage
          groups={groups} activeGroup={activeGroup} onSelect={setActiveGroup}
          sharedTasks={sharedTasks} friends={friends} query={friendSearch} setQuery={setFriendSearch} results={searchResults}
          inviteLink={activeGroup ? inviteLinks[activeGroup.id] : null}
          profile={profile?.id !== user.id ? profile : null} user={user}
          onAdd={async email => {
            const result = await addFriend(email);
            if (!result.ok) notify(result.message);
          }} onInvite={() => setFriendDialog(true)} onOpen={openFriend}
          onCloseProfile={() => setProfile(null)}
          onCreateCircle={() => setCircleDialog(true)}
          onAddMember={addCircleMember}
          onCreateInvite={createInviteLink}
          onCopyInvite={copyInviteLink}
          onCreateTask={() => setTaskDialog({ task: null, groupIds: activeGroup ? [activeGroup.id] : [] })}
          onOpenChat={() => navigate("chat")}
        />}
        {page === "activity" && <ActivityPage activity={activity} userId={user.id} onReact={reactToActivity}/>}
        {page === "chat" && <ChatPage
          groups={groups} activeGroup={activeGroup} setActiveGroup={group => { setActiveGroup(group); setChatMobileOpen(true); }}
          messages={messages} sharedTasks={sharedTasks} user={user} value={newMessage} setValue={setNewMessage}
          onSend={sendMessage} friends={friends} mobileOpen={chatMobileOpen}
          onMobileBack={() => setChatMobileOpen(false)} onInvite={() => setCircleDialog(true)}
        />}
        {page === "profile" && <ProfilePage
          user={profile || user} tasks={tasks} friends={friends} editing={profileEditing}
          setEditing={setProfileEditing} onSave={saveProfile} onFriend={openFriend}
        />}
        {page === "settings" && <SettingsPage user={user} onSignOut={signOut}/>}
      </section>

      {taskDialog && <TaskDialog task={taskDialog.task} groups={groups} initialGroupIds={taskDialog.groupIds} onClose={() => setTaskDialog(null)} onSave={saveTask}/>}
      {friendDialog && <FriendDialog onClose={() => setFriendDialog(false)} onSubmit={addFriend}/>}
      {circleDialog && <CircleDialog onClose={() => setCircleDialog(false)} onSubmit={createCircle}/>}
      {celebrationOpen && <CelebrationDialog onClose={() => setCelebrationOpen(false)}/>}
      {toast && <div className="toast" role="status"><span className="toast-mark"><Check size={15}/></span>{toast}</div>}
      {activeTimer && <div className="running-timer" aria-live="off"><span className="timer-live-dot"/><Clock3 size={14}/><span>{formatTime(activeTimer.targetMinutes * 60 - activeTimer.elapsedSeconds - Math.max(0, Math.floor((tick - Date.parse(activeTimer.timerStartedAt)) / 1000)))}</span><small>{activeTimer.title}</small></div>}
    </main>
  );
}

function Avatar({ name, index = 0, large = false }) {
  const colors = ["avatar-terracotta", "avatar-sand", "avatar-rose", "avatar-olive"];
  const color = index < 0 ? "avatar-self" : colors[index % colors.length];
  return <span className={`avatar ${color} ${large ? "avatar-large" : ""}`}>{initials(name)}</span>;
}

function GroupLeaderboard({ group, userId, compact = false, onOpen, onSelectGroup, groups = [] }) {
  const members = [...(group.members || [])]
    .sort((left, right) => right.doneCount - left.doneCount || left.name.localeCompare(right.name));
  let currentRank = 0;
  let previousDone = null;
  const allRanked = members.map((member, index) => {
    if (member.doneCount !== previousDone) currentRank = index + 1;
    previousDone = member.doneCount;
    return { ...member, rank: currentRank };
  });
  const ranked = compact ? allRanked.slice(0, 3) : allRanked;

  return <section className={`leaderboard-card ${compact ? "leaderboard-compact" : ""}`}>
    <div className="section-title-row"><div><p className="eyebrow">{compact ? "CIRCLE STANDINGS" : group.name}</p><h2><Trophy size={17}/> Leaderboard</h2></div><div className="leaderboard-actions">{groups.length > 1 && onSelectGroup && <select aria-label="Leaderboard circle" value={group.id} onChange={event => onSelectGroup(event.target.value)}>{groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}{onOpen && <button className="text-link" onClick={onOpen}>{compact ? "Open circle" : "Circle tasks"} <ArrowRight size={14}/></button>}</div></div>
    {ranked.length ? <ol className="leaderboard-list">{ranked.map(member => <li className={`leaderboard-row ${member.rank === 1 ? "leaderboard-first" : ""}`} key={member.id}>
      <span className="leaderboard-rank">{member.rank === 1 ? <Trophy size={15}/> : member.rank === 2 ? <span aria-label="Runner-up">🥈</span> : `#${member.rank}`}</span>
      <Avatar name={member.name}/>
      <span className="leaderboard-person"><b>{member.name}{member.id === userId ? " (you)" : ""}</b><small>{member.id === group.ownerId ? "Circle owner" : member.rank === 1 ? "Leading the way" : member.rank === 2 ? "Runner-up" : "Keep it going"}</small></span>
      <strong>{member.doneCount}<small>/{member.taskCount} done</small></strong>
    </li>)}</ol> : <p className="quiet-empty">Invite people to your circle to start a leaderboard.</p>}
    {members.length > ranked.length && <p className="leaderboard-more">Showing the top {ranked.length} of {members.length} members.</p>}
  </section>;
}

function CelebrationDialog({ onClose }) {
  return <div className="celebration-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="celebration-card" role="dialog" aria-modal="true" aria-labelledby="celebration-title">
      <div className="celebration-confetti" aria-hidden="true">{Array.from({ length: 16 }, (_, index) => <span key={index} style={{ "--confetti-index": index }}/>)}</div>
      <span className="celebration-icon"><Sparkles size={28}/></span>
      <p className="eyebrow">YOU DID IT</p>
      <h2 id="celebration-title">Every task, done.</h2>
      <p>You showed up and finished what you set out to do. Take a moment to celebrate—you earned it.</p>
      <button className="button button-primary" onClick={onClose}>Keep going <ArrowRight size={15}/></button>
    </section>
  </div>;
}

function PageHeader({ eyebrow, title, description, action }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</header>;
}

function HomePage({ user, tasks, done, total, completion, remainingTasks, activity, groups, leaderboardGroupId, onSelectLeaderboardGroup, tick, onCreate, onEdit, onComplete, onTimer, onReact, onPage, onCircle, onCreateCircle }) {
  const activeLeaderboard = groups.find(group => group.id === leaderboardGroupId) || groups[0] || null;
  return <div className="page-content home-page">
    <PageHeader eyebrow={new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase()} title="Home" description={`Good morning, ${user.name.split(/\s+/)[0]}. Here’s today.`} action={<button className="button button-primary" onClick={onCreate}><Plus size={16}/> Create task</button>}/>
    <section className="today-summary" aria-label="Today's task progress"><div><b>Today</b><span>{done} of {total} tasks complete</span></div><div className="summary-progress"><span style={{ width: `${completion}%` }}/></div><strong>{completion}<small>%</small></strong></section>
    {remainingTasks > 0 ? <section className="motivation-card" role="status"><span><Heart size={17}/></span><div><b>One step at a time.</b><p>You’ve got {remainingTasks} {remainingTasks === 1 ? "task" : "tasks"} still on your list. Pick one small next step—progress matters more than perfection.</p></div></section> : total > 0 && <section className="motivation-card motivation-complete" role="status"><span><Check size={17}/></span><div><b>Look at what you’ve done.</b><p>Your tasks for today are complete. Take a breath and feel good about showing up.</p></div></section>}
    <div className="home-grid">
      <section className="home-tasks"><div className="section-title-row"><div><p className="eyebrow">YOUR DAY</p><h2>Tasks for today</h2></div><button className="text-link" onClick={() => onPage("tasks")}>All tasks <ArrowRight size={15}/></button></div>
        {tasks.length ? <div className="task-list">{tasks.slice(0, 7).map(task => <TaskRow key={task.id} task={task} tick={tick} onComplete={done => onComplete(task, done)} onTimer={action => onTimer(task, action)} onEdit={() => onEdit(task)} onDelete={null}/>)}</div> : <EmptyTasks onCreate={onCreate} compact/>}
      </section>
      <aside className="home-social"><section className="home-feed"><div className="section-title-row"><div><p className="eyebrow">AROUND YOU</p><h2>Friends’ activity</h2></div><button className="icon-quiet" onClick={() => onPage("activity")} aria-label="See all activity"><ArrowRight size={16}/></button></div>
        {activity.length ? <ActivityList items={activity} userId={user.id} onReact={onReact} compact/> : <p className="quiet-empty">Friend activity will appear when your friends share a task or finish one.</p>}</section>
        <section className="home-friends"><div className="section-title-row"><div><p className="eyebrow">YOUR PEOPLE</p><h2>Circles</h2></div><button className="icon-quiet" onClick={onCreateCircle} aria-label="Create circle"><Plus size={16}/></button></div>
          {groups.length ? <div className="friend-list">{groups.slice(0, 4).map((group, index) => <button className="friend-card" key={group.id} onClick={() => onCircle(group)}><Avatar name={group.name} index={index}/><span><b>{group.name}</b><small>{group.memberCount} {group.memberCount === 1 ? "member" : "members"} · {group.taskCount} {group.taskCount === 1 ? "task" : "tasks"}</small></span><ArrowRight size={14}/></button>)}</div> : <p className="quiet-empty">Create a circle to share progress with your people. <button onClick={onCreateCircle}>Create a circle</button></p>}
        </section>
        {activeLeaderboard && <GroupLeaderboard group={activeLeaderboard} userId={user.id} onOpen={() => onCircle(activeLeaderboard)} onSelectGroup={onSelectLeaderboardGroup} groups={groups} compact/>}
      </aside>
    </div>
  </div>;
}

function TasksPage({ tasks, filter, setFilter, allCount, tick, onCreate, onEdit, onComplete, onTimer, onDelete }) {
  return <div className="page-content">
    <PageHeader eyebrow="MAKE A LITTLE ROOM FOR WHAT MATTERS" title="My Tasks" description={`${allCount} ${allCount === 1 ? "task" : "tasks"} on your list.`} action={<button className="button button-primary" onClick={onCreate}><Plus size={16}/> Create task</button>}/>
    <div className="task-filters"><SlidersHorizontal size={16}/>{["Today", "Upcoming", "Completed", "No date"].map(item => <button className={filter === item ? "filter-active" : ""} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div>
    {tasks.length ? <section className="task-list task-list-page">{tasks.map(task => <TaskRow key={task.id} task={task} tick={tick} onComplete={done => onComplete(task, done)} onTimer={action => onTimer(task, action)} onEdit={() => onEdit(task)} onDelete={() => onDelete(task)}/>)}</section> : <EmptyTasks onCreate={onCreate} title={filter === "Completed" ? "No completed tasks yet." : filter === "Upcoming" ? "Nothing coming up." : "A clear page."}/>}
  </div>;
}

function TaskRow({ task, tick, onComplete, onTimer, onEdit, onDelete }) {
  const elapsed = task.elapsedSeconds + (task.timerStartedAt ? Math.max(0, Math.floor((tick - Date.parse(task.timerStartedAt)) / 1000)) : 0);
  const remaining = Math.max(0, task.targetMinutes * 60 - elapsed);
  return <article className={`task-row ${task.done ? "task-complete" : ""}`}>
    <button className={`task-check ${task.done ? "checked" : ""}`} aria-label={task.done ? "Reopen task" : "Complete task"} onClick={() => onComplete(!task.done)}>{task.done && <Check size={14}/>}</button>
    <div className="task-main"><div className="task-heading"><h3>{task.title}</h3>{task.priority === "high" && !task.done && <span className="priority-tag">HIGH PRIORITY</span>}{task.groupIds?.length > 0 && <span className="shared-tag">IN A CIRCLE</span>}</div>{task.description && <p className="task-description">{task.description}</p>}
      <div className="task-meta"><span>{task.category}</span><span className="meta-separator">·</span><CalendarDays size={13}/><span>{dayLabel(task.dueDate)}</span>{task.dueDate && <span className="task-date">{task.dueDate}</span>}</div>
      {!task.done && <div className="task-focus"><span className="focus-readout">{formatTime(remaining)}</span>{onTimer && <button className="timer-control" onClick={() => onTimer(task.timerStartedAt ? "stop" : "start")}>{task.timerStartedAt ? <Pause size={12}/> : <Play size={12}/>} {task.timerStartedAt ? "Pause focus" : elapsed ? "Resume focus" : `${task.targetMinutes} min focus`}</button>}</div>}
    </div>
    <div className="task-actions">{onEdit && <button className="icon-quiet task-action" onClick={onEdit} aria-label="Edit task"><Pencil size={14}/></button>}{onDelete && <button className="icon-quiet task-action" onClick={onDelete} aria-label="Delete task"><Trash2 size={14}/></button>}</div>
  </article>;
}

function EmptyTasks({ onCreate, title = "Start with one thing.", compact = false }) {
  return <div className={`empty-tasks ${compact ? "empty-compact" : ""}`}><span className="empty-spark">✳</span><h3>{title}</h3><p>Add a task when you’re ready. You can keep it private or share it with friends.</p><button className="text-link" onClick={onCreate}><Plus size={15}/> Create a task</button></div>;
}

function CirclesPage({ groups, activeGroup, onSelect, sharedTasks, friends, query, setQuery, results, inviteLink, profile, user, onAdd, onInvite, onOpen, onCloseProfile, onCreateCircle, onAddMember, onCreateInvite, onCopyInvite, onCreateTask, onOpenChat }) {
  const memberTaskGroups = (activeGroup?.members || []).map(member => {
    const memberTasks = sharedTasks.filter(task => task.ownerId === member.id);
    const done = memberTasks.filter(task => task.done).length;
    return { member, tasks: memberTasks, done, percent: memberTasks.length ? Math.round(done / memberTasks.length * 100) : 0 };
  });
  if (profile) return <div className="page-content">
    <button className="back-link" onClick={onCloseProfile}><ArrowLeft size={15}/> Circles</button>
    <section className="profile-panel friend-profile-panel"><Avatar name={profile.name} index={1} large/><div className="profile-copy"><p className="eyebrow">YOUR PEOPLE</p><h1>{profile.name}</h1><p>{profile.bio || "Keeping things moving, one task at a time."}</p><small>{profile.friendCount} friends</small></div></section>
    <section className="profile-shared"><div className="section-title-row"><div><p className="eyebrow">LEGACY FRIEND SHARES</p><h2>Tasks</h2></div></div>{profile.tasks?.length ? <div className="task-list">{profile.tasks.map((task, index) => <article className={`shared-task-row ${task.done ? "task-complete" : ""}`} key={`${task.title}-${index}`}><span className={`task-check ${task.done ? "checked" : ""}`}>{task.done && <Check size={14}/>}</span><div><h3>{task.title}</h3><p>{task.category} <span>·</span> {dayLabel(task.dueDate)}{task.done && <b> · Done</b>}</p></div></article>)}</div> : <p className="quiet-empty">No friend-shared tasks. Circle tasks are shared with their members.</p>}</section>
  </div>;
  return <div className="page-content">
    <PageHeader eyebrow="YOUR PEOPLE, YOUR SPACE" title="Circles" description="Create a circle, invite friends, share tasks, and follow progress together." action={<button className="button button-primary" onClick={onCreateCircle}><Plus size={16}/> Create circle</button>}/>
    <label className="search-box"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find someone by name or email" autoComplete="off"/></label>
    {query.trim().length >= 2 && <section className="search-results"><p className="eyebrow">PEOPLE</p>{results.length ? results.map((person, index) => {
      const isMember = activeGroup?.members?.some(member => member.id === person.id);
      return <div className="friend-card search-person" key={person.id}><Avatar name={person.name} index={index}/><button className="friend-person-name" onClick={() => person.isFriend && onOpen(person)}><b>{person.name}</b><small>{person.bio || person.email}</small></button>{person.isFriend ? <button className="button button-secondary small-button" disabled={!activeGroup || isMember || activeGroup.ownerId !== user.id} onClick={() => onAddMember(activeGroup, person)}>{isMember ? "In circle" : "Add to circle"}</button> : <button className="button button-secondary small-button" onClick={() => onAdd(person.email)}>Add friend</button>}</div>;
    }) : <p className="quiet-empty">No accounts match that search yet.</p>}</section>}
    <section className="circles-directory"><div className="section-title-row"><div><p className="eyebrow">YOUR CIRCLES</p><h2>{groups.length ? `${groups.length} ${groups.length === 1 ? "circle" : "circles"}` : "Start a circle"}</h2></div></div>
      {groups.length ? <div className="circles-layout"><div className="circles-list">{groups.map((group, index) => <button className={`circle-tile ${activeGroup?.id === group.id ? "selected" : ""}`} key={group.id} onClick={() => onSelect(group)}><Avatar name={group.name} index={index}/><span><b>{group.name}</b><small>{group.memberCount} {group.memberCount === 1 ? "member" : "members"} · {group.taskCount} {group.taskCount === 1 ? "task" : "tasks"}</small></span><ArrowRight size={15}/></button>)}</div>
        {activeGroup && <section className="circle-detail"><div className="circle-detail-heading"><div><p className="eyebrow">YOUR CIRCLE</p><h2>{activeGroup.name}</h2><p>{activeGroup.memberNames}</p></div><div className="circle-detail-actions"><button className="button button-secondary small-button" onClick={onOpenChat}><MessageCircle size={14}/> Group chat</button><button className="button button-primary small-button" onClick={onCreateTask}><Plus size={14}/> Post a task</button></div></div>
          <div className="circle-progress"><div><b>{sharedTasks.filter(task => task.done).length} of {sharedTasks.length} tasks done</b><span>{sharedTasks.length ? Math.round(sharedTasks.filter(task => task.done).length / sharedTasks.length * 100) : 0}%</span></div><div className="summary-progress"><span style={{ width: `${sharedTasks.length ? sharedTasks.filter(task => task.done).length / sharedTasks.length * 100 : 0}%` }}/></div></div>
          <GroupLeaderboard group={activeGroup} userId={user.id}/>
          <div className="circle-members"><div className="section-title-row"><div><p className="eyebrow">THE PEOPLE</p><h3>Members</h3></div><span>{activeGroup.memberCount}</span></div><div className="circle-member-list">{activeGroup.members?.map((member, index) => <span className="circle-member" key={member.id}><Avatar name={member.name} index={index}/>{member.name}{member.id === activeGroup.ownerId && <small>Owner</small>}</span>)}</div>
            {activeGroup.ownerId === user.id && <div className="circle-invite"><p>Invite existing members directly, or send this link to anyone—even before they create an account.</p><div>{friends.filter(friend => !activeGroup.members?.some(member => member.id === friend.id)).map((friend, index) => <button className="button button-secondary small-button" key={friend.id} onClick={() => onAddMember(activeGroup, friend)}><Plus size={13}/>{friend.name}</button>)}<button className="text-link" onClick={onInvite}><Plus size={14}/> Find people</button><button className="button button-secondary small-button" onClick={() => onCreateInvite(activeGroup)}><Plus size={13}/>{inviteLink ? "Replace invite link" : "Create invite link"}</button></div>{inviteLink && <div className="circle-invite-link"><input aria-label="Circle invite link" readOnly value={inviteLink}/><button className="button button-primary small-button" onClick={() => onCopyInvite(activeGroup)}>Copy link</button></div>}</div>}
          </div>
          <div className="circle-tasks"><div className="section-title-row"><div><p className="eyebrow">SHARED PROGRESS</p><h3>Tasks by member</h3></div><span>{sharedTasks.length}</span></div>{memberTaskGroups.length ? <div className="member-task-groups">{memberTaskGroups.map(({ member, tasks: memberTasks, done, percent }) => <section className="member-task-group" key={member.id}><div className="member-progress-heading"><span><Avatar name={member.name}/><b>{member.name}</b>{member.id === user.id && <small>You</small>}</span><strong>{done}/{memberTasks.length} done · {percent}%</strong></div><div className="summary-progress"><span style={{ width: `${percent}%` }}/></div>{memberTasks.length ? <div className="task-list">{memberTasks.map(task => <article className={`shared-task-row ${task.done ? "task-complete" : ""}`} key={`${task.ownerId}-${task.id}`}><span className={`task-check ${task.done ? "checked" : ""}`}>{task.done && <Check size={14}/>}</span><div><h4>{task.title}</h4><p>{task.category} · {dayLabel(task.dueDate)}{task.done && <b> · Done</b>}</p></div></article>)}</div> : <p className="quiet-empty">No tasks shared by this member yet.</p>}</section>)}</div> : <p className="quiet-empty">No tasks shared here yet. Post one to get started.</p>}</div>
        </section>}
      </div> : <p className="quiet-empty">Create a circle to share tasks and progress with your people.</p>}
    </section>
  </div>;
}

function ActivityPage({ activity, userId, onReact }) {
  return <div className="page-content">
    <PageHeader eyebrow="GOOD THINGS, NOT SCORES" title="Activity" description="A quiet look at what your friends are working on."/>
    {activity.length ? <ActivityList items={activity} userId={userId} onReact={onReact}/> : <div className="page-empty"><Heart size={22}/><h2>Nothing new just yet.</h2><p>When you and your friends share tasks or finish one, you’ll see it here.</p></div>}
  </div>;
}

function ActivityList({ items, userId, onReact, compact = false }) {
  return <div className={`activity-list ${compact ? "activity-list-compact" : ""}`}>{items.map((item, index) => <article className="activity-item" key={item.id}><Avatar name={item.actorName} index={index}/><div className="activity-copy"><p><b>{item.actorId === userId ? "You" : item.actorName}</b> {item.type === "completed" ? "completed" : "added a task"} <strong>{item.taskTitle}</strong></p><small>{dateTime(item.createdAt)}</small></div><button className={`reaction-button ${item.reacted ? "reacted" : ""}`} onClick={() => onReact(item)} aria-label={item.reacted ? "Remove reaction" : "React to activity"}><Heart size={16} fill={item.reacted ? "currentColor" : "none"}/>{item.reactionCount > 0 && <span>{item.reactionCount}</span>}</button></article>)}</div>;
}

function ChatPage({ groups, activeGroup, setActiveGroup, messages, sharedTasks, user, value, setValue, onSend, mobileOpen, onMobileBack, onInvite }) {
  return <div className="page-content chat-page">
    <PageHeader eyebrow="A LITTLE ENCOURAGEMENT" title="Circle chat" description="Every member of a circle shares one group conversation."/>
    <div className={`chat-layout ${mobileOpen ? "chat-open" : ""}`}>
      <aside className="conversation-list"><div className="conversation-heading"><h2>Your circles</h2><button className="icon-quiet" onClick={onInvite} aria-label="Create circle"><Plus size={16}/></button></div>
        {groups.length ? groups.map((group, index) => <button key={group.id} className={`conversation-item ${activeGroup?.id === group.id ? "selected" : ""}`} onClick={() => setActiveGroup(group)}><Avatar name={group.name} index={index}/><span><b>{group.name}</b><small>{group.memberNames}</small></span></button>) : <div className="conversation-empty"><p>Your chats start with a circle.</p><button className="text-link" onClick={onInvite}><Plus size={14}/> Create circle</button></div>}
      </aside>
      <section className="chat-conversation">
        {activeGroup ? <><header className="chat-header"><button className="mobile-back" onClick={onMobileBack} aria-label="Back to circles"><ArrowLeft size={18}/></button><Avatar name={activeGroup.name}/><div><h2>{activeGroup.name}</h2><small>{activeGroup.memberCount} members · one group chat</small></div></header>
          <div className="chat-shared-tasks">{sharedTasks.slice(0, 3).map(task => <span key={`${task.ownerId}-${task.id}`}><CheckSquare2 size={12}/>{task.ownerName}: {task.title}</span>)}</div>
          <div className="chat-messages" aria-live="polite">{messages.length ? messages.map(message => <article className={`chat-message ${message.senderId === user.id ? "chat-mine" : ""}`} key={message.id}><Avatar name={message.senderName}/><div className="message-body"><b>{message.senderId === user.id ? "You" : message.senderName}</b><p>{message.content}</p><small>{dateTime(message.createdAt)}</small></div></article>) : <div className="chat-empty"><MessageCircle size={22}/><h3>A fresh conversation.</h3><p>Say hello, share a little progress, or send some encouragement.</p></div>}</div>
          <form className="chat-compose" onSubmit={onSend}><input value={value} onChange={event => setValue(event.target.value)} placeholder="Write a message…" aria-label="Write a message" maxLength={1000}/><button className="button button-primary" type="submit" disabled={!value.trim()}><Send size={15}/><span>Send</span></button></form>
        </> : <div className="chat-empty chat-no-selection"><MessageCircle size={24}/><h3>Your people are one hello away.</h3><p>Create a circle to give everyone in it one shared conversation.</p><button className="button button-primary" onClick={onInvite}><Plus size={15}/> Create circle</button></div>}
      </section>
    </div>
  </div>;
}

function ProfilePage({ user, tasks, friends, editing, setEditing, onSave, onFriend }) {
  const done = tasks.filter(task => task.done).length;
  return <div className="page-content">
    <PageHeader eyebrow="A LITTLE ABOUT YOU" title="Profile" description="Your details, your way." action={!editing && <button className="button button-secondary" onClick={() => setEditing(true)}><Pencil size={14}/> Edit profile</button>}/>
    <section className="profile-panel"><Avatar name={user.name} index={-1} large/><div className="profile-copy"><h2>{user.name}</h2><p>{user.bio || "A work in progress, task by task."}</p><small>{user.email}</small></div></section>
    {editing && <form className="profile-edit-form" onSubmit={onSave}><label>Display name<input name="name" defaultValue={user.name} required minLength="2" maxLength="60"/></label><label>Short bio<textarea name="bio" defaultValue={user.bio || ""} maxLength="240" rows="3" placeholder="A few words about you"/></label><div><button className="button button-primary" type="submit">Save profile</button><button className="text-link" type="button" onClick={() => setEditing(false)}>Cancel</button></div></form>}
    <section className="profile-progress"><div><p className="eyebrow">YOUR TASKS</p><h2>{done} completed</h2><p>{tasks.length} total · visible only as you choose</p></div><div className="profile-friends"><p className="eyebrow">YOUR PEOPLE</p>{friends.length ? <div className="avatar-stack">{friends.slice(0, 5).map((friend, index) => <button key={friend.id} onClick={() => onFriend(friend)} aria-label={`View ${friend.name}`}><Avatar name={friend.name} index={index}/></button>)}</div> : <span>No people added yet</span>}</div></section>
    <section className="profile-shared"><div className="section-title-row"><div><p className="eyebrow">YOUR SHARED TASKS</p><h2>Tasks in your circles</h2></div></div>{tasks.filter(task => task.groupIds?.length || task.visibility === "friends").length ? <div className="task-list">{tasks.filter(task => task.groupIds?.length || task.visibility === "friends").map(task => <article className={`shared-task-row ${task.done ? "task-complete" : ""}`} key={task.id}><span className={`task-check ${task.done ? "checked" : ""}`}>{task.done && <Check size={14}/>}</span><div><h3>{task.title}</h3><p>{task.category} <span>·</span> {dayLabel(task.dueDate)}</p></div></article>)}</div> : <p className="quiet-empty">You haven’t shared any tasks. Everything else stays private.</p>}</section>
  </div>;
}

function SettingsPage({ user, onSignOut }) {
  return <div className="page-content">
    <PageHeader eyebrow="YOUR SPACE" title="Settings" description="A few useful things about your account."/>
    <section className="settings-section"><p className="eyebrow">ACCOUNT</p><div className="settings-row"><span><b>{user.name}</b><small>{user.email}</small></span><span>Signed in</span></div><div className="settings-row"><span><b>Private tasks</b><small>Only you can see them. Circle-shared tasks are visible to that circle’s members.</small></span><span><Heart size={16}/></span></div></section>
    <section className="settings-section"><p className="eyebrow">DATA</p><p className="settings-copy">Your Kinda data is stored securely in the cloud. Your tasks stay private unless you choose to share them with friends or a circle.</p></section>
    <button className="button button-secondary logout-button" onClick={onSignOut}><LogOut size={15}/> Log out</button>
  </div>;
}

function TaskDialog({ task, groups, initialGroupIds = [], onClose, onSave }) {
  const selectedGroupIds = task?.groupIds || initialGroupIds;
  return <Modal title={task ? "Edit task" : "Create a task"} subtitle={task ? "Make a quick update." : "Keep it simple. You can add details later."} onClose={onClose}><form className="modal-form" onSubmit={onSave}>
    <label>Task<input name="title" autoFocus defaultValue={task?.title || ""} placeholder="What would you like to do?" required maxLength="120"/></label>
    <label>Description <span className="optional-label">Optional</span><textarea name="description" defaultValue={task?.description || task?.note || ""} rows="2" maxLength="500" placeholder="Add a little detail"/></label>
    <div className="form-grid">    <label>Due date<input name="dueDate" type="date" defaultValue={task?.dueDate || ""} /></label><label>Priority<select name="priority" defaultValue={task?.priority || "normal"}><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label></div>
    <div className="form-grid"><label>Category<select name="category" defaultValue={task?.category || "Personal"}>{categories.map(category => <option key={category}>{category}</option>)}</select></label><label>Focus time<select name="targetMinutes" defaultValue={String(task?.targetMinutes || 25)}>{[10, 15, 25, 30, 45, 60, 90].map(minutes => <option key={minutes} value={minutes}>{minutes} min</option>)}</select></label></div>
    {groups.length > 0 && <fieldset className="circle-share-field"><legend>Share with circles <span className="optional-label">Optional</span></legend><p>Only members of selected circles can see this task and its progress.</p>{groups.map(group => <label className="circle-share-option" key={group.id}><input type="checkbox" name="groupIds" value={group.id} defaultChecked={selectedGroupIds.includes(group.id)}/><span><b>{group.name}</b><small>{group.memberCount} {group.memberCount === 1 ? "member" : "members"}</small></span></label>)}</fieldset>}
    <button className="button button-primary full-button" type="submit">{task ? "Save changes" : "Create task"} <ArrowRight size={15}/></button>
  </form></Modal>;
}

function CircleDialog({ onClose, onSubmit }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await onSubmit(String(form.get("name") || "").trim());
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  return <Modal title="Create a circle" subtitle="A shared space for people, tasks, progress, and one group chat." onClose={onClose}><form className="modal-form" onSubmit={submit}><label>Circle name<input name="name" autoFocus placeholder="e.g. Sunday runners" required minLength="2" maxLength="60"/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary full-button" type="submit" disabled={busy}><Users size={15}/>{busy ? "Creating…" : "Create circle"}</button></form></Modal>;
}

function FriendDialog({ onClose, onSubmit }) {
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await onSubmit(String(form.get("email") || "").trim());
      if (!result.ok) setError(result.message);
    } catch (cause) {
      setError(cause.message);
    }
  }
  return <Modal title="Add a friend" subtitle="Find someone who already has a Kinda account." onClose={onClose}><form className="modal-form" onSubmit={submit}><label>Email address<input name="email" type="email" autoFocus placeholder="friend@example.com" required/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary full-button" type="submit"><Users size={15}/> Add friend</button></form></Modal>;
}

function Modal({ title, subtitle, onClose, children }) {
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={title}><button className="modal-close icon-quiet" onClick={onClose} aria-label="Close"><X size={18}/></button><p className="eyebrow">KINDA, TOGETHER</p><h2>{title}</h2><p className="modal-subtitle">{subtitle}</p>{children}</section></div>;
}

function InviteScreen({ invitation, error, onSignup, onLogin, onHome }) {
  return <main className="invite-screen">
    <button className="wordmark wordmark-button" onClick={onHome}>kinda<span>.</span></button>
    <section className="invite-card">
      <span className="invite-icon"><Users size={24}/></span>
      <p className="eyebrow">A PLACE IN THE CIRCLE</p>
      {error ? <><h1>This invite link isn’t available.</h1><p>{error}</p><button className="button button-secondary" onClick={onHome}>Back to Kinda</button></>
        : invitation ? <><h1>Join {invitation.name}.</h1><p>{invitation.ownerName} invited you to share tasks, follow each other’s progress, and chat together. You can create an account now; we’ll add you to this circle automatically.</p><small>{invitation.memberCount} {invitation.memberCount === 1 ? "member" : "members"} so far</small><div className="invite-actions"><button className="button button-primary" onClick={onSignup}>Create an account <ArrowRight size={15}/></button><button className="text-link" onClick={onLogin}>Already have an account? Log in</button></div></>
          : <><h1>Opening your invite…</h1><p>We’re finding your circle.</p></>}
    </section>
  </main>;
}

function Landing({ onStart, onLogin }) {
  return <main className="landing-page">
    <nav className="landing-nav"><button className="wordmark wordmark-button" onClick={onStart}>kinda<span>.</span></button><div className="landing-nav-links"><a href="#why">Why Kinda</a><a href="#how">How it works</a></div><div className="landing-nav-actions"><button className="nav-login" onClick={onLogin}>Log in</button><button className="button button-primary nav-cta" onClick={onStart}>Get started <ArrowRight size={15}/></button></div></nav>
    <section className="landing-hero"><div className="hero-copy"><p className="eyebrow">A SOCIAL SPACE FOR GETTING THINGS DONE</p><h1>Make room for<br/>what <em>moves you.</em></h1><p className="hero-description">Keep track of what matters, find your focus, and grow alongside the people in your corner.</p><div className="hero-actions"><button className="button button-primary" onClick={onStart}>Create your space <ArrowRight size={16}/></button><span>One clear task at a time.</span></div><div className="hero-note"><Sparkles size={15}/> Built for real life, not perfect streaks.</div></div><div className="hero-visual"><div className="hero-photo-main"><img src={photoOne} alt="Friends working side by side on their goals"/><span className="photo-caption">SHOW UP, SIDE BY SIDE</span></div><div className="hero-photo-small"><img src={photoTwo} alt="Friends sharing a meal and celebrating a little progress"/></div><div className="floating-note note-top"><span><CheckSquare2 size={15}/></span><div><b>One thing at a time</b><small>That’s how it adds up.</small></div></div><div className="floating-note note-bottom"><span className="note-check"><Heart size={15}/></span><div><b>Good people, in your corner.</b><small>Progress feels lighter together.</small></div></div></div></section>
    <section className="landing-values" id="why"><p className="eyebrow">MAKE IT YOURS</p><div className="values-grid"><article><span><CheckSquare2 size={19}/></span><h2>Tasks that fit your life.</h2><p>Keep the list clear and choose what you share.</p></article><article><span><Clock3 size={19}/></span><h2>Focus at your own pace.</h2><p>Set a timer that works for the day you’re having.</p></article><article><span><Users size={19}/></span><h2>Circles that get it.</h2><p>Share progress and encouragement, not scoreboards.</p></article></div></section>
    <section className="landing-bottom" id="how"><div><p className="eyebrow">YOUR NEXT STEP CAN BE SMALL</p><h2>Start where you are.<br/><em>Go from there.</em></h2></div><button className="button button-primary" onClick={onStart}>Make your space <ArrowRight size={15}/></button></section>
    <footer className="landing-footer"><span>kinda<span className="footer-period">.</span></span><p>A social space to make things happen.</p><button onClick={onLogin}>Log in</button></footer>
  </main>;
}

function AuthScreen({ mode, setMode, onSubmit, error, busy, inviteName }) {
  const signup = mode === "signup";
  return <main className="auth-screen"><div className="auth-left"><button className="wordmark wordmark-button" onClick={() => setMode("landing")}>kinda<span>.</span></button><div className="auth-photo"><img src={photoOne} alt="Friends working on their goals together"/></div><div className="auth-copy"><p className="eyebrow">A LITTLE MORE TOGETHER</p><h1>Good things<br/>get <em>shared.</em></h1><p>A thoughtful place to keep track of tasks and make room for your people.</p></div><div className="auth-bottom">TASKS, FRIENDS, YOUR OWN PACE.</div></div><div className="auth-right"><form className="auth-form" onSubmit={onSubmit}><p className="eyebrow">{signup ? "START WHERE YOU ARE" : "WELCOME BACK"}</p><h2>{signup ? "Make yourself at home." : "Come on in."}</h2><p className="auth-form-copy">{inviteName ? `${signup ? "Create an account" : "Log in"} to join ${inviteName}.` : signup ? "Start with a fresh page and a little intention." : "Your people and tasks are right here."}</p>{signup && <label>Your name<input name="name" placeholder="How should we call you?" autoComplete="name" minLength="2" maxLength="60" required/></label>}<label>Email address<input type="email" name="email" placeholder="you@example.com" autoComplete="email" maxLength="254" required/></label><label>Password<input type="password" name="password" placeholder="At least 8 characters" minLength="8" maxLength="128" autoComplete={signup ? "new-password" : "current-password"} required/></label>{error && <p className="auth-error" role="alert">{error}</p>}<button className="button button-primary full-button" type="submit" disabled={busy}>{busy ? "One moment…" : signup ? "Create account" : "Log in"} <ArrowRight size={16}/></button><p className="auth-switch">{signup ? "Already have an account?" : "New around here?"} <button type="button" onClick={() => setMode(signup ? "login" : "signup")}>{signup ? "Log in" : "Create an account"}</button></p><p className="auth-privacy"><Heart size={14}/> Your tasks are private unless you choose to share.</p></form></div></main>;
}

export default App;
