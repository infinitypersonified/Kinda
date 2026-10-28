import Kindle, { KindleToast, KINDLE_MOODS } from "./Kindle.jsx";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useConvex } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CheckSquare2,
  Clock3,
  Heart,
  Laptop,
  Smartphone,
  Tablet,
  Download,
  Flame,
  House,
  LogOut,
  Menu,
  Minimize2,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  CornerUpLeft,
  Moon,
  Repeat,
  Search,
  Send,
  Settings,
  Share,
  Sun,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  UserRound,
  ChevronDown,
  FileText,
  Flag,
  Shield,
  Smile,
  Users,
  X,
} from "lucide-react";
import { createCloudApi, createCloudLive } from "./cloudApi.js";
import { createSupabaseApi, createSupabaseLive } from "./supabaseApi.js";
import { createSupabaseAuthClient } from "./supabaseAuth.js";
import { capturePageview } from "./analytics.js";
import { shareProgressCard, socialShareUrl } from "./share.js";
import { emojiGroups } from "./emoji.js";

const WeeklyPage = React.lazy(() =>
  import("./weekly.jsx").then((module) => ({ default: module.WeeklyPage })),
);
const CircleWeeklyPanel = React.lazy(() =>
  import("./weekly.jsx").then((module) => ({ default: module.CircleWeeklyPanel })),
);

const ClockContext = createContext(Date.now());

function ClockProvider({ children }) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <ClockContext.Provider value={tick}>{children}</ClockContext.Provider>;
}

function useClock() {
  return useContext(ClockContext);
}

const categories = [
  "Personal",
  "Work",
  "Learning",
  "Building",
  "Creative work",
  "Spiritual",
  "Health",
  "Fitness",
  "Relationships",
  "Family",
  "Finance",
  "Home & errands",
  "Self-care",
  "Community",
];
// A request can reach the server a moment before the login session is applied to the connection. That is not a real
// error, so these are retried quietly instead of being shown to the person using the app.
function isAuthError(error) {
  return (
    error?.status === 401 ||
    /unauthenticated|not authenticated/i.test(error?.message || "")
  );
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be full or blocked */
  }
}

function clearSavedData(userId) {
  try {
    localStorage.removeItem("kinda:boot");
    if (userId) localStorage.removeItem(`kinda:data:${userId}`);
  } catch {
    /* ignore */
  }
}

// The days an unfinished task has been moved away from, so past weekly reports stay honest.
function movedFromFor(task, newDate) {
  const list = task.movedFrom || [];
  if (
    task.done ||
    !task.dueDate ||
    task.dueDate === newDate ||
    list.includes(task.dueDate)
  )
    return list;
  return [...list, task.dueDate];
}

function useStableCallback(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args) => ref.current(...args), []);
}

function categorySlug(name) {
  return String(name || "other")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const pages = [
  { id: "home", label: "Home", icon: House },
  { id: "tasks", label: "My Tasks", icon: CheckSquare2 },
  { id: "circles", label: "Circles", icon: Users },
  { id: "activity", label: "Activity", icon: Heart },
  { id: "weekly", label: "Weekly", icon: BarChart3 },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "settings", label: "Settings", icon: Settings },
];
const avatarColorKeys = [
  "terracotta",
  "sand",
  "rose",
  "olive",
  "sky",
  "plum",
  "teal",
  "gold",
];
const avatarEmojis = [
  "🦊",
  "🐼",
  "🐯",
  "🦁",
  "🐸",
  "🐙",
  "🦄",
  "🐉",
  "🐧",
  "🦉",
  "🐢",
  "🐨",
  "🐰",
  "🐻",
  "🦋",
  "🐬",
  "👻",
  "👽",
  "🤖",
  "🌙",
  "⭐",
  "🔥",
  "🌸",
  "🍄",
];
const photoOne =
  "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1200&q=85";
const photoTwo =
  "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1000&q=85";

function localDate(value = new Date()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// A task belongs to the day it is due, or the day it was created when it has no due date.
function taskDay(task) {
  return task.dueDate || localDate(task.createdAt || Date.now());
}

function dayLabel(value) {
  if (!value) return "No due date";
  const date = new Date(`${value}T12:00:00`);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (localDate(date) === localDate(today)) return "Today";
  if (localDate(date) === localDate(tomorrow)) return "Tomorrow";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function initials(name) {
  return (name || "You")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, totalSeconds);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function dateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function prepareCelebrationSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext)
    throw new Error("this browser does not support audio playback");
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

const WHATS_NEW_VERSION = "2026-10-17";
const whatsNew = [
  [
    "📣",
    "Assign a task to the whole circle",
    "Circle owners can give everyone the same task and see who has finished it.",
  ],
  [
    "🔥",
    "Streaks need 5 tasks + 80%",
    "Plan at least 5 tasks and finish at least 80% of them for the day to count.",
  ],
  [
    "😊",
    "Emojis in chat",
    "Tap the smiley beside the message box to add emojis, with your recent ones saved.",
  ],
  [
    "🏷️",
    "More categories",
    "Spiritual, Work, Fitness, Finance, Family, Self-care and more.",
  ],
  [
    "⚡",
    "Instant updates",
    "Adding, completing and moving tasks now respond immediately.",
  ],
  [
    "🎨",
    "A calmer, cleaner look",
    "Simpler lists, a dedicated focus mode and clearer navigation.",
  ],
];

const pushSupported =
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY);
const googleSignInEnabled = true;

function urlBase64ToUint8Array(base64) {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(window.atob(padded), (char) => char.charCodeAt(0));
}

function subscriptionBody(subscription) {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh || "",
    auth: json.keys?.auth || "",
  };
}

const accents = [
  ["terracotta", "Terracotta", "#c25a2c"],
  ["plum", "Plum", "#8447a0"],
  ["teal", "Teal", "#25796f"],
  ["sky", "Sky", "#2f6fae"],
  ["olive", "Olive", "#66782c"],
  ["rose", "Rose", "#c24468"],
];

function formatMinutes(total) {
  const minutes = Math.max(0, Math.round(Number(total) || 0));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12
    ? "Good morning"
    : hour < 18
      ? "Good afternoon"
      : "Good evening";
}

function dueLabel(task, nowMs) {
  const today = localDate();
  const day = taskDay(task);
  if (task.done) return { text: dayLabel(task.dueDate), tone: "" };
  const gap = Math.round((Date.parse(day) - Date.parse(today)) / 86400000);
  if (gap < 0) return { text: `Overdue · ${-gap}d`, tone: "late" };
  if (gap === 0) {
    if (task.reminderTime) {
      const [hours, minutes] = task.reminderTime.split(":").map(Number);
      const now = new Date(nowMs);
      const diff =
        hours * 60 + minutes - (now.getHours() * 60 + now.getMinutes());
      if (diff > 0)
        return {
          text:
            diff < 60
              ? `In ${diff}m`
              : `In ${Math.floor(diff / 60)}h${diff % 60 ? ` ${diff % 60}m` : ""}`,
          tone: diff < 60 ? "soon" : "",
        };
      return { text: `Was due ${task.reminderTime}`, tone: "late" };
    }
    return { text: "Today", tone: "" };
  }
  return { text: gap === 1 ? "Tomorrow" : `In ${gap} days`, tone: "" };
}

function CountUp({ value }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return undefined;
    const startedAt = performance.now();
    let frame;
    const step = (now) => {
      const progress = Math.min(1, (now - startedAt) / 650);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown}</>;
}

function ProgressRing({ percent, size = 76, stroke = 7, children }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className="progress-ring" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <circle
          className="ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={
            circumference * (1 - Math.min(100, Math.max(0, percent)) / 100)
          }
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring-label">{children}</span>
    </span>
  );
}

function SkeletonList({ rows = 3 }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <span className="skeleton skeleton-dot" />
          <div>
            <span className="skeleton skeleton-line" />
            <span className="skeleton skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FocusTimeField({ defaultValue = 25 }) {
  const [minutes, setMinutes] = useState(String(defaultValue));
  const value = Number(minutes);
  return (
    <div className="focus-time-field">
      <label>
        Focus time{" "}
        <span className="optional-label">
          {value > 0 ? formatMinutes(value) : "Enter minutes"}
        </span>
        <input
          name="targetMinutes"
          type="number"
          inputMode="numeric"
          min="1"
          max="1440"
          step="1"
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          required
        />
      </label>
      <div className="chip-row">
        {[15, 25, 45, 60, 90, 120].map((preset) => (
          <button
            type="button"
            key={preset}
            className={`chip ${value === preset ? "selected" : ""}`}
            onClick={() => setMinutes(String(preset))}
          >
            {formatMinutes(preset)}
          </button>
        ))}
      </div>
    </div>
  );
}

function renderMessageContent(text, members, userId) {
  const names = members
    .filter((member) => member.name)
    .map((member) => member.name)
    .sort((a, b) => b.length - a.length);
  if (!names.length || !text.includes("@")) return text;
  const pattern = new RegExp(
    `(@(?:${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`,
    "g",
  );
  return text.split(pattern).map((part, index) => {
    if (!part.startsWith("@")) return part;
    const member = members.find((item) => `@${item.name}` === part);
    return (
      <span
        key={index}
        className={`mention ${member?.id === userId ? "mention-me" : ""}`}
      >
        {part}
      </span>
    );
  });
}

function InAppBanner({ banner, onOpen, onClose }) {
  return (
    <div className="in-app-banner" role="status" key={banner.id}>
      <button className="banner-main" onClick={onOpen}>
        {banner.avatarName ? (
          <Avatar name={banner.avatarName} avatar={banner.avatar} />
        ) : (
          <span className="banner-icon">
            <Bell size={15} />
          </span>
        )}
        <span>
          <b>{banner.title}</b>
          <small>{banner.body}</small>
        </span>
      </button>
      <button
        className="icon-quiet"
        onClick={onClose}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="confirm-body">{children}</div>
      <div className="reminder-actions">
        <button
          className={`button button-secondary ${danger ? "danger-button" : ""}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button className="button button-primary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function OnboardingCard({ steps, onDismiss }) {
  const doneCount = steps.filter((step) => step.done).length;
  return (
    <section className="onboarding-card" aria-label="Getting started">
      <div className="onboarding-head">
        <div>
          <p className="eyebrow">GETTING STARTED</p>
          <b>
            {doneCount} of {steps.length} done
          </b>
        </div>
        <button
          className="icon-quiet"
          onClick={onDismiss}
          aria-label="Hide getting started"
        >
          <X size={15} />
        </button>
      </div>
      <div className="summary-progress">
        <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      {steps.map((step) => (
        <div
          className={`onboarding-step ${step.done ? "done" : ""}`}
          key={step.id}
        >
          <span className="onboarding-check">
            {step.done && <Check size={12} />}
          </span>
          <span>{step.label}</span>
          {!step.done && (
            <button className="text-link" onClick={step.action}>
              {step.cta}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

function FocusMode({ task, onClose, onToggle, onDone, onExtend }) {
  const tick = useClock();
  const elapsed =
    task.elapsedSeconds +
    (task.timerStartedAt
      ? Math.max(0, Math.floor((tick - Date.parse(task.timerStartedAt)) / 1000))
      : 0);
  const total = task.targetMinutes * 60;
  const remaining = Math.max(0, total - elapsed);
  const running = Boolean(task.timerStartedAt);
  const chimed = useRef(false);
  useEffect(() => {
    if (remaining === 0 && !chimed.current) {
      chimed.current = true;
      playChime();
    }
    if (remaining > 0) chimed.current = false;
  }, [remaining]);
  const percent = total ? Math.min(100, (elapsed / total) * 100) : 0;
  return (
    <div
      className={`focus-mode ${running ? "running" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Focus mode"
    >
      <button
        className="focus-minimize icon-quiet"
        onClick={onClose}
        aria-label="Minimize focus mode"
      >
        <Minimize2 size={18} />
      </button>
      <p className="eyebrow">
        {remaining === 0 ? "TIME’S UP" : running ? "FOCUSING" : "PAUSED"}
      </p>
      <ProgressRing percent={percent} size={280} stroke={9}>
        <span className="focus-time">{formatTime(remaining)}</span>
        <small>{formatMinutes(task.targetMinutes)} session</small>
      </ProgressRing>
      <h2>{task.title}</h2>
      <div className="focus-actions">
        {remaining > 0 && (
          <button className="button button-primary" onClick={onToggle}>
            {running ? (
              <>
                <Pause size={15} /> Pause
              </>
            ) : (
              <>
                <Play size={15} /> Resume
              </>
            )}
          </button>
        )}
        <button className="button button-secondary" onClick={() => onExtend(5)}>
          <Plus size={15} /> 5 min
        </button>
        <button className="button button-secondary" onClick={onDone}>
          <Check size={15} /> Done
        </button>
      </div>
    </div>
  );
}

let chimeContext = null;
function audioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  chimeContext = chimeContext || new AudioCtx();
  return chimeContext;
}

function playChime() {
  try {
    const context = audioContext();
    if (!context) return;
    if (context.state === "suspended") context.resume().catch(() => {});
    const start = context.currentTime + 0.02;
    [
      [880, 0],
      [1318.5, 0.2],
      [1760, 0.4],
    ].forEach(([frequency, offset]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.22, start + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 1.1);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 1.2);
    });
  } catch {
    /* sound is a nicety, never block the reminder */
  }
}

function ReminderDialog({ reminder, onDismiss, onDone }) {
  return (
    <Modal
      title="Reminder"
      subtitle={
        reminder.reminderTime ? `Set for ${reminder.reminderTime}` : "It’s time"
      }
      onClose={onDismiss}
    >
      <div className="reminder-body">
        <span className="reminder-bell">
          <Bell size={22} />
        </span>
        <h3>{reminder.title}</h3>
        {reminder.description && <p>{reminder.description}</p>}
      </div>
      <div className="reminder-actions">
        <button className="button button-primary" onClick={onDone}>
          <Check size={15} /> Mark done
        </button>
        <button className="button button-secondary" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </Modal>
  );
}

function KindaLoader({ message = "Getting things ready…" }) {
  return (
    <div className="kinda-loader" role="status" aria-label="Loading Kinda">
      <div className="kinda-loader-word" aria-hidden="true">
        {"kinda".split("").map((letter, index) => (
          <i key={index} style={{ "--i": index }}>
            {letter}
          </i>
        ))}
        <i className="kinda-loader-dot" style={{ "--i": 5 }}>
          .
        </i>
      </div>
      {message && <p>{message}</p>}
    </div>
  );
}

function useInstall() {
  const [deferred, setDeferred] = useState(
    () => window.__kindaInstallPrompt || null,
  );
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const onReady = () => setDeferred(window.__kindaInstallPrompt || null);
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("kinda:install", onReady);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("kinda:install", onReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const userAgent = navigator.userAgent;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  const isIOS =
    /iphone|ipad|ipod/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const iosSafari = isIOS && !/crios|fxios|edgios/i.test(userAgent);
  async function install() {
    if (!deferred) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    window.__kindaInstallPrompt = null;
    setDeferred(null);
  }
  return {
    canPrompt: Boolean(deferred),
    install,
    standalone: standalone || installed,
    isIOS,
    iosSafari,
  };
}

function InstallCard({ variant = "banner" }) {
  const { canPrompt, install, standalone, isIOS, iosSafari } = useInstall();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return (
        Date.now() -
          Number(localStorage.getItem("kinda:install-dismissed") || 0) <
        7 * 24 * 60 * 60 * 1000
      );
    } catch {
      return false;
    }
  });
  const instructions = isIOS ? (
    iosSafari ? (
      <>
        Tap <Share size={13} /> Share, then <b>Add to Home Screen</b>.
      </>
    ) : (
      <>
        Open this page in <b>Safari</b>, then tap Share and{" "}
        <b>Add to Home Screen</b>.
      </>
    )
  ) : (
    "Open your browser menu and choose Install app or Add to Home Screen."
  );
  if (variant === "row") {
    return (
      <div className="settings-row">
        <span>
          <b>Install Kinda</b>
          <small>
            {standalone
              ? "Kinda is installed on this device."
              : canPrompt
                ? "Add Kinda to your home screen for a full-screen app."
                : instructions}
          </small>
        </span>
        {standalone ? (
          <span>Installed</span>
        ) : (
          canPrompt && (
            <button
              className="button button-secondary small-button"
              onClick={install}
            >
              <Download size={13} /> Install
            </button>
          )
        )}
      </div>
    );
  }
  if (standalone || dismissed || (!canPrompt && !isIOS)) return null;
  return (
    <section className="install-card" role="region" aria-label="Install Kinda">
      <span className="install-icon">
        <Download size={17} />
      </span>
      <div>
        <b>Get Kinda on your phone</b>
        <p>
          {canPrompt
            ? "Install it for a full-screen app, faster loading and notifications."
            : instructions}
        </p>
      </div>
      {canPrompt && (
        <button
          className="button button-primary small-button"
          onClick={install}
        >
          Install
        </button>
      )}
      <button
        className="icon-quiet"
        aria-label="Dismiss"
        onClick={() => {
          try {
            localStorage.setItem("kinda:install-dismissed", String(Date.now()));
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
      >
        <X size={15} />
      </button>
    </section>
  );
}

function WhatsNewDialog({ onClose }) {
  return (
    <Modal
      title="What’s new in Kinda"
      subtitle="A few things we’ve added for you."
      onClose={onClose}
    >
      <ul className="whats-new-list">
        {whatsNew.map(([icon, title, text]) => (
          <li key={title}>
            <span aria-hidden="true">{icon}</span>
            <div>
              <b>{title}</b>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ul>
      <button className="button button-primary full-button" onClick={onClose}>
        Got it <ArrowRight size={15} />
      </button>
    </Modal>
  );
}

function WorkspaceApp({ authClient, backendClient, backend }) {
  const convexClient = backendClient;
  const api = useMemo(() => {
    const base = backend === "supabase"
      ? createSupabaseApi(convexClient)
      : createCloudApi(convexClient);
    return async (path, options) => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await base(path, options);
        } catch (error) {
          if (!isAuthError(error) || attempt >= 3) throw error;
          try {
            await authClient.convex.token();
          } catch {
            /* try again anyway */
          }
          await new Promise((resolve) =>
            window.setTimeout(resolve, [350, 900, 1800][attempt]),
          );
        }
      }
    };
  }, [convexClient, authClient, backend]);
  const live = useMemo(
    () => backend === "supabase"
      ? createSupabaseLive(convexClient, api)
      : createCloudLive(convexClient),
    [convexClient, backend, api],
  );
  const { data: authSession, isPending: authPending } = authClient.useSession();
  const inviteTokenFromUrl =
    window.location.pathname.match(/^\/join\/([A-Za-z0-9_-]{32,})\/?$/)?.[1] ||
    "";
  const cachedBoot = useMemo(() => {
    if (
      inviteTokenFromUrl ||
      /reset-password|[?&]token=/.test(
        window.location.pathname + window.location.search,
      )
    )
      return null;
    const saved = readJson("kinda:boot");
    return saved?.user?.id ? saved : null;
  }, []);
  const bootVerified = useRef(!cachedBoot);
  const [user, setUser] = useState(cachedBoot?.user || null);
  const [screen, setScreen] = useState(
    cachedBoot
      ? "dashboard"
      : inviteTokenFromUrl
        ? "invite"
        : window.location.pathname.includes("reset-password") ||
            new URLSearchParams(window.location.search).has("reset-password") ||
            new URLSearchParams(window.location.search).has("token")
          ? "reset"
          : window.location.hash === "#login"
            ? "login"
            : window.location.hash === "#signup"
              ? "signup"
              : "landing",
  );
  const [inviteToken, setInviteToken] = useState(inviteTokenFromUrl);
  const [invitePreview, setInvitePreview] = useState(null);
  const [inviteError, setInviteError] = useState("");
  const [page, setPage] = useState("home");
  const [loading, setLoading] = useState(!cachedBoot);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [tasks, setTasks] = useState([]);
  const serverTasksRef = useRef([]);
  const opsRef = useRef([]);
  const opCounter = useRef(0);
  // Server data plus any changes that are still on their way. Pending changes are re-applied on top of every
  // live update, so a task never flickers back to its old state while a request is in flight.
  const renderTasks = useCallback(() => {
    let list = serverTasksRef.current;
    for (const op of opsRef.current) {
      if (op.type === "patch")
        list = list.map((task) =>
          task.id === op.taskId ? { ...task, ...op.patch } : task,
        );
      else if (op.type === "remove")
        list = list.filter((task) => task.id !== op.taskId);
      else if (
        op.type === "create" &&
        !list.some(
          (task) =>
            task.title === op.task.title &&
            Math.abs(task.createdAt - op.task.createdAt) < 8000,
        )
      )
        list = [op.task, ...list];
    }
    setTasks(list);
  }, []);
  const applyServerTasks = useCallback(
    (data) => {
      serverTasksRef.current = data;
      renderTasks();
    },
    [renderTasks],
  );
  const stageOp = useCallback(
    (op) => {
      op.id = ++opCounter.current;
      opsRef.current = [...opsRef.current, op];
      renderTasks();
      return op.id;
    },
    [renderTasks],
  );
  const settleOps = useCallback(
    (ids, serverTask, removedId) => {
      opsRef.current = opsRef.current.filter((op) => !ids.includes(op.id));
      if (serverTask)
        serverTasksRef.current = serverTasksRef.current.some(
          (task) => task.id === serverTask.id,
        )
          ? serverTasksRef.current.map((task) =>
              task.id === serverTask.id ? serverTask : task,
            )
          : [serverTask, ...serverTasksRef.current];
      if (removedId)
        serverTasksRef.current = serverTasksRef.current.filter(
          (task) => task.id !== removedId,
        );
      renderTasks();
    },
    [renderTasks],
  );
  const resetTasks = useCallback(() => {
    serverTasksRef.current = [];
    opsRef.current = [];
    setTasks([]);
  }, []);
  const refreshTasks = useCallback(async () => {
    const latest = await api("/tasks");
    applyServerTasks(latest);
    setTasksLoaded(true);
    return latest;
  }, [api, applyServerTasks]);
  const [assignments, setAssignments] = useState([]);
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState(null);
  const completeTask = useStableCallback((task, done) =>
    updateTask(task, "complete", { done }),
  );
  const editTask = useStableCallback((task) => setTaskDialog({ task }));
  const timerTask = useStableCallback((task, action) =>
    handleTimer(task, action),
  );
  const removeTask = useStableCallback((task) => deleteTask(task));
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [messagesByGroup, setMessagesByGroup] = useState({});
  const [goalsByGroup, setGoalsByGroup] = useState({});
  const [typingByGroup, setTypingByGroup] = useState({});
  const [nudges, setNudges] = useState([]);
  const [streak, setStreak] = useState(null);
  const [recap, setRecap] = useState(null);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [chatDivider, setChatDivider] = useState(null);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("kinda:theme") || "system";
    } catch {
      return "system";
    }
  });
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification === "undefined"
      ? "unsupported"
      : Notification.permission,
  );
  const typingSentRef = useRef(0);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [reminderQueue, setReminderQueue] = useState([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [weeklyGroup, setWeeklyGroup] = useState(null);
  const [justDoneId, setJustDoneId] = useState(null);
  const [focusTaskId, setFocusTaskId] = useState(null);
  const [banner, setBanner] = useState(null);
  const [leaveTarget, setLeaveTarget] = useState(null);
  const [onboardingHidden, setOnboardingHidden] = useState(() => {
    try {
      return localStorage.getItem("kinda:onboarding-dismissed") === "1";
    } catch {
      return false;
    }
  });
  const [accent, setAccent] = useState(() => {
    try {
      return localStorage.getItem("kinda:accent") || "terracotta";
    } catch {
      return "terracotta";
    }
  });
  const bannerSeen = useRef({});
  const nudgeSeenId = useRef(null);
  const [pushOn, setPushOn] = useState(false);
  const [activity, setActivity] = useState([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [profile, setProfile] = useState(cachedBoot?.user || null);
  const [taskDialog, setTaskDialog] = useState(null);
  const [friendDialog, setFriendDialog] = useState(false);
  const [circleDialog, setCircleDialog] = useState(false);
  const [inviteLinks, setInviteLinks] = useState({});
  const [profileEditing, setProfileEditing] = useState(false);
  const [chatMobileOpen, setChatMobileOpen] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const sendingMessageRef = useRef(false);
  const [filter, setFilter] = useState("Today");
  const [toast, setToast] = useState("");
  const [celebrationType, setCelebrationType] = useState(null);
  const [kindleToast, setKindleToast] = useState(null);
  const seenDoneRef = useRef(null);
  const [leaderboardGroupId, setLeaderboardGroupId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [seen, setSeen] = useState({ chat: {}, activity: null, shared: null });
  const messages = messagesByGroup[activeGroup?.id] || [];
  const sharedTasks = goalsByGroup[activeGroup?.id] || [];
  const incoming = useMemo(() => {
    const chat = {};
    const shared = [];
    Object.entries(messagesByGroup).forEach(([id, list]) => {
      chat[id] = list
        .filter((message) => message.senderId !== user?.id)
        .map((message) => message.createdAt);
    });
    Object.entries(goalsByGroup).forEach(([id, list]) =>
      list.forEach((task) => {
        if (task.ownerId !== user?.id) shared.push(`${id}:${task.id}`);
      }),
    );
    return { chat, shared };
  }, [messagesByGroup, goalsByGroup, user?.id]);

  const loadWorkspace = useCallback(async () => {
    const taskRequest = api("/tasks").then((taskData) => {
      applyServerTasks(taskData);
      setTasksLoaded(true);
    });
    const friendRequest = api("/friends").then((friendData) => {
      setFriends(friendData);
      setFriendsLoaded(true);
    });
    const groupRequest = api("/groups").then((groupData) => {
      setGroups(groupData);
      setGroupsLoaded(true);
      setActiveGroup((current) =>
        groupData.find((group) => group.id === current?.id) ||
        groupData[0] ||
        null,
      );
    });
    await Promise.all([taskRequest, friendRequest, groupRequest]);
  }, [api, applyServerTasks]);

  const loadActivity = useCallback(async () => {
    setActivity(await api("/activity"));
    setActivityLoaded(true);
  }, [api]);

  const syncCircleTask = useCallback((task, remove = false) => {
    if (!task?.id) return;
    const circleIds = remove || !Array.isArray(task.groupIds)
      ? []
      : [...new Set(task.groupIds.map(String))];
    const circleTask = {
      id: task.id,
      ownerId: task.ownerId || user?.id,
      ownerName: task.ownerName || profile?.name || "Member",
      title: task.title,
      category: task.category,
      dueDate: task.dueDate || null,
      createdAt: task.createdAt || Date.now(),
      done: Boolean(task.done),
    };
    setGoalsByGroup((current) => {
      const next = { ...current };
      const allCircleIds = new Set([...Object.keys(current), ...circleIds]);
      for (const circleId of allCircleIds) {
        const list = current[circleId] || [];
        if (!circleIds.includes(circleId)) {
          if (list.some((item) => item.id === task.id)) {
            next[circleId] = list.filter((item) => item.id !== task.id);
          }
          continue;
        }
        const previous = list.find((item) => item.id === task.id);
        const updated = {
          ...previous,
          ...circleTask,
          ownerName: task.ownerName || previous?.ownerName || circleTask.ownerName,
        };
        next[circleId] = [...list.filter((item) => item.id !== task.id), updated]
          .sort((left, right) => right.createdAt - left.createdAt);
      }
      return next;
    });
  }, [profile?.name, user?.id]);

  const refreshCircleGoals = useCallback(async (circleIds) => {
    const ids = [...new Set((circleIds || []).map(String))];
    const results = await Promise.all(ids.map(async (id) => [
      id,
      await api(`/groups/${id}/goals`),
    ]));
    setGoalsByGroup((current) => ({
      ...current,
      ...Object.fromEntries(results),
    }));
  }, [api]);

  useEffect(() => {
    if (
      !user || authPending || !authSession?.user ||
      authSession.user.id !== user.id
    ) return undefined;
    let cancelled = false;
    Promise.all([loadWorkspace(), loadActivity()]).catch((error) => {
      if (!cancelled && !isAuthError(error)) setToast(error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, authPending, authSession?.user?.id, loadWorkspace, loadActivity]);

  useEffect(() => {
    if (inviteToken) {
      api(`/invites/${inviteToken}`)
        .then(setInvitePreview)
        .catch((error) => setInviteError(error.message));
    }
  }, [inviteToken, api]);

  useEffect(() => {
    if (authPending) return;
    const account = authSession?.user;
    if (!account) {
      if (user && bootVerified.current) {
        setLoading(false);
        return;
      }
      clearSavedData(user?.id);
      setUser(null);
      setProfile(null);
      resetTasks();
      setFriends([]);
      setGroups([]);
      setActiveGroup(null);
      setMessagesByGroup({});
      setGoalsByGroup({});
      setTypingByGroup({});
      setNudges([]);
      setStreak(null);
      setActivityLoaded(false);
      setActivity([]);
      setScreen((current) => (current === "dashboard" ? "landing" : current));
      setLoading(false);
      return;
    }
    let cancelled = false;
    authClient.convex
      .token()
      .then(() => api("/me"))
      .then((value) => {
        if (!cancelled) {
          bootVerified.current = true;
          writeJson("kinda:boot", { user: value });
          setUser(value);
          setProfile(value);
          const recoveringPassword = new URLSearchParams(window.location.search).has("reset-password")
            || new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
          setScreen(recoveringPassword ? "reset" : "dashboard");
          setLoading(false);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        if (isAuthError(error)) {
          // The server still rejects the session after several tries, so it has really expired.
          clearSavedData(user?.id);
          setUser(null);
          setProfile(null);
          setScreen("login");
          setLoading(false);
          return;
        }
        setLoading(false);
        if (!user) setScreen("login");
        setToast(`Your cloud session could not be verified: ${error.message}`);
      });
    if (inviteToken) {
      authClient.convex
        .token()
        .then(() => api(`/invites/${inviteToken}/join`, { method: "POST" }))
        .then((joined) => {
          if (cancelled) return;
          setToast(`You joined ${joined.name}.`);
          window.history.replaceState(null, "", "/");
          setInviteToken("");
        })
        .catch((error) => {
          if (!cancelled && !isAuthError(error)) setToast(error.message);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [authPending, authSession?.user?.id, inviteToken, api, authClient]);

  useEffect(() => {
    if (user && bootVerified.current) writeJson("kinda:boot", { user });
  }, [user]);

  useEffect(() => {
    if (screen === "invite" || inviteTokenFromUrl) return;
    capturePageview({ page, screen }).catch(() => {});
  }, [page, screen]);

  useEffect(() => {
    setTasksLoaded(false);
    setGroupsLoaded(false);
    setFriendsLoaded(false);
    if (!user) return;
    const saved = readJson(`kinda:data:${user.id}`);
    if (!saved) return;
    applyServerTasks(saved.tasks || []);
    setTasksLoaded(true);
    setGroups(saved.groups || []);
    setActiveGroup(saved.groups?.[0] || null);
    setGroupsLoaded(true);
    setFriends(saved.friends || []);
    setFriendsLoaded(true);
    setActivity(saved.activity || []);
    setActivityLoaded(true);
    // Streak values are server-derived. Do not briefly restore a stale cached count
    // after a shared reset while the live Convex query is connecting.
    setStreak(null);
    setNudges(saved.nudges || []);
  }, [user?.id]);

  useEffect(() => {
    if (!user || authPending || !authSession?.user) return undefined;
    let cancelled = false;
    let unsubs = [];
    let errorShown = false;
    const onError = (error) => {
      if (isAuthError(error)) return;
      if (!errorShown) {
        errorShown = true;
        setToast(error.message);
      }
    };
    const memberKey = (group) =>
      group.members
        .map((member) => member.id + member.avatar + (member.role || ""))
        .join(",");
    const subscribe = () => [
      live(
        "/tasks",
        (data) => {
          applyServerTasks(data);
          setTasksLoaded(true);
        },
        onError,
        { initialRefresh: false },
      ),
      live(
        "/friends",
        (data) => {
          setFriends(data);
          setFriendsLoaded(true);
        },
        onError,
        { initialRefresh: false },
      ),
      live(
        "/groups",
        (groupData) => {
          setGroups(groupData);
          setGroupsLoaded(true);
          setActiveGroup((current) => {
            const refreshed = groupData.find(
              (group) => group.id === current?.id,
            );
            if (!refreshed) return groupData[0] || null;
            if (
              memberKey(current) === memberKey(refreshed) &&
              current.name === refreshed.name &&
              current.taskCount === refreshed.taskCount &&
              current.doneCount === refreshed.doneCount &&
              current.myRole === refreshed.myRole
            )
              return current;
            return refreshed;
          });
        },
        onError,
        { initialRefresh: false },
      ),
      live(
        "/activity",
        (data) => {
          setActivity(data);
          setActivityLoaded(true);
        },
        onError,
        { initialRefresh: false },
      ),
      live("/nudges", setNudges, onError),
      live(`/streak?tz=${new Date().getTimezoneOffset()}`, setStreak, onError),
    ];
    authClient.convex
      .token()
      .catch(() => {})
      .then(() => {
        if (!cancelled) unsubs = subscribe();
      });
    return () => {
      cancelled = true;
      unsubs.forEach((stop) => stop());
    };
  }, [user?.id, live, authPending, authSession?.user?.id]);

  useEffect(() => {
    if (!user || !tasksLoaded) return undefined;
    const timer = window.setTimeout(() => {
      writeJson(`kinda:data:${user.id}`, {
        savedAt: Date.now(),
        tasks: serverTasksRef.current.slice(0, 400),
        groups,
        friends,
        activity: activity.slice(0, 30),
        streak,
        nudges: nudges.slice(0, 10),
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [user?.id, tasks, groups, friends, activity, streak, nudges, tasksLoaded]);

  const groupIds = groups.map((group) => group.id).join(",");
  useEffect(() => {
    if (!user || !groupIds) {
      setMessagesByGroup({});
      setGoalsByGroup({});
      return undefined;
    }
    const unsubs = groupIds.split(",").flatMap((id) => [
      live(
        `/groups/${id}/messages`,
        (data) => setMessagesByGroup((current) => ({ ...current, [id]: data })),
        () => {},
      ),
      live(
        `/groups/${id}/goals`,
        (data) => setGoalsByGroup((current) => ({ ...current, [id]: data })),
        () => {},
      ),
    ]);
    return () => unsubs.forEach((stop) => stop());
  }, [user?.id, groupIds, live]);

  useEffect(() => {
    if (!user?.id) {
      seenDoneRef.current = null;
      return;
    }
    const previous = seenDoneRef.current;
    const next = {};
    let fresh = null;
    for (const [groupId, list] of Object.entries(goalsByGroup)) {
      const items = Array.isArray(list) ? list : [];
      next[groupId] = new Set(items.filter((item) => item.done).map((item) => item.id));
      if (previous && previous[groupId] && !fresh) {
        fresh = items.find(
          (item) => item.done && item.ownerId !== user.id && !previous[groupId].has(item.id),
        );
      }
    }
    seenDoneRef.current = next;
    if (fresh) {
      const name = String(fresh.ownerName || "Someone").split(" ")[0];
      setKindleToast({ key: Date.now(), mood: "cheer", text: `${name} just finished one!` });
    }
  }, [goalsByGroup, user?.id]);

  useEffect(() => {
    if (!user || !activeGroup) return undefined;
    const id = activeGroup.id;
    return live(
      `/groups/${id}/typing`,
      (data) =>
        setTypingByGroup((current) => {
          const previous = current[id] || [];
          return {
            ...current,
            [id]: data.map((row) => {
              const old = previous.find(
                (item) =>
                  item.userId === row.userId &&
                  item.updatedAt === row.updatedAt,
              );
              return { ...row, receivedAt: old ? old.receivedAt : Date.now() };
            }),
          };
        }),
      () => {},
    );
  }, [user?.id, activeGroup?.id, live]);

  useEffect(() => {
    if (!user || page !== "circles" || !activeGroup) {
      setAssignments([]);
      return undefined;
    }
    setAssignments([]);
    return live(
      `/groups/${activeGroup.id}/assignments`,
      setAssignments,
      () => {},
    );
  }, [user?.id, page, activeGroup?.id, live]);

  useEffect(() => {
    if (!user || page !== "circles" || !activeGroup) {
      setRecap(null);
      return undefined;
    }
    setRecap(null);
    return live(`/groups/${activeGroup.id}/recap`, setRecap, () => {});
  }, [user?.id, page, activeGroup?.id, live]);

  // ---- Notification badges ----
  useEffect(() => {
    if (!user) {
      setSeen({ chat: {}, activity: null, shared: null });
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(`kinda:seen:${user.id}`));
      setSeen(
        saved
          ? {
              chat: saved.chat || {},
              activity: saved.activity ?? null,
              shared: saved.shared ?? null,
            }
          : { chat: {}, activity: null, shared: null },
      );
    } catch {
      /* ignore */
    }
  }, [user?.id]);

  useEffect(() => {
    if (user)
      try {
        localStorage.setItem(`kinda:seen:${user.id}`, JSON.stringify(seen));
      } catch {
        /* ignore */
      }
  }, [seen, user?.id]);

  useEffect(() => {
    if (!user) return;
    setSeen((current) => {
      const next = { ...current, chat: { ...current.chat } };
      let changed = false;
      Object.entries(incoming.chat).forEach(([id, times]) => {
        if (next.chat[id] === undefined) {
          next.chat[id] = times[times.length - 1] || "";
          changed = true;
        }
      });
      if (
        next.shared === null &&
        groups.length &&
        Object.keys(goalsByGroup).length >= groups.length
      ) {
        next.shared = incoming.shared;
        changed = true;
      }
      if (next.activity === null && activityLoaded) {
        next.activity = activity[0]?.createdAt || "";
        changed = true;
      }
      return changed ? next : current;
    });
  }, [
    incoming,
    groups.length,
    goalsByGroup,
    activity,
    activityLoaded,
    user?.id,
  ]);

  const seenRef = useRef(seen);
  seenRef.current = seen;
  useEffect(() => {
    if (page !== "chat" || !activeGroup) return;
    setChatDivider({
      groupId: activeGroup.id,
      time: seenRef.current.chat[activeGroup.id] ?? null,
    });
  }, [page, activeGroup?.id, chatMobileOpen]);

  useEffect(() => {
    if (!user) return;
    if (page === "activity" && nudges.some((item) => !item.seen))
      api("/nudges/seen", { method: "POST", body: "{}" }).catch(() => {});
    if (page === "activity" && activity[0]) {
      setSeen((current) =>
        current.activity === activity[0].createdAt
          ? current
          : { ...current, activity: activity[0].createdAt },
      );
    }
    if (page === "circles" && incoming.shared.length) {
      setSeen((current) =>
        (current.shared || []).join("|") === incoming.shared.join("|")
          ? current
          : { ...current, shared: incoming.shared },
      );
    }
    if (
      page === "chat" &&
      activeGroup &&
      (chatMobileOpen || !window.matchMedia("(max-width: 780px)").matches)
    ) {
      const fromOthers = messages
        .filter((message) => message.senderId !== user.id)
        .map((message) => message.createdAt);
      const latest = [...(incoming.chat[activeGroup.id] || []), ...fromOthers]
        .sort()
        .pop();
      if (latest)
        setSeen((current) =>
          (current.chat[activeGroup.id] || "") >= latest
            ? current
            : {
                ...current,
                chat: { ...current.chat, [activeGroup.id]: latest },
              },
        );
    }
  }, [
    page,
    activity,
    nudges,
    incoming,
    messages,
    activeGroup?.id,
    chatMobileOpen,
    user?.id,
  ]);

  useEffect(() => {
    if (!user || page !== "circles" || friendSearch.trim().length < 2) {
      setSearchResults([]);
      return undefined;
    }
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      api(`/friends/search?q=${encodeURIComponent(friendSearch.trim())}`)
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .catch((error) => {
          if (!cancelled && !isAuthError(error)) setToast(error.message);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [user, page, friendSearch]);

  const badges = {
    chat: Object.entries(incoming.chat).reduce(
      (total, [id, times]) =>
        total +
        times.filter((time) => time > (seen.chat[id] ?? "\uffff")).length,
      0,
    ),
    activity:
      (seen.activity === null || !user
        ? 0
        : activity.filter(
            (item) =>
              item.actorId !== user.id && item.createdAt > seen.activity,
          ).length) + nudges.filter((item) => !item.seen).length,
    circles:
      seen.shared === null
        ? 0
        : incoming.shared.filter((key) => !seen.shared.includes(key)).length,
    // Only what is still open for today. Counting every overdue task ever made
    // inflated this number with old and repeating tasks.
    tasks: tasks.filter(
      (task) => !task.done && taskDay(task) === localDate(),
    ).length,
  };
  const totalBadges = badges.chat + badges.activity + badges.circles;
  const doneTasks = tasks.filter((task) => task.done);
  const openTasks = tasks.filter((task) => !task.done);
  const todayKey = localDate();
  const todayTasks = tasks.filter((task) => taskDay(task) === todayKey);
  const recentPastDayKeys = Array.from({ length: 3 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - index - 1);
    return localDate(date);
  });
  const recentPastTasks = tasks.filter((task) =>
    [taskDay(task), ...(task.movedFrom || [])].some((day) => recentPastDayKeys.includes(day)),
  );
  const olderOpenTasks = tasks.filter(
    (task) => !task.done && taskDay(task) < recentPastDayKeys[recentPastDayKeys.length - 1],
  );
  const sharedTasksToday = sharedTasks.filter(
    (task) => taskDay(task) === todayKey,
  );
  const viewGroups = groups.map((group) => {
    const list = goalsByGroup[group.id] || [];
    const todays = list.filter((task) => taskDay(task) === todayKey);
    return {
      ...group,
      taskCount: todays.length,
      doneCount: todays.filter((task) => task.done).length,
      members: group.members.map((member) => {
        const mine = todays.filter((task) => task.ownerId === member.id);
        return {
          ...member,
          taskCount: mine.length,
          doneCount: mine.filter((task) => task.done).length,
        };
      }),
    };
  });
  const onboardingSteps = [
    {
      id: "task",
      label: "Add your first task",
      cta: "Add task",
      done: tasks.length > 0,
      action: () => setTaskDialog({ task: null }),
    },
    {
      id: "circle",
      label: "Create a circle for your people",
      cta: "Create",
      done: groups.length > 0,
      action: () => setCircleDialog(true),
    },
    {
      id: "invite",
      label: "Invite a friend to a circle",
      cta: "Invite",
      done: groups.some((group) => group.memberCount > 1) || friends.length > 0,
      action: () => navigate("circles"),
    },
    {
      id: "avatar",
      label: "Pick your avatar",
      cta: "Choose",
      done: Boolean(user?.avatar),
      action: () => navigate("profile"),
    },
  ];
  const focusTask = tasks.find((task) => task.id === focusTaskId && !task.done);
  const viewActiveGroup =
    viewGroups.find((group) => group.id === activeGroup?.id) || activeGroup;
  const openTodayTasks = todayTasks.filter((task) => !task.done);
  const filteredTasks = useMemo(() => {
    if (filter === "Completed") return doneTasks;
    if (filter === "Earlier") return olderOpenTasks;
    if (filter === "Upcoming")
      return openTasks.filter(
        (task) => task.dueDate && task.dueDate > localDate(),
      );
    if (filter === "No date") return openTasks.filter((task) => !task.dueDate);
    return todayTasks;
  }, [filter, doneTasks, openTasks, todayTasks, olderOpenTasks]);

  useEffect(() => {
    document.title =
      user && totalBadges > 0
        ? `(${totalBadges}) Kinda — grow together`
        : "Kinda — grow together";
  }, [totalBadges, user?.id]);

  const previousAlerts = useRef({ chat: 0, nudges: 0 });
  useEffect(() => {
    const unseenNudges = nudges.filter((item) => !item.seen).length;
    const growing =
      badges.chat > previousAlerts.current.chat ||
      unseenNudges > previousAlerts.current.nudges;
    previousAlerts.current = { chat: badges.chat, nudges: unseenNudges };
    if (growing && user && document.hidden && notifPermission === "granted") {
      try {
        new Notification("Kinda", {
          body: unseenNudges
            ? "Someone sent you a nudge."
            : "You have new messages in your circles.",
          icon: "/icon-192.png",
        });
      } catch {
        /* ignore */
      }
    }
  }, [badges.chat, nudges, notifPermission, user?.id]);

  useEffect(() => {
    const unlock = () => {
      try {
        const context = audioContext();
        if (context && context.state === "suspended") context.resume();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const check = () => {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      tasks.forEach((task) => {
        if (task.done || !task.reminderTime || task.dueDate !== localDate())
          return;
        const [hours, minutes] = task.reminderTime.split(":").map(Number);
        const late = nowMinutes - (hours * 60 + minutes);
        if (late < 0 || late > 180) return;
        const key = `kinda:reminded:${task.id}:${task.dueDate}:${task.reminderTime}`;
        try {
          if (localStorage.getItem(key)) return;
          localStorage.setItem(key, "1");
        } catch {
          return;
        }
        setReminderQueue((queue) =>
          queue.some((item) => item.id === task.id) ? queue : [...queue, task],
        );
        playChime();
      });
    };
    check();
    const timer = window.setInterval(check, 15000);
    return () => window.clearInterval(timer);
  }, [user?.id, tasks]);

  useEffect(() => {
    const root = document.documentElement;
    if (accent && accent !== "terracotta")
      root.setAttribute("data-accent", accent);
    else root.removeAttribute("data-accent");
    try {
      localStorage.setItem("kinda:accent", accent);
    } catch {
      /* ignore */
    }
  }, [accent]);

  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    try {
      if (user && totalBadges > 0) navigator.setAppBadge(totalBadges);
      else navigator.clearAppBadge();
    } catch {
      /* app badges are optional */
    }
  }, [totalBadges, user?.id]);

  useEffect(() => {
    if (!user) return;
    Object.entries(messagesByGroup).forEach(([groupId, list]) => {
      const last = list[list.length - 1];
      if (bannerSeen.current[groupId] === undefined) {
        bannerSeen.current[groupId] = last?.id ?? null;
        return;
      }
      if (!last || last.id === bannerSeen.current[groupId]) return;
      bannerSeen.current[groupId] = last.id;
      if (last.senderId === user.id) return;
      const viewing =
        page === "chat" &&
        activeGroup?.id === groupId &&
        (chatMobileOpen || !window.matchMedia("(max-width: 780px)").matches);
      if (viewing || document.hidden) return;
      const group = groups.find((item) => item.id === groupId);
      const mentioned = (last.mentions || []).includes(user.id);
      setBanner({
        id: last.id,
        kind: "chat",
        groupId,
        avatarName: last.senderName,
        avatar: last.senderAvatar,
        title: `${mentioned ? "Mentioned by " : ""}${last.senderName} · ${group?.name || "Circle"}`,
        body: last.content,
      });
    });
  }, [messagesByGroup]);

  useEffect(() => {
    if (!user) return;
    const latest = nudges[0];
    if (!latest) return;
    if (nudgeSeenId.current === null) {
      nudgeSeenId.current = latest.id;
      return;
    }
    if (latest.id === nudgeSeenId.current) return;
    nudgeSeenId.current = latest.id;
    if (!document.hidden && !latest.seen)
      setBanner({
        id: latest.id,
        kind: "nudge",
        avatarName: latest.fromName,
        avatar: latest.fromAvatar,
        title: `${latest.fromName} nudged you`,
        body: latest.taskTitle,
      });
  }, [nudges]);

  useEffect(() => {
    if (!banner) return undefined;
    const timer = window.setTimeout(() => setBanner(null), 6500);
    return () => window.clearTimeout(timer);
  }, [banner?.id]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light" || theme === "dark")
      root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
    try {
      localStorage.setItem("kinda:theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    if (!user) return;
    try {
      if (localStorage.getItem("kinda:whatsnew") !== WHATS_NEW_VERSION)
        setShowWhatsNew(true);
    } catch {
      /* ignore */
    }
  }, [user?.id]);

  function closeWhatsNew() {
    setShowWhatsNew(false);
    try {
      localStorage.setItem("kinda:whatsnew", WHATS_NEW_VERSION);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!user || !pushSupported) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        setPushOn(Boolean(subscription));
        if (subscription && Notification.permission === "granted") {
          api("/push/subscribe", {
            method: "POST",
            body: JSON.stringify(subscriptionBody(subscription)),
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }, [user?.id]);

  async function enablePush() {
    try {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      if (permission !== "granted") {
        notify(
          "Notifications are blocked. Allow them in your browser settings.",
        );
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            import.meta.env.VITE_VAPID_PUBLIC_KEY,
          ),
        }));
      await api("/push/subscribe", {
        method: "POST",
        body: JSON.stringify(subscriptionBody(subscription)),
      });
      setPushOn(true);
      notify("Push notifications are on.");
    } catch (error) {
      notify(error.message || "Couldn't turn on push notifications.");
    }
  }

  async function disablePush() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api("/push/unsubscribe", {
          method: "POST",
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setPushOn(false);
      notify("Push notifications are off.");
    } catch (error) {
      notify(error.message || "Couldn't turn off push notifications.");
    }
  }

  async function dropPushOnServer() {
    if (!pushSupported) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription)
      await api("/push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
  }

  function notify(message) {
    if (/unauthenticated|not authenticated/i.test(String(message))) return;
    setToast(message);
    window.clearTimeout(notify.timeout);
    notify.timeout = window.setTimeout(() => setToast(""), 3200);
  }

  function navigate(nextPage) {
    setPage(nextPage);
    setMenuOpen(false);
    setChatMobileOpen(false);
    if (nextPage === "activity")
      loadActivity().catch((error) => notify(error.message));
    if (nextPage === "profile")
      api("/me")
        .then(setProfile)
        .catch((error) => notify(error.message));
  }

  async function submitAuth(event) {
    event.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    const name = String(form.get("name") || "").trim();

    try {
      if (screen === "forgot") {
        const response = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/?reset-password=1`,
        });
        if (response.error)
          throw new Error(
            response.error.message || "Could not request a password reset.",
          );
        setAuthNotice(
          "If an account exists for that email, a password reset link will arrive shortly.",
        );
        return;
      }

      if (screen === "reset") {
        if (password.length < 8)
          throw new Error("Your password must be at least 8 characters.");
        if (password !== confirmPassword)
          throw new Error("The passwords do not match.");
        const url = new URL(window.location.href);
        const token =
          url.searchParams.get("token") ||
          url.pathname.match(/\/reset-password\/([^/]+)/)?.[1] ||
          "";
        const supabaseRecovery = new URLSearchParams(url.hash.slice(1)).get("type") === "recovery";
        if (!token && !supabaseRecovery)
          throw new Error(
            "This reset link is missing its token. Request a new password reset link.",
          );
        const response = await authClient.resetPassword({
          newPassword: password,
          token,
        });
        if (response.error)
          throw new Error(
            response.error.message || "Could not reset your password.",
          );
        window.history.replaceState(null, "", "/");
        setAuthNotice(
          "Your password has been reset. Log in with your new password.",
        );
        setScreen("login");
        return;
      }

      const payload = { name, email, password };
      const response =
        screen === "signup"
          ? await authClient.signUp.email(payload)
          : await authClient.signIn.email({ email, password });
      if (response.error)
        throw new Error(
          response.error.message || "Could not sign in. Please try again.",
        );
      const account = response.data?.user;
      if (!account)
        throw new Error(
          "Sign-in completed without an account. Please try again.",
        );
      if (backend === "supabase" && screen === "signup" && !response.data?.session) {
        setAuthNotice("Check your email to confirm your account, then log in.");
        setScreen("login");
        return;
      }
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
      await dropPushOnServer().catch(() => {});
      const response = await authClient.signOut();
      if (response.error)
        throw new Error(
          response.error.message || "Could not log out. Please try again.",
        );
      clearSavedData(user?.id);
      setUser(null);
      setProfile(null);
      resetTasks();
      setFriends([]);
      setGroups([]);
      setActiveGroup(null);
      setMessagesByGroup({});
      setGoalsByGroup({});
      setTypingByGroup({});
      setNudges([]);
      setStreak(null);
      setActivityLoaded(false);
      setActivity([]);
      setScreen("landing");
      setPage("home");
    } catch (error) {
      notify(error.message);
    }
  }

  async function submitGoogleAuth() {
    setAuthError("");
    setAuthBusy(true);
    try {
      const response = await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.href,
      });
      if (response.error)
        throw new Error(
          response.error.message || "Could not sign in with Google.",
        );
    } catch (error) {
      setAuthError(error.message || "Could not sign in with Google.");
      setAuthBusy(false);
    }
  }

  async function saveTask(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      title: String(form.get("title") || "").trim(),
      description: String(form.get("description") || "").trim(),
      groupIds: form.getAll("groupIds").map(String),
      sharedWith: form.getAll("sharedWith").map(String),
      dueDate: String(form.get("dueDate") || "") || null,
      priority: String(form.get("priority") || "normal"),
      category: String(form.get("category") || "Personal"),
      visibility: String(
        form.get("visibility") ||
          (form.getAll("sharedWith").length
            ? "friends"
            : taskDialog?.task?.sharedWith?.length
              ? "private"
              : taskDialog?.task?.visibility || "private"),
      ),
      targetMinutes: Math.min(
        1440,
        Math.max(1, Math.round(Number(form.get("targetMinutes")) || 25)),
      ),
      repeat: String(form.get("repeat") || "none"),
      reminderTime: String(form.get("reminderTime") || ""),
      tzOffset: new Date().getTimezoneOffset(),
    };
    if (!body.sharedWith.length) delete body.sharedWith;
    if (!body.title || body.title.length > 120) {
      notify("Task titles must be 1–120 characters.");
      return;
    }
    const editing = taskDialog?.task;
    setTaskDialog(null);
    if (editing) {
      const { tzOffset, ...rest } = body;
      const patch = { ...rest, movedFrom: movedFromFor(editing, rest.dueDate) };
      const optimistic = { ...editing, ...patch };
      const affectedCircleIds = [
        ...(editing.groupIds || []),
        ...(optimistic.groupIds || []),
      ];
      const opId = stageOp({ type: "patch", taskId: editing.id, patch });
      syncCircleTask(optimistic);
      try {
        const updated = await api(`/tasks/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        settleOps([opId], updated);
        syncCircleTask(updated);
        refreshTasks().catch((error) => notify(error.message));
      } catch (error) {
        settleOps([opId]);
        syncCircleTask(editing);
        refreshTasks().catch(() => {});
        refreshCircleGoals(affectedCircleIds).catch(() => {});
        notify(error.message);
      }
      return;
    }
    const { tzOffset, ...fields } = body;
    const draft = {
      id: `tmp-${Date.now()}`,
      ...fields,
      elapsedSeconds: 0,
      timerStartedAt: null,
      done: false,
      createdAt: Date.now(),
      assignmentId: null,
      assignedByName: null,
    };
    const opId = stageOp({ type: "create", task: draft });
    syncCircleTask(draft);
    try {
      const created = await api("/tasks", {
        method: "POST",
        body: JSON.stringify(body),
      });
      settleOps([opId], created);
      syncCircleTask(draft, true);
      syncCircleTask(created);
      refreshTasks().catch((error) => notify(error.message));
      if (body.visibility === "friends")
        loadActivity().catch((error) => notify(error.message));
    } catch (error) {
      settleOps([opId]);
      syncCircleTask(draft, true);
      refreshTasks().catch(() => {});
      refreshCircleGoals(draft.groupIds).catch(() => {});
      notify(error.message);
    }
  }

  async function updateTask(task, action, body = {}) {
    const now = Date.now();
    const previousStreak = Number(streak?.current) || 0;
    const sharedGroupIds = task.groupIds || [];
    const leadsGroup = (group) => {
      const members = group?.members || [];
      const me = members.find((member) => member.id === user.id);
      return Boolean(
        me &&
        me.doneCount > 0 &&
        members.every(
          (member) => member.id === user.id || me.doneCount > member.doneCount,
        ),
      );
    };
    const openTodayAfter = tasks.filter(
      (item) => item.id !== task.id && !item.done && taskDay(item) === localDate(),
    ).length;
    const wasLeading = sharedGroupIds.some((groupId) =>
      leadsGroup(groups.find((group) => group.id === groupId)),
    );
    const elapsedNow = task.timerStartedAt
      ? Math.max(0, Math.floor((now - Date.parse(task.timerStartedAt)) / 1000))
      : 0;
    let patch = {};
    if (action === "complete") {
      patch = {
        done: Boolean(body.done),
        elapsedSeconds: task.elapsedSeconds + elapsedNow,
        timerStartedAt: null,
      };
      if (body.done && !task.done) {
        setJustDoneId(task.id);
        window.setTimeout(
          () =>
            setJustDoneId((current) => (current === task.id ? null : current)),
          1100,
        );
      }
    } else if (action === "start") {
      patch = {
        timerStartedAt: task.timerStartedAt || new Date(now).toISOString(),
      };
    } else if (action === "stop") {
      patch = {
        elapsedSeconds: task.elapsedSeconds + elapsedNow,
        timerStartedAt: null,
      };
    }
    const optimisticTask = { ...task, ...patch };
    const opIds = [stageOp({ type: "patch", taskId: task.id, patch })];
    syncCircleTask(optimisticTask);
    if (action === "start") {
      tasks.forEach((item) => {
        if (item.id === task.id || !item.timerStartedAt || item.done) return;
        const elapsed = Math.max(
          0,
          Math.floor((now - Date.parse(item.timerStartedAt)) / 1000),
        );
        opIds.push(
          stageOp({
            type: "patch",
            taskId: item.id,
            patch: {
              elapsedSeconds: item.elapsedSeconds + elapsed,
              timerStartedAt: null,
            },
          }),
        );
      });
    }

    const willFinishAllTasks =
      action === "complete" &&
      body.done &&
      !task.done &&
      tasks.length > 0 &&
      tasks.every((item) => item.id === task.id || item.done);
    let soundReady = null;
    if (willFinishAllTasks) {
      try {
        soundReady = prepareCelebrationSound();
      } catch (error) {
        notify(`The celebration sound couldn't play: ${error.message}`);
      }
    }

    try {
      let updated;
      try {
        updated = await api(`/tasks/${task.id}/${action}`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      } catch (firstError) {
        if (
          firstError.status !== 401 &&
          !/unauthenticated|not authenticated/i.test(firstError.message || "")
        )
          throw firstError;
        await authClient.convex.token();
        updated = await api(`/tasks/${task.id}/${action}`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      settleOps(opIds, updated);
      syncCircleTask(updated);
      refreshTasks().catch((error) => notify(error.message));
      if (action === "complete" && updated.done) {
        loadActivity().catch((error) => notify(error.message));
        let nextCelebration = willFinishAllTasks ? "tasks" : null;
        if (nextCelebration) setCelebrationType(nextCelebration);
        else if (body.done && !task.done) {
          const cheers = ["Nice one. Another down.", "That's one off the list.", "Look at you go.", "Steady wins it."];
          setKindleToast({
            key: Date.now(),
            mood: openTodayAfter === 1 ? "enc" : "proud",
            text: openTodayAfter === 1 ? "Just one left. You've got this." : cheers[Math.floor(Math.random() * cheers.length)],
          });
        }
        try {
          const nextStreak = await api(
            `/streak?tz=${new Date().getTimezoneOffset()}`,
          );
          setStreak(nextStreak);
          if (
            !nextCelebration &&
            nextStreak.doneToday &&
            nextStreak.current > previousStreak
          )
            nextCelebration = "streak";
          if (nextCelebration === "streak") setCelebrationType("streak");
        } catch (error) {
          notify(error.message);
        }
        if (sharedGroupIds.length) {
          try {
            const nextGroups = await api("/groups");
            setGroups(nextGroups);
            const isLeading = sharedGroupIds.some((groupId) =>
              leadsGroup(nextGroups.find((group) => group.id === groupId)),
            );
            if (!nextCelebration && !wasLeading && isLeading)
              nextCelebration = "leaderboard";
          } catch (error) {
            notify(error.message);
          }
        }
        if (nextCelebration === "leaderboard") setCelebrationType(nextCelebration);
        if (nextCelebration) setKindleToast(null);
        if (willFinishAllTasks) {
          if (soundReady) {
            soundReady
              .then(playCelebrationSound)
              .catch((error) =>
                notify(`The celebration sound couldn't play: ${error.message}`),
              );
          }
        }
      }
    } catch (error) {
      if (soundReady)
        soundReady.then((context) => context.close()).catch(() => {});
      if (action === "complete") {
        try {
          // A request can commit on Convex even if its response is interrupted.
          // Reconcile before rolling back the optimistic checkbox state.
          const latest = await api("/tasks");
          const confirmed = latest.find((item) => item.id === task.id);
          if (confirmed && confirmed.done === Boolean(body.done)) {
            settleOps(opIds, confirmed);
            syncCircleTask(confirmed);
            if (confirmed.done) {
              loadActivity().catch(() => {});
              api(`/streak?tz=${new Date().getTimezoneOffset()}`)
                .then(setStreak)
                .catch(() => {});
            }
            return;
          }
        } catch {
          // Fall through to the normal rollback when the server cannot be checked.
        }
      }
      settleOps(opIds);
      syncCircleTask(task);
      refreshTasks().catch(() => {});
      refreshCircleGoals(sharedGroupIds).catch(() => {});
      notify(error.message);
    }
  }

  async function patchTask(task, overrides = {}) {
    return api(`/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: task.title,
        description: task.description || "",
        category: task.category,
        dueDate: task.dueDate,
        priority: task.priority,
        visibility: task.visibility,
        targetMinutes: task.targetMinutes,
        repeat: task.repeat || "none",
        reminderTime: task.reminderTime || "",
        tzOffset: new Date().getTimezoneOffset(),
        groupIds: task.groupIds || [],
        ...overrides,
      }),
    });
  }

  async function extendFocus(task, minutes) {
    const targetMinutes = Math.min(1440, task.targetMinutes + minutes);
    const opId = stageOp({
      type: "patch",
      taskId: task.id,
      patch: { targetMinutes },
    });
    try {
      settleOps([opId], await patchTask(task, { targetMinutes }));
      refreshTasks().catch((error) => notify(error.message));
    } catch (error) {
      settleOps([opId]);
      notify(error.message);
    }
  }

  function handleTimer(task, action) {
    updateTask(task, action);
    if (action === "start") setFocusTaskId(task.id);
  }

  async function leaveCircle(group) {
    try {
      await api(`/groups/${group.id}/leave`, { method: "POST", body: "{}" });
      setLeaveTarget(null);
      notify(`You left ${group.name}.`);
    } catch (error) {
      setLeaveTarget(null);
      notify(error.message);
    }
  }

  async function moveToToday(list) {
    const movable = list;
    if (!movable.length) return;
    const dueDate = localDate();
    const staged = movable.map((task) => ({
      task,
      opId: stageOp({
        type: "patch",
        taskId: task.id,
        patch: { dueDate, movedFrom: movedFromFor(task, dueDate) },
      }),
    }));
    staged.forEach(({ task }) =>
      syncCircleTask({
        ...task,
        dueDate,
        movedFrom: movedFromFor(task, dueDate),
      }),
    );
    notify(
      movable.length === 1
        ? "Moved to today."
        : `Moved ${movable.length} tasks to today.`,
    );
    await Promise.all(
      staged.map(async ({ task, opId }) => {
        try {
          const updated = await patchTask(task, { dueDate });
          settleOps([opId], updated);
          syncCircleTask(updated);
        } catch (error) {
          settleOps([opId]);
          syncCircleTask(task);
          refreshCircleGoals(task.groupIds).catch(() => {});
          notify(error.message);
        }
      }),
    );
    refreshTasks().catch((error) => notify(error.message));
  }

  async function deleteTask(task) {
    if (task.assignmentId) {
      notify(
        "This task was assigned by your circle owner, so it can't be deleted.",
      );
      return;
    }
    const opId = stageOp({ type: "remove", taskId: task.id });
    syncCircleTask(task, true);
    notify("Task deleted.");
    try {
      await api(`/tasks/${task.id}`, { method: "DELETE" });
      settleOps([opId], null, task.id);
      refreshTasks().catch((error) => notify(error.message));
    } catch (error) {
      settleOps([opId]);
      syncCircleTask(task);
      refreshTasks().catch(() => {});
      refreshCircleGoals(task.groupIds).catch(() => {});
      notify(error.message);
    }
  }

  async function changeAdmin(group, member, admin) {
    try {
      await api(
        `/groups/${group.id}/members/${encodeURIComponent(member.id)}/admin`,
        { method: "POST", body: JSON.stringify({ admin }) },
      );
      notify(
        admin
          ? `${member.name} is now an admin.`
          : `${member.name} is no longer an admin.`,
      );
    } catch (error) {
      notify(error.message);
    }
  }

  async function removeMember() {
    const { group, member } = memberToRemove;
    setMemberToRemove(null);
    try {
      await api(
        `/groups/${group.id}/members/${encodeURIComponent(member.id)}`,
        { method: "DELETE" },
      );
      notify(`${member.name} was removed from ${group.name}.`);
    } catch (error) {
      notify(error.message);
    }
  }

  async function saveAssignment(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      title: String(form.get("title") || "").trim(),
      description: String(form.get("description") || "").trim(),
      category: String(form.get("category") || "Personal"),
      dueDate: String(form.get("dueDate") || "") || null,
      priority: String(form.get("priority") || "normal"),
      targetMinutes: Math.min(
        1440,
        Math.max(1, Math.round(Number(form.get("targetMinutes")) || 25)),
      ),
      includeSelf: form.get("includeSelf") === "on",
      assigneeIds: form.getAll("assigneeIds").map(String),
    };
    if (!body.assigneeIds.length) delete body.assigneeIds;
    if (!body.title || body.title.length > 120) {
      notify("Task titles must be 1–120 characters.");
      return;
    }
    try {
      const result = await api(`/groups/${activeGroup.id}/assignments`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setAssignDialog(false);
      notify(
        `Assigned to ${result.assigned} ${result.assigned === 1 ? "member" : "members"}.`,
      );
    } catch (error) {
      notify(error.message);
    }
  }

  async function deleteAssignment(assignment) {
    try {
      await api(`/assignments/${assignment.id}`, { method: "DELETE" });
      setAssignmentToDelete(null);
      notify("Assigned task removed for everyone.");
    } catch (error) {
      setAssignmentToDelete(null);
      notify(error.message);
    }
  }

  async function addFriend(target) {
    try {
      const payload = typeof target === "string" ? { email: target } : target;
      const added = await api("/friends", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await Promise.all([loadWorkspace(), loadActivity()]);
      setSearchResults((current) =>
        current.map((person) =>
          person.id === added.id ? { ...person, isFriend: true } : person,
        ),
      );
      setFriendDialog(false);
      setProfile(null);
      notify(
        `${added.name} added as a friend. Add them to a circle when you're ready.`,
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }

  async function createCircle(name) {
    try {
      const circle = await api("/groups", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setGroups((current) => [...current, circle]);
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
        method: "POST",
        body: JSON.stringify({ userId: friend.id }),
      });
      await loadWorkspace();
      notify(`${friend.name} added to ${group.name}.`);
    } catch (error) {
      notify(error.message);
    }
  }

  async function createInviteLink(group) {
    try {
      const invitation = await api(`/groups/${group.id}/invite`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const link = `${window.location.origin}/join/${invitation.token}`;
      setInviteLinks((current) => ({ ...current, [group.id]: link }));
      notify("Invite link ready. It works for 7 days.");
    } catch (error) {
      notify(error.message);
    }
  }

  async function revokeInviteLink(group) {
    try {
      await api(`/groups/${group.id}/invite/revoke`, {
        method: "POST",
        body: "{}",
      });
      setInviteLinks((current) => {
        const next = { ...current };
        delete next[group.id];
        return next;
      });
      notify("Invite link revoked.");
    } catch (error) {
      notify(error.message);
    }
  }

  async function nudgeTask(task) {
    try {
      await api(`/tasks/${task.id}/nudge`, { method: "POST", body: "{}" });
      notify(`Nudge sent to ${task.ownerName}.`);
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
      notify(
        `Couldn't copy the link. Select and copy it manually: ${error.message}`,
      );
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

  async function reactToActivity(item, emoji = "❤️") {
    try {
      const response = await api(`/activity/${item.id}/react`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      });
      setActivity((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, ...response } : entry,
        ),
      );
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
          bio: String(form.get("bio") || "").trim(),
          avatar: String(form.get("avatar") || "") || undefined,
        }),
      });
      setProfile(updated);
      setUser(updated);
      setProfileEditing(false);
      notify("Profile saved.");
    } catch (error) {
      notify(error.message);
    }
  }

  async function editMessage(message, content) {
    try {
      await api(`/messages/${message.id}`, {
        method: "PATCH",
        body: JSON.stringify({ content }),
      });
    } catch (error) {
      notify(error.message);
    }
  }

  async function deleteMessage(message) {
    try {
      await api(`/messages/${message.id}`, { method: "DELETE" });
    } catch (error) {
      notify(error.message);
    }
  }

  function handleTyping() {
    if (!activeGroup || Date.now() - typingSentRef.current < 2500) return;
    typingSentRef.current = Date.now();
    api(`/groups/${activeGroup.id}/typing`, {
      method: "POST",
      body: "{}",
    }).catch(() => {});
  }

  async function exportMyData() {
    try {
      const data = await api("/export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "kinda-export.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      notify(error.message);
    }
  }

  async function deleteAccount(confirm) {
    try {
      await api("/account/delete", {
        method: "POST",
        body: JSON.stringify({ confirm }),
      });
      try {
        await authClient.signOut();
      } catch {
        /* account is already gone */
      }
      try {
        localStorage.removeItem(`kinda:seen:${user.id}`);
      } catch {
        /* ignore */
      }
      clearSavedData(user.id);
      setUser(null);
      setProfile(null);
      resetTasks();
      setFriends([]);
      setGroups([]);
      setActiveGroup(null);
      setActivity([]);
      setScreen("landing");
      setPage("home");
    } catch (error) {
      notify(error.message);
    }
  }

  async function shareStreakCard() {
    if (!streak) return;
    try {
      await shareProgressCard({
        title: `${streak.current} day streak`,
        subtitle: `${user.name} is building a little momentum.`,
        filename: `kinda-streak-${streak.current}.png`,
        stats: [
          { value: `${streak.current} days`, label: "current streak" },
          { value: `${streak.best} days`, label: "personal best" },
          {
            value: streak.doneToday ? "Saved" : `${streak.needed} to go`,
            label: "today's progress",
          },
        ],
      });
    } catch (error) {
      notify(error.message || "Couldn't share the streak card.");
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const content = newMessage.trim();
    if (!activeGroup || !content || sendingMessageRef.current) return;
    const groupId = activeGroup.id;
    sendingMessageRef.current = true;
    setSendingMessage(true);
    try {
      await api(`/groups/${groupId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content,
          replyTo: replyTo?.id,
          mentions: (activeGroup.members || [])
            .filter(
              (member) =>
                member.id !== user.id && content.includes(`@${member.name}`),
            )
            .map((member) => member.id),
        }),
      });
      setReplyTo(null);
      setNewMessage("");
    } catch (error) {
      notify(error.message);
    } finally {
      sendingMessageRef.current = false;
      setSendingMessage(false);
    }
  }

  if (loading) return <KindaLoader />;
  if (screen === "invite" && !user)
    return (
      <InviteScreen
        invitation={invitePreview}
        error={inviteError}
        onSignup={() => setScreen("signup")}
        onLogin={() => setScreen("login")}
        onHome={() => {
          setInviteToken("");
          setScreen("landing");
          window.history.replaceState(null, "", "/");
        }}
      />
    );
  if (screen === "landing" && !user)
    return (
      <Landing
        onStart={() => setScreen("signup")}
        onLogin={() => setScreen("login")}
      />
    );
  if (["signup", "login", "forgot", "reset"].includes(screen) && !user) {
    return (
      <AuthScreen
        mode={screen}
        setMode={(next) => {
          setAuthError("");
          setAuthNotice("");
          setScreen(next);
        }}
        onSubmit={submitAuth}
        onGoogle={submitGoogleAuth}
        googleEnabled={googleSignInEnabled}
        error={authError}
        notice={authNotice}
        busy={authBusy}
        inviteName={invitePreview?.name}
      />
    );
  }

  const activeTimer = tasks.find((task) => task.timerStartedAt && !task.done);
  const activePage = pages.find((item) => item.id === page) || pages[0];
  const todayDoneTasks = todayTasks.filter((task) => task.done);
  const todayCompletion = todayTasks.length
    ? Math.round((todayDoneTasks.length / todayTasks.length) * 100)
    : 0;

  return (
    <ClockProvider>
      <main className={`app-shell ${menuOpen ? "menu-open" : ""}`}>
        <aside className="sidebar">
          <button
            className="wordmark wordmark-button"
            onClick={() => navigate("home")}
          >
            kinda<span className="wordmark-flame"><Kindle mood="happy" size={22} /></span>
          </button>
          <nav className="side-nav" aria-label="Main navigation">
            {[
              ["Plan", ["home", "tasks", "weekly"]],
              ["Together", ["circles", "chat", "activity"]],
              ["You", ["profile", "settings"]],
            ].map(([heading, ids]) => (
              <div className="nav-group" key={heading}>
                <p className="side-label">{heading}</p>
                {ids.map((id) => {
                  const { label, icon: Icon } = pages.find(
                    (item) => item.id === id,
                  );
                  return (
                    <button
                      key={id}
                      className={`nav-item ${page === id ? "active" : ""}`}
                      aria-current={page === id ? "page" : undefined}
                      onClick={() => navigate(id)}
                      title={label}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                      {badges[id] > 0 && (
                        <i
                          key={badges[id]}
                          className="nav-badge"
                          aria-label={`${badges[id]} new`}
                        >
                          {badges[id] > 99 ? "99+" : badges[id]}
                        </i>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sidebar-friends">
            <div className="side-section-heading">
              <span>YOUR CIRCLES</span>
              <button
                className="icon-quiet"
                onClick={() => setCircleDialog(true)}
                aria-label="Create circle"
              >
                <Plus size={15} />
              </button>
            </div>
            {groups.slice(0, 5).map((group, index) => (
              <button
                className="friend-mini"
                key={group.id}
                onClick={() => {
                  setActiveGroup(group);
                  navigate("circles");
                }}
              >
                <Avatar name={group.name} index={index} />
                <span>{group.name}</span>
              </button>
            ))}
            {!groups.length && (
              <p className="sidebar-empty">Create a circle for your people.</p>
            )}
            <button
              className="sidebar-add-friend"
              onClick={() => setCircleDialog(true)}
            >
              <Plus size={14} /> Create circle
            </button>
          </div>
          <div className="sidebar-bottom">
            <div className="profile-mini">
              <Avatar name={user.name} index={-1} avatar={user.avatar} />
              <button
                className="profile-name"
                onClick={() => navigate("profile")}
              >
                {user.name}
                <small>View profile</small>
              </button>
              <button
                className="icon-quiet signout-icon"
                onClick={signOut}
                aria-label="Log out"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>

        <button
          className="drawer-backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />

        <section className="main-area">
          <header className="mobile-topbar">
            <button
              className="menu-button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
              {totalBadges > 0 && <i className="nav-dot" />}
            </button>
            <span className="wordmark">
              kinda<span className="wordmark-flame"><Kindle mood="happy" size={22} /></span>
            </span>
          </header>
          {page === "home" && (
            <HomePage
              user={user}
              tasks={todayTasks}
              done={todayDoneTasks.length}
              total={todayTasks.length}
              completion={todayCompletion}
              remainingTasks={openTodayTasks.length}
              leaderboardGroupId={leaderboardGroupId ?? groups[0]?.id}
              onSelectLeaderboardGroup={setLeaderboardGroupId}
              activity={activity.slice(0, 4)}
              groups={viewGroups}
              onCreate={() => setTaskDialog({ task: null })}
              onEdit={editTask}
              onComplete={completeTask}
              onTimer={timerTask}
              onReact={reactToActivity}
              onPage={navigate}
              onCircle={(group) => {
                setActiveGroup(group);
                navigate("circles");
              }}
              onCreateCircle={() => setCircleDialog(true)}
              streak={streak}
              loaded={tasksLoaded}
              justDoneId={justDoneId}
              onboarding={
                onboardingHidden ||
                !(tasksLoaded && groupsLoaded && friendsLoaded) ||
                onboardingSteps.every((step) => step.done)
                  ? null
                  : onboardingSteps
              }
              onShareStreak={shareStreakCard}
              onDismissOnboarding={() => {
                setOnboardingHidden(true);
                try {
                  localStorage.setItem("kinda:onboarding-dismissed", "1");
                } catch {
                  /* ignore */
                }
              }}
            />
          )}
          {page === "tasks" && (
            <TasksPage
              loaded={tasksLoaded}
              justDoneId={justDoneId}
              tasks={filteredTasks}
              recentTasks={recentPastTasks}
              onMoveToToday={moveToToday}
              filter={filter}
              setFilter={setFilter}
              allCount={tasks.length}
              onCreate={() => setTaskDialog({ task: null })}
              onEdit={editTask}
              onComplete={completeTask}
              onTimer={timerTask}
              onDelete={removeTask}
            />
          )}
          {page === "circles" && (
            <CirclesPage
              groups={viewGroups}
              activeGroup={viewActiveGroup}
              onSelect={setActiveGroup}
              sharedTasks={sharedTasksToday}
              earlierCount={sharedTasks.length - sharedTasksToday.length}
              friends={friends}
              onShareTask={(friend) => setTaskDialog({ task: null, sharedWith: [friend.id] })}
              query={friendSearch}
              setQuery={setFriendSearch}
              results={searchResults}
              inviteLink={activeGroup ? inviteLinks[activeGroup.id] : null}
              profile={profile?.id !== user.id ? profile : null}
              user={user}
              onAdd={async (email) => {
                const result = await addFriend(email);
                if (!result.ok) notify(result.message);
              }}
              onInvite={() => setFriendDialog(true)}
              onOpen={openFriend}
              onCloseProfile={() => setProfile(null)}
              onCreateCircle={() => setCircleDialog(true)}
              onAddMember={addCircleMember}
              onCreateInvite={createInviteLink}
              onCopyInvite={copyInviteLink}
              onCreateTask={() =>
                setTaskDialog({
                  task: null,
                  groupIds: activeGroup ? [activeGroup.id] : [],
                })
              }
              onOpenChat={() => navigate("chat")}
              recap={recap}
              onNudge={nudgeTask}
              onRevokeInvite={revokeInviteLink}
              onLeave={setLeaveTarget}
              assignments={assignments}
              onAssign={() => setAssignDialog(true)}
              onDeleteAssignment={setAssignmentToDelete}
              onSetAdmin={changeAdmin}
              onRemoveMember={(group, member) =>
                setMemberToRemove({ group, member })
              }
              onWeeklyReport={setWeeklyGroup}
            />
          )}
          {page === "activity" && (
            <ActivityPage
              activity={activity}
              nudges={nudges}
              userId={user.id}
              onReact={reactToActivity}
              onFindPeople={() => navigate("circles")}
            />
          )}
          {page === "chat" && (
            <ChatPage
              groups={groups}
              activeGroup={activeGroup}
              setActiveGroup={(group) => {
                setActiveGroup(group);
                setChatMobileOpen(true);
              }}
              messages={messages}
              sharedTasks={sharedTasksToday}
              user={user}
              value={newMessage}
              setValue={setNewMessage}
              onSend={sendMessage}
              sending={sendingMessage}
              friends={friends}
              mobileOpen={chatMobileOpen}
              onMobileBack={() => setChatMobileOpen(false)}
              onInvite={() => setCircleDialog(true)}
              typingNames={(typingByGroup[activeGroup?.id] || [])
                .filter((row) => Date.now() - row.receivedAt < 5000)
                .map((row) => row.name)}
              replyTo={replyTo}
              onReply={setReplyTo}
              onCancelReply={() => setReplyTo(null)}
              onEdit={editMessage}
              onDelete={deleteMessage}
              onTyping={handleTyping}
              dividerTime={
                chatDivider && chatDivider.groupId === activeGroup?.id
                  ? chatDivider.time
                  : null
              }
            />
          )}
          {page === "weekly" && (
            <React.Suspense fallback={<p className="quiet-empty">Loading your weekly report…</p>}>
              <WeeklyPage tasks={tasks} userName={user.name} onError={notify} />
            </React.Suspense>
          )}
          {page === "profile" && (
            <ProfilePage
              user={profile || user}
              tasks={tasks}
              friends={friends}
              editing={profileEditing}
              setEditing={setProfileEditing}
              onSave={saveProfile}
              onFriend={openFriend}
            />
          )}
          {page === "settings" && (
            <SettingsPage
              user={user}
              api={api}
              onError={notify}
              onSignOut={signOut}
              theme={theme}
              setTheme={setTheme}
              notifPermission={notifPermission}
              onEnableNotifications={() =>
                Notification.requestPermission().then(setNotifPermission)
              }
              onExport={exportMyData}
              onDelete={deleteAccount}
              pushOn={pushOn}
              onTogglePush={() => (pushOn ? disablePush() : enablePush())}
              onWhatsNew={() => setShowWhatsNew(true)}
              accent={accent}
              setAccent={setAccent}
            />
          )}
        </section>

        {taskDialog && (
          <TaskDialog
            task={taskDialog.task}
            groups={groups}
            friends={friends}
            initialGroupIds={taskDialog.groupIds}
            initialSharedWith={taskDialog.sharedWith}
            onClose={() => setTaskDialog(null)}
            onSave={saveTask}
          />
        )}
        {assignDialog && activeGroup && (
          <AssignDialog
            group={viewActiveGroup || activeGroup}
            userId={user.id}
            onClose={() => setAssignDialog(false)}
            onSubmit={saveAssignment}
          />
        )}
        {assignmentToDelete && (
          <ConfirmDialog
            title="Remove this assigned task?"
            confirmLabel="Remove for everyone"
            danger
            onConfirm={() => deleteAssignment(assignmentToDelete)}
            onCancel={() => setAssignmentToDelete(null)}
          >
            <p>
              “{assignmentToDelete.title}” will be removed from every member’s
              list, including anything they have already completed.
            </p>
          </ConfirmDialog>
        )}
        {memberToRemove && (
          <ConfirmDialog
            title={`Remove ${memberToRemove.member.name}?`}
            confirmLabel="Remove from circle"
            danger
            onConfirm={removeMember}
            onCancel={() => setMemberToRemove(null)}
          >
            <p>
              {memberToRemove.member.name} will lose access to{" "}
              {memberToRemove.group.name}’s chat and tasks, and any tasks
              assigned to them here will be removed. They can only come back
              with a new invite.
            </p>
          </ConfirmDialog>
        )}
        {weeklyGroup && (
          <Modal
            title="Circle weekly report"
            subtitle={weeklyGroup.name}
            onClose={() => setWeeklyGroup(null)}
          >
            <React.Suspense fallback={<p className="quiet-empty">Loading circle report…</p>}>
              <CircleWeeklyPanel
                fetchWeek={(weekStart) =>
                  api(
                    `/groups/${weeklyGroup.id}/weekly?week=${weekStart}&tz=${new Date().getTimezoneOffset()}`,
                  )
                }
                onError={notify}
              />
            </React.Suspense>
          </Modal>
        )}
        {friendDialog && (
          <FriendDialog
            onClose={() => setFriendDialog(false)}
            onSubmit={addFriend}
          />
        )}
        {circleDialog && (
          <CircleDialog
            onClose={() => setCircleDialog(false)}
            onSubmit={createCircle}
          />
        )}
        {banner && (
          <InAppBanner
            banner={banner}
            onClose={() => setBanner(null)}
            onOpen={() => {
              const target = banner;
              setBanner(null);
              if (target.kind === "chat") {
                const group = groups.find((item) => item.id === target.groupId);
                if (group) setActiveGroup(group);
                navigate("chat");
                setChatMobileOpen(true);
              } else navigate("activity");
            }}
          />
        )}
        {focusTask && (
          <FocusMode
            task={focusTask}
            onClose={() => setFocusTaskId(null)}
            onToggle={() =>
              updateTask(focusTask, focusTask.timerStartedAt ? "stop" : "start")
            }
            onDone={() => {
              updateTask(focusTask, "complete", { done: true });
              setFocusTaskId(null);
            }}
            onExtend={(minutes) => extendFocus(focusTask, minutes)}
          />
        )}
        {leaveTarget && (
          <ConfirmDialog
            title={`Leave ${leaveTarget.name}?`}
            confirmLabel="Leave circle"
            danger
            onConfirm={() => leaveCircle(leaveTarget)}
            onCancel={() => setLeaveTarget(null)}
          >
            <p>
              You’ll stop seeing this circle’s chat and tasks, and the tasks you
              shared with it will be removed from the circle.
              {leaveTarget.ownerId === user.id
                ? " Ownership passes to the member who has been here longest."
                : ""}
            </p>
          </ConfirmDialog>
        )}
        {reminderQueue[0] && (
          <ReminderDialog
            reminder={reminderQueue[0]}
            onDismiss={() => setReminderQueue((queue) => queue.slice(1))}
            onDone={() => {
              const task = reminderQueue[0];
              setReminderQueue((queue) => queue.slice(1));
              updateTask(task, "complete", { done: true });
            }}
          />
        )}
        {showWhatsNew && !reminderQueue[0] && (
          <WhatsNewDialog onClose={closeWhatsNew} />
        )}
        {kindleToast && !celebrationType && (
          <KindleToast toast={kindleToast} onDone={() => setKindleToast(null)} />
        )}
        {celebrationType && (
          <CelebrationDialog
            type={celebrationType}
            onClose={() => setCelebrationType(null)}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            <span className="toast-mark">
              <Check size={15} />
            </span>
            {toast}
          </div>
        )}
        {activeTimer && (
          <RunningTimer
            task={activeTimer}
            onOpen={() => setFocusTaskId(activeTimer.id)}
          />
        )}
      </main>
    </ClockProvider>
  );
}

function RunningTimer({ task, onOpen }) {
  const tick = useClock();
  const remaining =
    task.targetMinutes * 60 -
    task.elapsedSeconds -
    Math.max(0, Math.floor((tick - Date.parse(task.timerStartedAt)) / 1000));
  return (
    <button
      className="running-timer"
      aria-live="off"
      onClick={onOpen}
      aria-label="Open focus mode"
    >
      <span className="timer-live-dot" />
      <Clock3 size={14} />
      <span>{formatTime(remaining)}</span>
      <small>{task.title}</small>
    </button>
  );
}

function parseAvatar(value) {
  const [color, emoji = ""] = String(value || "").split("|");
  return avatarColorKeys.includes(color) ? { color, emoji } : null;
}

function Avatar({ name, index = 0, large = false, avatar }) {
  const custom = parseAvatar(avatar);
  const colors = [
    "avatar-terracotta",
    "avatar-sand",
    "avatar-rose",
    "avatar-olive",
  ];
  const color = custom
    ? `avatar-c-${custom.color}`
    : index < 0
      ? "avatar-self"
      : colors[index % colors.length];
  return (
    <span
      className={`avatar ${color} ${large ? "avatar-large" : ""} ${custom?.emoji ? "avatar-emoji" : ""}`}
    >
      {custom?.emoji || initials(name)}
    </span>
  );
}

function AvatarPicker({ name, defaultValue }) {
  const start = parseAvatar(defaultValue);
  const [color, setColor] = useState(start?.color || "terracotta");
  const [emoji, setEmoji] = useState(start?.emoji || "");
  return (
    <div className="avatar-picker">
      <input type="hidden" name="avatar" value={`${color}|${emoji}`} />
      <div className="avatar-picker-preview">
        <Avatar name={name} avatar={`${color}|${emoji}`} large />
        <span>Pick a color and a character</span>
      </div>
      <div
        className="avatar-swatches"
        role="radiogroup"
        aria-label="Avatar color"
      >
        {avatarColorKeys.map((key) => (
          <button
            type="button"
            key={key}
            role="radio"
            aria-checked={color === key}
            aria-label={key}
            className={`swatch avatar-c-${key} ${color === key ? "selected" : ""}`}
            onClick={() => setColor(key)}
          />
        ))}
      </div>
      <div
        className="avatar-emoji-grid"
        role="radiogroup"
        aria-label="Avatar character"
      >
        <button
          type="button"
          role="radio"
          aria-checked={emoji === ""}
          className={`emoji-option emoji-initials ${emoji === "" ? "selected" : ""}`}
          onClick={() => setEmoji("")}
        >
          Aa
        </button>
        {avatarEmojis.map((item) => (
          <button
            type="button"
            key={item}
            role="radio"
            aria-checked={emoji === item}
            className={`emoji-option ${emoji === item ? "selected" : ""}`}
            onClick={() => setEmoji(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function GroupLeaderboard({
  group,
  userId,
  compact = false,
  onOpen,
  onSelectGroup,
  groups = [],
}) {
  const members = [...(group.members || [])].sort(
    (left, right) =>
      right.doneCount - left.doneCount || left.name.localeCompare(right.name),
  );
  let currentRank = 0;
  let previousDone = null;
  const allRanked = members.map((member, index) => {
    if (member.doneCount !== previousDone) currentRank = index + 1;
    previousDone = member.doneCount;
    return { ...member, rank: currentRank };
  });
  const ranked = compact ? allRanked.slice(0, 3) : allRanked;

  return (
    <section
      className={`leaderboard-card ${compact ? "leaderboard-compact" : ""}`}
    >
      <div className="section-title-row">
        <div>
          <p className="eyebrow">{compact ? "CIRCLE STANDINGS" : group.name}</p>
          <h2>
            <Trophy size={17} /> Today’s leaderboard
          </h2>
        </div>
        <div className="leaderboard-actions">
          {groups.length > 1 && onSelectGroup && (
            <select
              aria-label="Leaderboard circle"
              value={group.id}
              onChange={(event) => onSelectGroup(event.target.value)}
            >
              {groups.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
          {onOpen && (
            <button className="text-link" onClick={onOpen}>
              {compact ? "Open circle" : "Circle tasks"}{" "}
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
      {ranked.length ? (
        <ol className="leaderboard-list">
          {ranked.map((member) => (
            <li
              className={`leaderboard-row ${member.rank === 1 ? "leaderboard-first" : ""}`}
              key={member.id}
            >
              <span className="leaderboard-rank">
                {member.rank === 1 ? (
                  <Trophy size={15} />
                ) : member.rank === 2 ? (
                  <span aria-label="Runner-up">🥈</span>
                ) : (
                  `#${member.rank}`
                )}
              </span>
              <Avatar name={member.name} avatar={member.avatar} />
              <span className="leaderboard-person">
                <b>
                  {member.name}
                  {member.id === userId ? " (you)" : ""}
                </b>
                <small>
                  {member.id === group.ownerId
                    ? "Circle owner"
                    : member.rank === 1
                      ? "Leading the way"
                      : member.rank === 2
                        ? "Runner-up"
                        : "Keep it going"}
                </small>
              </span>
              <strong>
                {member.doneCount}
                <small>/{member.taskCount} done</small>
              </strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="quiet-empty">
          Invite people to your circle to start a leaderboard.
        </p>
      )}
      {members.length > ranked.length && (
        <p className="leaderboard-more">
          Showing the top {ranked.length} of {members.length} members.
        </p>
      )}
    </section>
  );
}

function CelebrationDialog({ type, onClose }) {
  const celebration =
    type === "streak"
      ? {
          eyebrow: "STREAK CONTINUED",
          title: "You kept the rhythm.",
          body: "Today counts toward your streak. Small, steady progress adds up.",
        }
      : type === "leaderboard"
        ? {
            eyebrow: "TOP OF YOUR CIRCLE",
            title: "You’re leading today.",
            body: "Your circle can see the progress you’ve made. Keep cheering each other on.",
          }
        : {
            eyebrow: "YOU DID IT",
            title: "Every task, done.",
            body: "You showed up and finished what you set out to do. Take a moment to celebrate—you earned it.",
          };
  return (
    <div
      className="celebration-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="celebration-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebration-title"
      >
        <div className="celebration-confetti" aria-hidden="true">
          {Array.from({ length: 16 }, (_, index) => (
            <span key={index} style={{ "--confetti-index": index }} />
          ))}
        </div>
        <Kindle
          mood={type === "leaderboard" ? "cheer" : "celebrate"}
          size={128}
          animate
          className="celebration-kindle"
        />
        <p className="eyebrow">{celebration.eyebrow}</p>
        <h2 id="celebration-title">{celebration.title}</h2>
        <p>{celebration.body}</p>
        <button className="button button-primary" onClick={onClose}>
          Keep going <ArrowRight size={15} />
        </button>
      </section>
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action }) {
  const label =
    typeof eyebrow === "string" &&
    eyebrow.length > 1 &&
    eyebrow === eyebrow.toUpperCase()
      ? eyebrow.charAt(0) + eyebrow.slice(1).toLowerCase()
      : eyebrow;
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{label}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </header>
  );
}

function StreakLine({ streak, done, total, onShare }) {
  const threshold = Number(streak.percent) || 80;
  const minTasks = Number(streak.minTasks) || 5;
  const current = Number(streak.current) || 0;
  const percentDone = total ? Math.round((done / total) * 100) : 0;
  const reached = total >= minTasks && done * 100 >= total * threshold;
  const needed = total
    ? Math.max(0, Math.ceil((total * threshold) / 100) - done)
    : 0;
  const atRisk = !reached && current > 0 && new Date().getHours() >= 18;
  const lost = current === 0 && Number(streak.best) > 0 && done === 0;
  let mood = "happy";
  if (reached) mood = "proud";
  else if (atRisk) mood = "sleepy";
  else if (lost) mood = "sad";
  else if (total >= minTasks && needed === 1) mood = "enc";
  let message;
  if (atRisk)
    message =
      total < minTasks
        ? `Don’t let me fade out! Plan ${minTasks} tasks and finish ${threshold}% to keep your ${current}-day streak.`
        : `Don’t let me fade out! ${needed} more ${needed === 1 ? "task" : "tasks"} to keep your ${current}-day streak.`;
  else if (lost)
    message = "Your streak ended. Let’s relight it today with one small task.";
  else if (reached)
    message = `You’ve done ${percentDone}% of today’s tasks, so your streak is saved.`;
  else if (total < minTasks)
    message = `Plan at least ${minTasks} tasks today, then finish ${threshold}% of them to keep your streak alive.`;
  else if (done === 0)
    message = "Start with one small task. Your streak is counting on today.";
  else if (needed === 1)
    message = "One more task and your streak is safe. You’re so close.";
  else
    message = `${needed} more tasks to reach ${threshold}%. Keep going, you’re building something.`;
  return (
    <p className="streak-line" role="status">
      <span className="streak-kindle">
        <Kindle mood={mood} size={34} animate={mood !== "sleepy" && mood !== "sad"} />
      </span>
      <b>{current > 0 ? `${current}-day streak` : "Start a streak"}</b>
      <span>{message}</span>
      {current > 0 && (
        <button type="button" className="streak-share" onClick={onShare}>
          <Share size={13} /> Share
        </button>
      )}
    </p>
  );
}

function EarlierDays({ tasks, onMove, onShowAll }) {
  const [open, setOpen] = useState(false);
  const movable = tasks.filter((task) => !task.done);
  const days = [...new Set(tasks.map(taskDay))]
    .sort((left, right) => right.localeCompare(left))
    .map((day) => ({
      day,
      done: tasks.filter((task) => taskDay(task) === day && task.done),
      unfinished: tasks.filter((task) => taskDay(task) === day && !task.done),
    }));
  return (
    <section
      className="earlier-days"
      aria-label="Tasks from the previous three days"
    >
      <div className="earlier-bar">
        <button
          className="earlier-toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown size={15} className={open ? "open" : ""} />
          <b>Tasks from the previous 3 days ({tasks.length})</b>
        </button>
        {movable.length > 0 && (
          <button className="text-link" onClick={() => onMove(movable)}>
            Move {movable.length === 1 ? "it" : "all"} to today
          </button>
        )}
      </div>
      {open && (
        <div className="earlier-list">
          {days.map(({ day, done, unfinished }) => (
            <section className="earlier-day-group" key={day}>
              <h4>{dayLabel(day)}</h4>
              {done.length > 0 && (
                <div className="earlier-status-group">
                  <small className="eyebrow">COMPLETED</small>
                  {done.map((task) => (
                    <div className="earlier-row" key={task.id}>
                      <span>
                        <b>{task.title}</b>
                        <small>Done at {task.completedAt ? dateTime(task.completedAt) : "time unavailable"}{task.assignmentId ? " · Assigned" : ""}</small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {unfinished.length > 0 && (
                <div className="earlier-status-group">
                  <small className="eyebrow">NOT COMPLETED</small>
                  {unfinished.map((task) => (
                    <div className="earlier-row" key={task.id}>
                      <span>
                        <b>{task.title}</b>
                        <small>{task.assignmentId ? "Assigned · not completed" : "Not completed"}</small>
                      </span>
                      <button className="text-link" onClick={() => onMove([task])}>Move to today</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
          <button className="text-link" onClick={onShowAll}>
            See all earlier tasks
          </button>
        </div>
      )}
    </section>
  );
}

function HomePage({
  user,
  tasks,
  done,
  total,
  completion,
  remainingTasks,
  activity,
  groups,
  leaderboardGroupId,
  onSelectLeaderboardGroup,
  onCreate,
  onEdit,
  onComplete,
  onTimer,
  onReact,
  onPage,
  onCircle,
  onCreateCircle,
  streak,
  earlier = [],
  onMoveToToday,
  onShowEarlier,
  loaded = true,
  justDoneId,
  onboarding,
  onDismissOnboarding,
  onShareStreak,
}) {
  const activeLeaderboard =
    groups.find((group) => group.id === leaderboardGroupId) ||
    groups[0] ||
    null;
  const next = tasks.find((task) => !task.done && !task.timerStartedAt);
  return (
    <div className="page-content home-page">
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("en", {
          weekday: "long",
          month: "long",
          day: "numeric",
        }).format(new Date())}
        title={`${greeting()}, ${user.name.split(/\s+/)[0]}`}
        action={
          <button className="button button-primary" onClick={onCreate}>
            <Plus size={16} /> New task
          </button>
        }
      />
      <InstallCard />
      {onboarding && (
        <OnboardingCard steps={onboarding} onDismiss={onDismissOnboarding} />
      )}
      {!loaded ? (
        <section className="day-glance" aria-hidden="true">
          <span className="skeleton skeleton-ring" />
          <div className="glance-copy">
            <span className="skeleton skeleton-line" />
            <span className="skeleton skeleton-line short" />
          </div>
        </section>
      ) : (
        <section className="day-glance" aria-label="Today at a glance">
          <ProgressRing percent={completion} size={56} stroke={6}>
            <b className="ring-number">
              <CountUp value={completion} />
              <small>%</small>
            </b>
          </ProgressRing>
          <div className="glance-copy">
            <b>
              {done} of {total} done today
            </b>
            <span>
              {total === 0
                ? "Nothing planned yet."
                : completion === 100
                  ? "Everything finished."
                  : `${remainingTasks} left to go.`}
            </span>
          </div>
          {streak &&
            (Number(streak.current) > 0 ||
              Number(streak.best) > 0 ||
              total > 0) && (
              <StreakLine
                streak={streak}
                done={done}
                total={total}
                onShare={onShareStreak}
              />
            )}
        </section>
      )}
      <div className="home-grid">
        <section className="home-tasks">
          <div className="section-title-row">
            <h2>Today</h2>
            <button className="text-link" onClick={() => onPage("tasks")}>
              All tasks <ArrowRight size={15} />
            </button>
          </div>
          {earlier.length > 0 && (
            <EarlierDays
              tasks={earlier}
              onMove={onMoveToToday}
              onShowAll={onShowEarlier}
            />
          )}
          {!loaded ? (
            <SkeletonList />
          ) : tasks.length ? (
            <div className="task-list">
              {tasks.slice(0, 8).map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  justDone={justDoneId === task.id}
                  onComplete={onComplete}
                  onTimer={onTimer}
                  onEdit={onEdit}
                  onDelete={null}
                />
              ))}
            </div>
          ) : (
            <EmptyTasks onCreate={onCreate} compact />
          )}
          {next && (
            <div className="up-next">
              <span>Up next</span>
              <b>{next.title}</b>
              <button
                className="text-link"
                onClick={() => onTimer(next, "start")}
              >
                <Play size={13} /> Start focus
              </button>
            </div>
          )}
        </section>
        <aside className="home-social">
          <section className="home-feed">
            <div className="section-title-row">
              <h2>Friends</h2>
              <button
                className="icon-quiet"
                onClick={() => onPage("activity")}
                aria-label="See all activity"
              >
                <ArrowRight size={16} />
              </button>
            </div>
            {activity.length ? (
              <ActivityList
                items={activity}
                userId={user.id}
                onReact={onReact}
                compact
              />
            ) : (
              <p className="quiet-empty">
                Friend activity will appear when your friends share a task or
                finish one.
              </p>
            )}
          </section>
          <section className="home-friends">
            <div className="section-title-row">
              <h2>Circles</h2>
              <button
                className="icon-quiet"
                onClick={onCreateCircle}
                aria-label="Create circle"
              >
                <Plus size={16} />
              </button>
            </div>
            {groups.length ? (
              <div className="friend-list">
                {groups.slice(0, 4).map((group, index) => (
                  <button
                    className="friend-card"
                    key={group.id}
                    onClick={() => onCircle(group)}
                  >
                    <Avatar name={group.name} index={index} />
                    <span>
                      <b>{group.name}</b>
                      <small>
                        {group.memberCount}{" "}
                        {group.memberCount === 1 ? "member" : "members"} ·{" "}
                        {group.taskCount}{" "}
                        {group.taskCount === 1 ? "task" : "tasks"} today
                      </small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="quiet-empty">
                Create a circle to share progress with your people.{" "}
                <button onClick={onCreateCircle}>Create a circle</button>
              </p>
            )}
          </section>
          {activeLeaderboard && (
            <GroupLeaderboard
              group={activeLeaderboard}
              userId={user.id}
              onOpen={() => onCircle(activeLeaderboard)}
              onSelectGroup={onSelectLeaderboardGroup}
              groups={groups}
              compact
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function TasksPage({
  tasks,
  recentTasks = [],
  onMoveToToday,
  filter,
  setFilter,
  allCount,
  onCreate,
  onEdit,
  onComplete,
  onTimer,
  onDelete,
  loaded = true,
  justDoneId,
}) {
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="Everything you are working on"
        title="My Tasks"
        description={`${allCount} ${allCount === 1 ? "task" : "tasks"} on your list.`}
        action={
          <button className="button button-primary" onClick={onCreate}>
            <Plus size={16} /> New task
          </button>
        }
      />
      <div className="task-filters" role="tablist" aria-label="Filter tasks">
        {["Today", "Earlier", "Upcoming", "Completed", "No date"].map(
          (item) => (
            <button
              role="tab"
              aria-selected={filter === item}
              className={filter === item ? "filter-active" : ""}
              key={item}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ),
        )}
      </div>
      {filter === "Earlier" && recentTasks.length > 0 && (
        <TaskHistory tasks={recentTasks} onMove={onMoveToToday} />
      )}
      {!loaded ? (
        <SkeletonList rows={4} />
      ) : tasks.length ? (
        <section className="task-list task-list-page">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              justDone={justDoneId === task.id}
              onComplete={onComplete}
              onTimer={onTimer}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </section>
      ) : (
        <EmptyTasks
          onCreate={onCreate}
          title={
            filter === "Completed"
              ? "No completed tasks yet."
              : filter === "Upcoming"
                ? "Nothing coming up."
                : filter === "Earlier"
                  ? "Nothing left over."
                  : "A clear page."
          }
        />
      )}
    </div>
  );
}

function TaskHistory({ tasks, onMove }) {
  const history = tasks.flatMap((task) => {
    const days = [...new Set([taskDay(task), ...(task.movedFrom || [])])]
      .filter((day) => day < localDate());
    return days.map((day) => ({ task, day }));
  });
  const days = [...new Set(history.map((entry) => entry.day))]
    .sort((a, b) => b.localeCompare(a))
    .map((day) => ({
      day,
      done: history.filter((entry) => entry.day === day && entry.task.done).map((entry) => entry.task),
      unfinished: history.filter((entry) => entry.day === day && !entry.task.done).map((entry) => entry.task),
    }));
  return (
    <section className="task-history" aria-label="Tasks from the previous three days">
      <div className="section-title-row"><h2>Previous 3 days</h2></div>
      {days.map(({ day, done, unfinished }) => (
        <section className="earlier-day-group" key={day}>
          <h4>{dayLabel(day)}</h4>
          {done.length > 0 && <div className="earlier-status-group">
            <small className="eyebrow">COMPLETED</small>
            {done.map((task) => <div className="earlier-row" key={task.id}>
              <span><b>{task.title}</b><small>Done at {task.completedAt ? dateTime(task.completedAt) : "time unavailable"}</small></span>
            </div>)}
          </div>}
          {unfinished.length > 0 && <div className="earlier-status-group">
            <small className="eyebrow">NOT COMPLETED</small>
            {unfinished.map((task) => <div className="earlier-row" key={task.id}>
              <span><b>{task.title}</b><small>{task.assignmentId ? "Assigned · not completed" : "Not completed"}</small></span>
              <button className="text-link" onClick={() => onMove(unfinished.filter((item) => item.id === task.id))}>Move to today</button>
            </div>)}
          </div>}
        </section>
      ))}
    </section>
  );
}

function RunningReadout({ task }) {
  const tick = useClock();
  const elapsed =
    task.elapsedSeconds +
    Math.max(0, Math.floor((tick - Date.parse(task.timerStartedAt)) / 1000));
  return (
    <span className="focus-live">
      {formatTime(Math.max(0, task.targetMinutes * 60 - elapsed))}
    </span>
  );
}

const TaskRow = React.memo(function TaskRow({
  task,
  onComplete,
  onTimer,
  onEdit,
  onDelete,
  justDone,
}) {
  const locked = Boolean(task.assignmentId);
  const canDelete = Boolean(onDelete) && !locked;
  const due = dueLabel(task, Date.now());
  const running = Boolean(task.timerStartedAt);
  const left = Math.max(0, task.targetMinutes * 60 - task.elapsedSeconds);
  const [dx, setDx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const drag = useRef(null);
  function down(event) {
    if (event.pointerType !== "touch" || event.target.closest("button")) return;
    drag.current = { x: event.clientX, y: event.clientY, locked: false };
  }
  function move(event) {
    const current = drag.current;
    if (!current) return;
    const moveX = event.clientX - current.x;
    const moveY = event.clientY - current.y;
    if (!current.locked) {
      if (Math.abs(moveY) > 10 && Math.abs(moveY) > Math.abs(moveX)) {
        drag.current = null;
        setDx(0);
        return;
      }
      if (Math.abs(moveX) < 8) return;
      current.locked = true;
    }
    setDx(
      Math.max(
        canDelete ? -110 : 0,
        Math.min(130, (revealed ? -88 : 0) + moveX),
      ),
    );
  }
  function up() {
    const current = drag.current;
    drag.current = null;
    if (!current || !current.locked) return;
    if (dx > 90) {
      onComplete(task, !task.done);
      setDx(0);
      setRevealed(false);
    } else if (canDelete && dx < -60) {
      setRevealed(true);
      setDx(-88);
    } else {
      setRevealed(false);
      setDx(0);
    }
  }
  return (
    <div className="task-swipe">
      <div className="swipe-bg swipe-bg-done" aria-hidden="true">
        <Check size={16} /> {task.done ? "Reopen" : "Done"}
      </div>
      {canDelete && (
        <button
          className="swipe-bg swipe-bg-delete"
          onClick={() => onDelete(task)}
          tabIndex={revealed ? 0 : -1}
        >
          <Trash2 size={16} /> Delete
        </button>
      )}
      <article
        className={`task-row priority-${task.priority} ${task.done ? "task-complete" : ""} ${justDone ? "task-pop" : ""} ${dx ? "dragging" : ""}`}
        style={
          dx
            ? { transform: `translateX(${dx}px)`, transition: "none" }
            : undefined
        }
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <button
          className={`task-check ${task.done ? "checked" : ""}`}
          aria-label={
            task.done ? `Reopen ${task.title}` : `Complete ${task.title}`
          }
          aria-pressed={task.done}
          onClick={() => onComplete(task, !task.done)}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              className="check-path"
              d="M3.5 8.5l3 3 6-6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {justDone && (
            <span className="spark-burst" aria-hidden="true">
              {Array.from({ length: 8 }, (_, index) => (
                <i key={index} style={{ "--a": `${index * 45}deg` }} />
              ))}
            </span>
          )}
        </button>
        <div className="task-main">
          <h3>
            {onEdit && !locked ? (
              <button className="task-title" onClick={() => onEdit(task)}>
                {task.title}
              </button>
            ) : (
              task.title
            )}
          </h3>
          <div className="task-meta">
            <span className="task-cat" data-cat={categorySlug(task.category)}>
              {task.category}
            </span>
            <span className={`due ${due.tone}`}>{due.text}</span>
            {task.priority === "high" && !task.done && (
              <span className="meta-flag">
                <Flag size={12} /> High
              </span>
            )}
            {task.groupIds?.length > 0 && (
              <span className="meta-icon" title="Shared with a circle">
                <Users size={12} />
                <span className="sr-only">Shared with a circle</span>
              </span>
            )}
            {task.repeat && task.repeat !== "none" && (
              <span className="meta-icon" title="Repeats">
                <Repeat size={12} />
                <span className="sr-only">Repeats</span>
              </span>
            )}
            {locked && (
              <span className="meta-assigned">
                Assigned by {task.assignedByName || "your circle owner"}
              </span>
            )}
          </div>
        </div>
        <div className="task-side">
          <div className="task-actions">
            {onEdit && !locked && (
              <button
                className="icon-quiet task-action"
                onClick={() => onEdit(task)}
                aria-label="Edit task"
              >
                <Pencil size={14} />
              </button>
            )}
            {canDelete && (
              <button
                className="icon-quiet task-action"
                onClick={() => onDelete(task)}
                aria-label="Delete task"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          {!task.done &&
            onTimer &&
            (running ? (
              <button
                className="focus-chip running"
                onClick={() => onTimer(task, "stop")}
                aria-label="Pause focus"
              >
                <Pause size={13} />
                <RunningReadout task={task} />
              </button>
            ) : (
              <button
                className="focus-chip"
                onClick={() => onTimer(task, "start")}
                aria-label={`Start focus, ${formatMinutes(task.targetMinutes)}`}
              >
                <Play size={13} />
                {task.elapsedSeconds > 0
                  ? `${formatMinutes(Math.ceil(left / 60))} left`
                  : formatMinutes(task.targetMinutes)}
              </button>
            ))}
        </div>
      </article>
    </div>
  );
});

function EmptyTasks({
  onCreate,
  title = "Start with one thing.",
  compact = false,
}) {
  return (
    <div className={`empty-tasks ${compact ? "empty-compact" : ""}`}>
      <span className="empty-spark">✳</span>
      <h3>{title}</h3>
      <p>
        Add a task when you’re ready. You can keep it private or share it with
        friends.
      </p>
      <button className="text-link" onClick={onCreate}>
        <Plus size={15} /> Create a task
      </button>
    </div>
  );
}

function CirclesPage({
  groups,
  activeGroup,
  onSelect,
  sharedTasks,
  friends,
  onShareTask,
  query,
  setQuery,
  results,
  inviteLink,
  profile,
  user,
  onAdd,
  onInvite,
  onOpen,
  onCloseProfile,
  onCreateCircle,
  onAddMember,
  onCreateInvite,
  onCopyInvite,
  onCreateTask,
  onOpenChat,
  recap,
  onNudge,
  onRevokeInvite,
  earlierCount = 0,
  onLeave,
  assignments = [],
  onAssign,
  onDeleteAssignment,
  onSetAdmin,
  onRemoveMember,
  onWeeklyReport,
}) {
  const myRole =
    activeGroup?.myRole ||
    (activeGroup?.ownerId === user.id ? "owner" : "member");
  const canManage = myRole === "owner" || myRole === "admin";
  const memberTaskGroups = (activeGroup?.members || []).map((member) => {
    const memberTasks = sharedTasks.filter(
      (task) => task.ownerId === member.id,
    );
    const done = memberTasks.filter((task) => task.done).length;
    return {
      member,
      tasks: memberTasks,
      done,
      percent: memberTasks.length
        ? Math.round((done / memberTasks.length) * 100)
        : 0,
    };
  });
  if (profile)
    return (
      <div className="page-content">
        <button className="back-link" onClick={onCloseProfile}>
          <ArrowLeft size={15} /> Circles
        </button>
        <section className="profile-panel friend-profile-panel">
          <Avatar name={profile.name} index={1} large avatar={profile.avatar} />
          <div className="profile-copy">
            <p className="eyebrow">YOUR PEOPLE</p>
            <h1>{profile.name}</h1>
            <p>{profile.bio || "Keeping things moving, one task at a time."}</p>
            <small>{profile.friendCount} friends</small>
          </div>
        </section>
        <section className="profile-shared">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">LEGACY FRIEND SHARES</p>
              <h2>Tasks</h2>
            </div>
          </div>
          {profile.tasks?.length ? (
            <div className="task-list">
              {profile.tasks.map((task, index) => (
                <article
                  className={`shared-task-row ${task.done ? "task-complete" : ""}`}
                  key={`${task.title}-${index}`}
                >
                  <span className={`task-check ${task.done ? "checked" : ""}`}>
                    {task.done && <Check size={14} />}
                  </span>
                  <div>
                    <h3>{task.title}</h3>
                    <p>
                      {task.category} <span>·</span> {dayLabel(task.dueDate)}
                      {task.done && <b> · Done</b>}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="quiet-empty">
              No friend-shared tasks. Circle tasks are shared with their
              members.
            </p>
          )}
        </section>
      </div>
    );
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="YOUR PEOPLE, YOUR SPACE"
        title="Circles"
        description="Create a circle, invite friends, share tasks, and follow progress together."
        action={
          <button className="button button-primary" onClick={onCreateCircle}>
            <Plus size={16} /> Create circle
          </button>
        }
      />
      <label className="search-box">
        <Search size={17} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="email"
          placeholder="Find someone by email"
          autoComplete="off"
        />
      </label>
      {query.trim().length >= 2 && (
        <section className="search-results">
          <p className="eyebrow">PEOPLE</p>
          {results.length ? (
            results.map((person, index) => {
              const isMember = activeGroup?.members?.some(
                (member) => member.id === person.id,
              );
              return (
                <div className="friend-card search-person" key={person.id}>
                  <Avatar
                    name={person.name}
                    index={index}
                    avatar={person.avatar}
                  />
                  <button
                    className="friend-person-name"
                    onClick={() => person.isFriend && onOpen(person)}
                  >
                    <b>{person.name}</b>
                    <small>{person.bio || "Kinda member"}</small>
                  </button>
                  {person.isFriend ? (
                    <button
                      className="button button-secondary small-button"
                      disabled={!activeGroup || isMember || !canManage}
                      onClick={() => onAddMember(activeGroup, person)}
                    >
                      {isMember ? "In circle" : "Add to circle"}
                    </button>
                  ) : (
                    <button
                      className="button button-secondary small-button"
                      onClick={() => onAdd({ friendId: person.id })}
                    >
                      Add friend
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="quiet-empty">
              <p>No account found for this exact email.</p>
              {query.includes("@") && (
                <button className="text-link" onClick={() => onAdd(query.trim())}>
                  Add this email as a friend
                </button>
              )}
            </div>
          )}
        </section>
      )}
      <section className="circles-directory friends-directory">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">YOUR PEOPLE</p>
            <h2>{friends.length ? `${friends.length} friends` : "Your friends"}</h2>
          </div>
          <button className="button button-secondary small-button" onClick={onInvite}>
            <Plus size={14} /> Add a friend
          </button>
        </div>
        {friends.length ? (
          <div className="friend-list">
            {friends.map((friend, index) => (
              <article className="friend-card" key={friend.id}>
                <Avatar name={friend.name} index={index} avatar={friend.avatar} />
                <button className="friend-person-name" onClick={() => onOpen(friend)}>
                  <b>{friend.name}</b>
                  <small>{friend.email}</small>
                </button>
                <button className="button button-secondary small-button" onClick={() => onShareTask(friend)}>
                  Share a task
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="quiet-empty">Add a friend to share tasks with them directly.</p>
        )}
      </section>
      <section className="circles-directory">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">YOUR CIRCLES</p>
            <h2>
              {groups.length
                ? `${groups.length} ${groups.length === 1 ? "circle" : "circles"}`
                : "Start a circle"}
            </h2>
          </div>
        </div>
        {groups.length ? (
          <div className="circles-layout">
            <div className="circles-list">
              {groups.map((group, index) => (
                <button
                  className={`circle-tile ${activeGroup?.id === group.id ? "selected" : ""}`}
                  key={group.id}
                  onClick={() => onSelect(group)}
                >
                  <Avatar name={group.name} index={index} />
                  <span>
                    <b>{group.name}</b>
                    <small>
                      {group.memberCount}{" "}
                      {group.memberCount === 1 ? "member" : "members"} ·{" "}
                      {group.taskCount}{" "}
                      {group.taskCount === 1 ? "task" : "tasks"}
                    </small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
            {activeGroup && (
              <section className="circle-detail">
                <div className="circle-detail-heading">
                  <div>
                    <p className="eyebrow">YOUR CIRCLE</p>
                    <h2>{activeGroup.name}</h2>
                    <p>{activeGroup.memberNames}</p>
                  </div>
                  <div className="circle-detail-actions">
                    <button
                      className="button button-secondary small-button"
                      onClick={onOpenChat}
                    >
                      <MessageCircle size={14} /> Group chat
                    </button>
                    <button
                      className="button button-primary small-button"
                      onClick={onCreateTask}
                    >
                      <Plus size={14} /> Post a task
                    </button>
                    {canManage && (
                      <button
                        className="button button-secondary small-button"
                        onClick={() => onWeeklyReport(activeGroup)}
                      >
                        <FileText size={14} /> Weekly report
                      </button>
                    )}
                    <button
                      className="button button-secondary small-button danger-button"
                      onClick={() => onLeave(activeGroup)}
                    >
                      <LogOut size={14} /> Leave
                    </button>
                  </div>
                </div>
                <div className="circle-progress">
                  {earlierCount > 0 && (
                    <small className="quiet-note">
                      Showing today only · {earlierCount} from earlier days
                      hidden
                    </small>
                  )}
                  <div>
                    <b>
                      {sharedTasks.filter((task) => task.done).length} of{" "}
                      {sharedTasks.length} tasks done
                    </b>
                    <span>
                      {sharedTasks.length
                        ? Math.round(
                            (sharedTasks.filter((task) => task.done).length /
                              sharedTasks.length) *
                              100,
                          )
                        : 0}
                      %
                    </span>
                  </div>
                  <div className="summary-progress">
                    <span
                      style={{
                        width: `${sharedTasks.length ? (sharedTasks.filter((task) => task.done).length / sharedTasks.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                {recap && (
                  <div className="circle-recap">
                    <p className="eyebrow">THIS WEEK</p>
                    <b>
                      {recap.total} {recap.total === 1 ? "task" : "tasks"}{" "}
                      finished together
                    </b>
                    {recap.top && (
                      <span>
                        <Flame size={13} /> {recap.top.name} led with{" "}
                        {recap.top.completed}
                      </span>
                    )}
                    <div className="recap-members">
                      {recap.members.map((member) => (
                        <span key={member.id}>
                          <Avatar name={member.name} avatar={member.avatar} />
                          {member.completed}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <AssignmentsSection
                  assignments={assignments}
                  canManage={canManage}
                  onAssign={onAssign}
                  onDelete={onDeleteAssignment}
                />
                <GroupLeaderboard group={activeGroup} userId={user.id} />
                <div className="circle-members">
                  <div className="section-title-row">
                    <div>
                      <p className="eyebrow">THE PEOPLE</p>
                      <h3>Members</h3>
                    </div>
                    <span>{activeGroup.memberCount}</span>
                  </div>
                  <div className="circle-member-list">
                    {activeGroup.members?.map((member, index) => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        index={index}
                        you={member.id === user.id}
                        myRole={myRole}
                        onSetAdmin={(admin) =>
                          onSetAdmin(activeGroup, member, admin)
                        }
                        onRemove={() => onRemoveMember(activeGroup, member)}
                      />
                    ))}
                  </div>
                  {canManage && (
                    <div className="circle-invite">
                      <p>
                        Invite existing members directly, or send this link to
                        anyone—even before they create an account. Links expire
                        after 7 days.
                      </p>
                      <div>
                        {friends
                          .filter(
                            (friend) =>
                              !activeGroup.members?.some(
                                (member) => member.id === friend.id,
                              ),
                          )
                          .map((friend, index) => (
                            <button
                              className="button button-secondary small-button"
                              key={friend.id}
                              onClick={() => onAddMember(activeGroup, friend)}
                            >
                              <Plus size={13} />
                              {friend.name}
                            </button>
                          ))}
                        <button className="text-link" onClick={onInvite}>
                          <Plus size={14} /> Find people
                        </button>
                        <button
                          className="button button-secondary small-button"
                          onClick={() => onCreateInvite(activeGroup)}
                        >
                          <Plus size={13} />
                          {inviteLink
                            ? "Replace invite link"
                            : "Create invite link"}
                        </button>
                      </div>
                      {inviteLink && (
                        <div className="circle-invite-link">
                          <input
                            aria-label="Circle invite link"
                            readOnly
                            value={inviteLink}
                          />
                          <button
                            className="button button-primary small-button"
                            onClick={() => onCopyInvite(activeGroup)}
                          >
                            Copy link
                          </button>
                          <a
                            className="button button-secondary small-button"
                            href={socialShareUrl(
                              "whatsapp",
                              `Join ${activeGroup.name} on Kinda`,
                              inviteLink,
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            WhatsApp
                          </a>
                          <a
                            className="button button-secondary small-button"
                            href={socialShareUrl(
                              "x",
                              `Join my Kinda circle: ${activeGroup.name}`,
                              inviteLink,
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            X
                          </a>
                          <button
                            className="button button-secondary small-button"
                            onClick={() => onRevokeInvite(activeGroup)}
                          >
                            Revoke
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="circle-tasks">
                  <div className="section-title-row">
                    <div>
                      <p className="eyebrow">SHARED PROGRESS</p>
                      <h3>Tasks by member</h3>
                    </div>
                    <span>{sharedTasks.length}</span>
                  </div>
                  {memberTaskGroups.length ? (
                    <div className="member-task-groups">
                      {memberTaskGroups.map(
                        ({ member, tasks: memberTasks, done, percent }) => (
                          <section
                            className="member-task-group"
                            key={member.id}
                          >
                            <div className="member-progress-heading">
                              <span>
                                <Avatar
                                  name={member.name}
                                  avatar={member.avatar}
                                />
                                <b>{member.name}</b>
                                {member.id === user.id && <small>You</small>}
                              </span>
                              <strong>
                                {done}/{memberTasks.length} done · {percent}%
                              </strong>
                            </div>
                            <div className="summary-progress">
                              <span style={{ width: `${percent}%` }} />
                            </div>
                            {memberTasks.length ? (
                              <div className="task-list">
                                {memberTasks.map((task) => (
                                  <article
                                    className={`shared-task-row ${task.done ? "task-complete" : ""}`}
                                    key={`${task.ownerId}-${task.id}`}
                                  >
                                    <span
                                      className={`task-check ${task.done ? "checked" : ""}`}
                                    >
                                      {task.done && <Check size={14} />}
                                    </span>
                                    <div>
                                      <h4>{task.title}</h4>
                                      <p>
                                        {task.category} ·{" "}
                                        {dayLabel(task.dueDate)}
                                        {task.done && <b> · Done</b>}
                                      </p>
                                    </div>
                                    {task.ownerId !== user.id &&
                                      !task.done &&
                                      task.dueDate &&
                                      task.dueDate < localDate() && (
                                        <button
                                          className="nudge-button"
                                          onClick={() => onNudge(task)}
                                        >
                                          <Bell size={13} /> Nudge
                                        </button>
                                      )}
                                  </article>
                                ))}
                              </div>
                            ) : (
                              <p className="quiet-empty">
                                No tasks shared by this member yet.
                              </p>
                            )}
                          </section>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="quiet-empty">
                      No tasks shared here yet. Post one to get started.
                    </p>
                  )}
                </div>
              </section>
            )}
          </div>
        ) : (
          <p className="quiet-empty">
            Create a circle to share tasks and progress with your people.
          </p>
        )}
      </section>
    </div>
  );
}

function MemberRow({ member, index, you, myRole, onSetAdmin, onRemove }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const isOwnerRow = member.role === "owner";
  const canPromote = myRole === "owner" && !you && !isOwnerRow;
  const canRemove =
    !you &&
    !isOwnerRow &&
    (myRole === "owner" || (myRole === "admin" && member.role !== "admin"));
  return (
    <div className="circle-member" ref={box}>
      <Avatar name={member.name} index={index} avatar={member.avatar} />
      <span className="circle-member-name">
        {member.name}
        {you ? " (you)" : ""}
      </span>
      {isOwnerRow && <small className="role-badge owner">Owner</small>}
      {member.role === "admin" && (
        <small className="role-badge">
          <Shield size={11} /> Admin
        </small>
      )}
      {(canPromote || canRemove) && (
        <span className="member-menu">
          <button
            className="icon-quiet"
            aria-label={`Manage ${member.name}`}
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen((value) => !value)}
          >
            <MoreHorizontal size={16} />
          </button>
          {open && (
            <div className="member-menu-list" role="menu">
              {canPromote && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onSetAdmin(member.role !== "admin");
                  }}
                >
                  {member.role === "admin" ? "Remove admin" : "Make admin"}
                </button>
              )}
              {canRemove && (
                <button
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    setOpen(false);
                    onRemove();
                  }}
                >
                  Remove from circle
                </button>
              )}
            </div>
          )}
        </span>
      )}
    </div>
  );
}

function AssignmentsSection({ assignments, canManage, onAssign, onDelete }) {
  return (
    <section
      className="assignments"
      aria-label="Tasks assigned to the whole circle"
    >
      <div className="section-title-row">
        <div>
          <p className="eyebrow">For everyone</p>
          <h3>Circle tasks</h3>
        </div>
        {canManage && (
          <button
            className="button button-secondary small-button"
            onClick={onAssign}
          >
            <Plus size={14} /> Assign a task
          </button>
        )}
      </div>
      {assignments.length ? (
        <div className="assignment-list">
          {assignments.map((item) => {
            const percent = item.total
              ? Math.round((item.doneCount / item.total) * 100)
              : 0;
            return (
              <article className="assignment" key={item.id}>
                <div className="assignment-head">
                  <div>
                    <h4>{item.title}</h4>
                    <p>
                      {item.category} · {dayLabel(item.dueDate)} · Assigned by{" "}
                      {item.createdByName}
                    </p>
                  </div>
                  {canManage ? (
                    <button
                      className="icon-quiet"
                      onClick={() => onDelete(item)}
                      aria-label={`Remove ${item.title}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : (
                    item.mineDone !== null && (
                      <span
                        className={`assignment-state ${item.mineDone ? "done" : ""}`}
                      >
                        {item.mineDone ? "You finished this" : "On your list"}
                      </span>
                    )
                  )}
                </div>
                {item.description && (
                  <p className="assignment-note">{item.description}</p>
                )}
                <div className="assignment-progress">
                  <span>
                    {item.doneCount} of {item.total} done
                  </span>
                  <div className="summary-progress">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </div>
                {canManage && item.members.length > 0 && (
                  <ul className="assignment-members">
                    {item.members.map((member) => (
                      <li key={member.id} className={member.done ? "done" : ""}>
                        <Avatar name={member.name} avatar={member.avatar} />
                        <span>{member.name}</span>
                        <b>{member.done ? "Done" : "Not yet"}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="quiet-empty">
          {canManage
            ? "Assign one task to everyone in this circle, then see who has finished it."
            : "Your circle owner has not assigned any tasks yet."}
        </p>
      )}
    </section>
  );
}

function AssignDialog({ group, userId, onClose, onSubmit }) {
  const members = group.members || [];
  const [submitting, setSubmitting] = useState(false);
  const [more, setMore] = useState(false);
  const [mode, setMode] = useState("everyone");
  const [picked, setPicked] = useState([]);
  const everyone = members.filter((member) => member.id !== userId).length;
  const count = mode === "everyone" ? everyone : picked.length;
  const toggle = (id) =>
    setPicked((list) =>
      list.includes(id) ? list.filter((item) => item !== id) : [...list, id],
    );
  const submit = async (event) => {
    setSubmitting(true);
    try {
      await onSubmit(event);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Modal
      title="Assign a task"
      subtitle={`It will appear on the chosen members' lists in ${group.name}, and you can track who finishes it.`}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        <label>
          Task
          <input
            name="title"
            autoFocus
            placeholder="What needs doing?"
            required
            maxLength="120"
          />
        </label>
        <fieldset className="assign-audience">
          <legend>Who is it for?</legend>
          <label className="audience-option">
            <input
              type="radio"
              name="audience"
              value="everyone"
              checked={mode === "everyone"}
              onChange={() => setMode("everyone")}
            />
            <span>
              <b>Everyone</b>
              <small>
                {everyone} {everyone === 1 ? "member" : "members"}
              </small>
            </span>
          </label>
          <label className="audience-option">
            <input
              type="radio"
              name="audience"
              value="choose"
              checked={mode === "choose"}
              onChange={() => setMode("choose")}
            />
            <span>
              <b>Choose people</b>
              <small>Pick one or more members</small>
            </span>
          </label>
          {mode === "choose" && (
            <div className="audience-list">
              {members.map((member) => (
                <label className="audience-person" key={member.id}>
                  <input
                    type="checkbox"
                    name="assigneeIds"
                    value={member.id}
                    checked={picked.includes(member.id)}
                    onChange={() => toggle(member.id)}
                  />
                  <Avatar name={member.name} avatar={member.avatar} />
                  <span>
                    {member.name}
                    {member.id === userId ? " (you)" : ""}
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <div className="form-grid">
          <label>
            Due date
            <input name="dueDate" type="date" defaultValue={localDate()} />
          </label>
          <label>
            Priority
            <select name="priority" defaultValue="normal">
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          className="more-toggle"
          aria-expanded={more}
          onClick={() => setMore((value) => !value)}
        >
          <ChevronDown size={15} className={more ? "open" : ""} />{" "}
          {more ? "Fewer options" : "More options"}
          <small>Details, category, focus time</small>
        </button>
        <div className="more-fields" hidden={!more}>
          <label>
            Details <span className="optional-label">Optional</span>
            <textarea
              name="description"
              rows="2"
              maxLength="500"
              placeholder="Anything they need to know"
            />
          </label>
          <div className="form-grid">
            <label>
              Category
              <select name="category" defaultValue="Personal">
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
          </div>
          <FocusTimeField defaultValue={25} />
        </div>
        {mode === "everyone" && (
          <label className="check-line">
            <input type="checkbox" name="includeSelf" />{" "}
            <span>Add it to my list too</span>
          </label>
        )}
        <button
          className="button button-primary full-button"
          type="submit"
          disabled={count === 0 || submitting}
        >
          {submitting ? "Assigning…" : `Assign to ${count} ${count === 1 ? "person" : "people"}`}{" "}
          {!submitting && <ArrowRight size={15} />}
        </button>
      </form>
    </Modal>
  );
}

function ActivityPage({ activity, nudges = [], userId, onReact, onFindPeople }) {
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="GOOD THINGS, NOT SCORES"
        title="Activity"
        description="A quiet look at what your friends are working on."
      />
      {nudges.length > 0 && (
        <section className="nudge-list">
          <p className="eyebrow">GENTLE NUDGES</p>
          {nudges.slice(0, 5).map((nudge) => (
            <article
              className={`nudge-item ${nudge.seen ? "" : "nudge-new"}`}
              key={nudge.id}
            >
              <Avatar name={nudge.fromName} avatar={nudge.fromAvatar} />
              <p>
                <b>{nudge.fromName}</b> nudged you about{" "}
                <strong>{nudge.taskTitle}</strong>
              </p>
              <small>{dateTime(nudge.createdAt)}</small>
            </article>
          ))}
        </section>
      )}
      {activity.length ? (
        <ActivityList items={activity} userId={userId} onReact={onReact} />
      ) : (
        nudges.length === 0 && (
          <div className="page-empty">
            <Heart size={22} />
            <h2>Nothing new just yet.</h2>
            <p>
              Add friends, then set a task to “Friends” when you create it. Shared
              tasks and completions will show up here.
            </p>
            <button className="button button-primary" onClick={onFindPeople}>
              <Users size={15} /> Find people
            </button>
          </div>
        )
      )}
    </div>
  );
}

const reactionOptions = ["❤️", "🔥", "👏", "🎉", "💪"];

function ReactionPicker({ onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="reaction-picker">
      <button
        className="reaction-chip reaction-add"
        onClick={() => setOpen((value) => !value)}
        aria-label="Add reaction"
        aria-expanded={open}
      >
        <Plus size={13} />
      </button>
      {open && (
        <span className="reaction-options">
          {reactionOptions.map((emoji) => (
            <button
              key={emoji}
              className="reaction-chip"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              aria-label={`React ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function ActivityList({ items, userId, onReact, compact = false }) {
  return (
    <div className={`activity-list ${compact ? "activity-list-compact" : ""}`}>
      {items.map((item, index) => (
        <article className="activity-item" key={item.id}>
          <Avatar
            name={item.actorName}
            index={index}
            avatar={item.actorAvatar}
          />
          <div className="activity-copy">
            <p>
              <b>{item.actorId === userId ? "You" : item.actorName}</b>{" "}
              {item.type === "completed" ? "completed" : "added a task"}{" "}
              <strong>{item.taskTitle}</strong>
            </p>
            <small>{dateTime(item.createdAt)}</small>
            <div className="reaction-bar">
              {(item.reactions || []).map((reaction) => (
                <button
                  key={reaction.emoji}
                  className={`reaction-chip ${reaction.mine ? "reacted" : ""}`}
                  onClick={() => onReact(item, reaction.emoji)}
                  aria-label={`${reaction.emoji} ${reaction.count}`}
                >
                  {reaction.emoji}
                  <span>{reaction.count}</span>
                </button>
              ))}
              <ReactionPicker onPick={(emoji) => onReact(item, emoji)} />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function EmojiPicker({ onPick }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const [recent, setRecent] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("kinda:recent-emoji") || "[]");
    } catch {
      return [];
    }
  });
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const groups = recent.length
    ? [{ name: "Recent", icon: "🕘", emojis: recent }, ...emojiGroups]
    : emojiGroups;
  function pick(emoji) {
    onPick(emoji);
    const next = [emoji, ...recent.filter((item) => item !== emoji)].slice(
      0,
      16,
    );
    setRecent(next);
    try {
      localStorage.setItem("kinda:recent-emoji", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="emoji-picker" ref={box}>
      <button
        type="button"
        className="icon-quiet emoji-toggle"
        aria-label="Add emoji"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setTab(0);
        }}
      >
        <Smile size={19} />
      </button>
      {open && (
        <div className="emoji-popover" role="dialog" aria-label="Emoji picker">
          <div className="emoji-tabs" role="tablist">
            {groups.map((group, index) => (
              <button
                type="button"
                role="tab"
                aria-selected={index === tab}
                aria-label={group.name}
                title={group.name}
                key={group.name}
                className={index === tab ? "active" : ""}
                onClick={() => setTab(index)}
              >
                {group.icon}
              </button>
            ))}
          </div>
          <div className="emoji-grid">
            {(groups[tab] || groups[0]).emojis.map((emoji) => (
              <button type="button" key={emoji} onClick={() => pick(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatPage({
  groups,
  activeGroup,
  setActiveGroup,
  messages,
  sharedTasks,
  user,
  value,
  setValue,
  onSend,
  sending,
  mobileOpen,
  onMobileBack,
  onInvite,
  typingNames = [],
  replyTo,
  onReply,
  onCancelReply,
  onEdit,
  onDelete,
  onTyping,
  dividerTime,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const composeRef = useRef(null);
  const messagesRef = useRef(null);
  const stickRef = useRef(true);
  const lastMessage = messages[messages.length - 1];
  // Opening a chat (or switching circles) jumps straight to the newest message; after that the view only follows
  // new messages while you are already near the bottom, or when the new message is yours.
  useLayoutEffect(() => {
    stickRef.current = true;
  }, [activeGroup?.id, mobileOpen]);
  useLayoutEffect(() => {
    const node = messagesRef.current;
    if (!node || !(stickRef.current || lastMessage?.senderId === user.id))
      return undefined;
    node.scrollTop = node.scrollHeight;
    const frame = window.requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    messages.length,
    lastMessage?.id,
    activeGroup?.id,
    mobileOpen,
    dividerTime,
  ]);
  // Things that appear a moment later (the "new messages" line, emoji, avatars) must not leave the view short of the bottom.
  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return undefined;
    const observer = new MutationObserver(() => {
      if (stickRef.current) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [activeGroup?.id, mobileOpen]);
  function onMessagesScroll(event) {
    const node = event.currentTarget;
    stickRef.current =
      node.scrollHeight - node.scrollTop - node.clientHeight < 140;
  }
  function insertEmoji(emoji) {
    const input = composeRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    setValue(value.slice(0, start) + emoji + value.slice(end));
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }
  const dividerIndex =
    dividerTime === null || dividerTime === undefined
      ? -1
      : messages.findIndex(
          (message) =>
            message.senderId !== user.id && message.createdAt > dividerTime,
        );
  const members = activeGroup?.members || [];
  const mentionMatch = value.match(/(^|\s)@([^\s@]*)$/);
  const suggestions = mentionMatch
    ? members
        .filter(
          (member) =>
            member.id !== user.id &&
            member.name.toLowerCase().includes(mentionMatch[2].toLowerCase()),
        )
        .slice(0, 5)
    : [];
  return (
    <div className="page-content chat-page">
      <PageHeader
        eyebrow="A LITTLE ENCOURAGEMENT"
        title="Circle chat"
        description="Every member of a circle shares one group conversation."
      />
      <div className={`chat-layout ${mobileOpen ? "chat-open" : ""}`}>
        <aside className="conversation-list">
          <div className="conversation-heading">
            <h2>Your circles</h2>
            <button
              className="icon-quiet"
              onClick={onInvite}
              aria-label="Create circle"
            >
              <Plus size={16} />
            </button>
          </div>
          {groups.length ? (
            groups.map((group, index) => (
              <button
                key={group.id}
                className={`conversation-item ${activeGroup?.id === group.id ? "selected" : ""}`}
                onClick={() => setActiveGroup(group)}
              >
                <Avatar name={group.name} index={index} />
                <span>
                  <b>{group.name}</b>
                  <small>{group.memberNames}</small>
                </span>
              </button>
            ))
          ) : (
            <div className="conversation-empty">
              <p>Your chats start with a circle.</p>
              <button className="text-link" onClick={onInvite}>
                <Plus size={14} /> Create circle
              </button>
            </div>
          )}
        </aside>
        <section className="chat-conversation">
          {activeGroup ? (
            <>
              <header className="chat-header">
                <button
                  className="mobile-back"
                  onClick={onMobileBack}
                  aria-label="Back to circles"
                >
                  <ArrowLeft size={18} />
                </button>
                <Avatar name={activeGroup.name} />
                <div>
                  <h2>{activeGroup.name}</h2>
                  <small>
                    {activeGroup.memberCount} members · one group chat
                  </small>
                </div>
              </header>
              <div className="chat-shared-tasks">
                {sharedTasks.slice(0, 3).map((task) => (
                  <span key={`${task.ownerId}-${task.id}`}>
                    <CheckSquare2 size={12} />
                    {task.ownerName}: {task.title}
                  </span>
                ))}
              </div>
              <div
                className="chat-messages"
                aria-live="polite"
                ref={messagesRef}
                onScroll={onMessagesScroll}
              >
                {messages.length ? (
                  messages.map((message, index) => {
                    const mine = message.senderId === user.id;
                    const previous = messages[index - 1];
                    const grouped =
                      previous &&
                      previous.senderId === message.senderId &&
                      index !== dividerIndex &&
                      Date.parse(message.createdAt) -
                        Date.parse(previous.createdAt) <
                        5 * 60 * 1000;
                    const mentionsMe = (message.mentions || []).includes(
                      user.id,
                    );
                    return (
                      <React.Fragment key={message.id}>
                        {index === dividerIndex && (
                          <div className="chat-divider">
                            <span>New messages</span>
                          </div>
                        )}
                        <article
                          className={`chat-message ${mine ? "chat-mine" : ""} ${grouped ? "chat-grouped" : ""} ${mentionsMe ? "mentions-me" : ""}`}
                        >
                          {grouped ? (
                            <span className="avatar-spacer" />
                          ) : (
                            <Avatar
                              name={message.senderName}
                              avatar={message.senderAvatar}
                            />
                          )}
                          <div className="message-body">
                            {!grouped && (
                              <b>{mine ? "You" : message.senderName}</b>
                            )}
                            <div className="message-bubble">
                              {message.replyTo && (
                                <blockquote className="message-reply">
                                  <b>{message.replyTo.senderName}</b>
                                  <span>{message.replyTo.content}</span>
                                </blockquote>
                              )}
                              {editingId === message.id ? (
                                <form
                                  className="message-edit"
                                  onSubmit={async (event) => {
                                    event.preventDefault();
                                    if (editValue.trim()) {
                                      await onEdit(message, editValue);
                                      setEditingId(null);
                                    }
                                  }}
                                >
                                  <input
                                    value={editValue}
                                    onChange={(event) =>
                                      setEditValue(event.target.value)
                                    }
                                    maxLength={1000}
                                    autoFocus
                                    aria-label="Edit message"
                                  />
                                  <button className="text-link" type="submit">
                                    Save
                                  </button>
                                  <button
                                    className="text-link"
                                    type="button"
                                    onClick={() => setEditingId(null)}
                                  >
                                    Cancel
                                  </button>
                                </form>
                              ) : (
                                <p>
                                  {renderMessageContent(
                                    message.content,
                                    members,
                                    user.id,
                                  )}
                                </p>
                              )}
                            </div>
                            <small>
                              {dateTime(message.createdAt)}
                              {message.edited && " · edited"}
                            </small>
                            <div className="message-actions">
                              <button
                                onClick={() => onReply(message)}
                                aria-label="Reply"
                              >
                                <CornerUpLeft size={13} />
                              </button>
                              {mine && (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingId(message.id);
                                      setEditValue(message.content);
                                    }}
                                    aria-label="Edit message"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    onClick={() => onDelete(message)}
                                    aria-label="Delete message"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </article>
                      </React.Fragment>
                    );
                  })
                ) : (
                  <div className="chat-empty">
                    <MessageCircle size={22} />
                    <h3>A fresh conversation.</h3>
                    <p>
                      Say hello, share a little progress, or send some
                      encouragement. Type @ to mention someone.
                    </p>
                  </div>
                )}
              </div>
              <div className="typing-indicator" aria-live="polite">
                {typingNames.length > 0 &&
                  `${typingNames.join(", ")} ${typingNames.length > 1 ? "are" : "is"} typing…`}
              </div>
              {replyTo && (
                <div className="reply-bar">
                  <span>
                    Replying to <b>{replyTo.senderName}</b>:{" "}
                    {replyTo.content.slice(0, 70)}
                  </span>
                  <button
                    type="button"
                    onClick={onCancelReply}
                    aria-label="Cancel reply"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {suggestions.length > 0 && (
                <div
                  className="mention-list"
                  role="listbox"
                  aria-label="Mention someone"
                >
                  {suggestions.map((member) => (
                    <button
                      type="button"
                      role="option"
                      key={member.id}
                      onClick={() =>
                        setValue(
                          value.replace(
                            /(^|\s)@([^\s@]*)$/,
                            `$1@${member.name} `,
                          ),
                        )
                      }
                    >
                      <Avatar name={member.name} avatar={member.avatar} />
                      <span>{member.name}</span>
                    </button>
                  ))}
                </div>
              )}
              <form className="chat-compose" onSubmit={onSend}>
                <EmojiPicker onPick={insertEmoji} />
                <input
                  ref={composeRef}
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                    if (event.target.value) onTyping();
                  }}
                  placeholder="Write a message…"
                  aria-label="Write a message"
                  maxLength={1000}
                  disabled={sending}
                />
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={!value.trim() || sending}
                >
                  <Send size={15} />
                  <span>{sending ? "Sending…" : "Send"}</span>
                </button>
              </form>
            </>
          ) : (
            <div className="chat-empty chat-no-selection">
              <MessageCircle size={24} />
              <h3>Your people are one hello away.</h3>
              <p>
                Create a circle to give everyone in it one shared conversation.
              </p>
              <button className="button button-primary" onClick={onInvite}>
                <Plus size={15} /> Create circle
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ProfilePage({
  user,
  tasks,
  friends,
  editing,
  setEditing,
  onSave,
  onFriend,
}) {
  const done = tasks.filter((task) => task.done).length;
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="A LITTLE ABOUT YOU"
        title="Profile"
        description="Your details, your way."
        action={
          !editing && (
            <button
              className="button button-secondary"
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} /> Edit profile
            </button>
          )
        }
      />
      <section className="profile-panel">
        <Avatar name={user.name} index={-1} large avatar={user.avatar} />
        <div className="profile-copy">
          <h2>{user.name}</h2>
          <p>{user.bio || "A work in progress, task by task."}</p>
          <small>{user.email}</small>
        </div>
      </section>
      {editing && (
        <form className="profile-edit-form" onSubmit={onSave}>
          <AvatarPicker name={user.name} defaultValue={user.avatar} />
          <label>
            Display name
            <input
              name="name"
              defaultValue={user.name}
              required
              minLength="2"
              maxLength="60"
            />
          </label>
          <label>
            Short bio
            <textarea
              name="bio"
              defaultValue={user.bio || ""}
              maxLength="240"
              rows="3"
              placeholder="A few words about you"
            />
          </label>
          <div>
            <button className="button button-primary" type="submit">
              Save profile
            </button>
            <button
              className="text-link"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <section className="profile-progress">
        <div>
          <p className="eyebrow">YOUR TASKS</p>
          <h2>{done} completed</h2>
          <p>{tasks.length} total · visible only as you choose</p>
        </div>
        <div className="profile-friends">
          <p className="eyebrow">YOUR PEOPLE</p>
          {friends.length ? (
            <div className="avatar-stack">
              {friends.slice(0, 5).map((friend, index) => (
                <button
                  key={friend.id}
                  onClick={() => onFriend(friend)}
                  aria-label={`View ${friend.name}`}
                >
                  <Avatar
                    name={friend.name}
                    index={index}
                    avatar={friend.avatar}
                  />
                </button>
              ))}
            </div>
          ) : (
            <span>No people added yet</span>
          )}
        </div>
      </section>
      <section className="profile-shared">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">YOUR SHARED TASKS</p>
            <h2>Tasks in your circles</h2>
          </div>
        </div>
        {tasks.filter(
          (task) => task.groupIds?.length || task.visibility === "friends",
        ).length ? (
          <div className="task-list">
            {tasks
              .filter(
                (task) =>
                  task.groupIds?.length || task.visibility === "friends",
              )
              .map((task) => (
                <article
                  className={`shared-task-row ${task.done ? "task-complete" : ""}`}
                  key={task.id}
                >
                  <span className={`task-check ${task.done ? "checked" : ""}`}>
                    {task.done && <Check size={14} />}
                  </span>
                  <div>
                    <h3>{task.title}</h3>
                    <p>
                      {task.category} <span>·</span> {dayLabel(task.dueDate)}
                    </p>
                  </div>
                </article>
              ))}
          </div>
        ) : (
          <p className="quiet-empty">
            You haven’t shared any tasks. Everything else stays private.
          </p>
        )}
      </section>
    </div>
  );
}

function SettingsPage({
  user,
  api,
  onError,
  onSignOut,
  theme,
  setTheme,
  notifPermission,
  onEnableNotifications,
  onExport,
  onDelete,
  pushOn,
  onTogglePush,
  onWhatsNew,
  accent,
  setAccent,
}) {
  const { isIOS, standalone } = useInstall();
  const [confirmText, setConfirmText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [calendarToken, setCalendarToken] = useState("");
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [googleCalendar, setGoogleCalendar] = useState({
    connected: false,
    syncing: false,
    lastSyncAt: null,
    lastError: null,
  });
  const [integrationBusy, setIntegrationBusy] = useState(false);
  const calendarSite = import.meta.env.VITE_CONVEX_SITE_URL?.trim().replace(
    /\/+$/,
    "",
  );
  const calendarUrl =
    calendarToken && calendarSite
      ? `${calendarSite}/calendar/${calendarToken}.ics`
      : "";

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api("/calendar/feed"),
      api("/telegram/status"),
      api("/google-calendar/status"),
    ])
      .then(([feed, linked, google]) => {
        if (!cancelled) {
          setCalendarToken(feed?.token || "");
          setTelegramLinked(linked);
          setGoogleCalendar(google);
        }
      })
      .catch((error) => {
        if (!cancelled) onError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function connectGoogleCalendar() {
    setIntegrationBusy(true);
    try {
      const result = await api("/google-calendar/connect", {
        method: "POST",
        body: "{}",
      });
      window.location.assign(result.url);
    } catch (error) {
      onError(error.message);
      setIntegrationBusy(false);
    }
  }

  async function syncGoogleCalendar() {
    setIntegrationBusy(true);
    try {
      await api("/google-calendar/sync", { method: "POST", body: "{}" });
      setGoogleCalendar(await api("/google-calendar/status"));
    } catch (error) {
      onError(error.message);
    } finally {
      setIntegrationBusy(false);
    }
  }

  async function disconnectGoogleCalendar() {
    setIntegrationBusy(true);
    try {
      await api("/google-calendar", { method: "DELETE" });
      setGoogleCalendar({
        connected: false,
        syncing: false,
        lastSyncAt: null,
        lastError: null,
      });
    } catch (error) {
      onError(error.message);
    } finally {
      setIntegrationBusy(false);
    }
  }

  async function updateCalendarFeed(revoke = false) {
    setIntegrationBusy(true);
    try {
      if (revoke) {
        await api("/calendar/feed", { method: "DELETE" });
        setCalendarToken("");
      } else {
        const result = await api("/calendar/feed", {
          method: "POST",
          body: "{}",
        });
        setCalendarToken(result.token);
      }
    } catch (error) {
      onError(error.message);
    } finally {
      setIntegrationBusy(false);
    }
  }

  async function connectTelegram() {
    setIntegrationBusy(true);
    try {
      const result = await api("/telegram/link", {
        method: "POST",
        body: "{}",
      });
      window.location.assign(result.url);
    } catch (error) {
      onError(error.message);
      setIntegrationBusy(false);
    }
  }

  async function disconnectTelegram() {
    setIntegrationBusy(true);
    try {
      await api("/telegram/link", { method: "DELETE" });
      setTelegramLinked(false);
    } catch (error) {
      onError(error.message);
    } finally {
      setIntegrationBusy(false);
    }
  }

  async function refreshTelegramStatus() {
    try {
      setTelegramLinked(await api("/telegram/status"));
    } catch (error) {
      onError(error.message);
    }
  }

  return (
    <div className="page-content">
      <PageHeader
        eyebrow="YOUR SPACE"
        title="Settings"
        description="A few useful things about your account."
      />
      <section className="settings-section">
        <p className="eyebrow">ACCOUNT</p>
        <div className="settings-row">
          <span>
            <b>{user.name}</b>
            <small>{user.email}</small>
          </span>
          <span>Signed in</span>
        </div>
        <div className="settings-row">
          <span>
            <b>Private tasks</b>
            <small>
              Only you can see them. Circle-shared tasks are visible to that
              circle’s members.
            </small>
          </span>
          <span>
            <Heart size={16} />
          </span>
        </div>
      </section>
      <section className="settings-section">
        <p className="eyebrow">APPEARANCE</p>
        <div className="settings-row">
          <span>
            <b>Accent color</b>
            <small>Changes buttons, badges and highlights.</small>
          </span>
          <span
            className="accent-options"
            role="radiogroup"
            aria-label="Accent color"
          >
            {accents.map(([key, label, color]) => (
              <button
                key={key}
                role="radio"
                aria-checked={accent === key}
                aria-label={label}
                className={`accent-swatch ${accent === key ? "selected" : ""}`}
                style={{ background: color }}
                onClick={() => setAccent(key)}
              />
            ))}
          </span>
        </div>
        <div className="settings-row">
          <span>
            <b>Theme</b>
            <small>Follow your device, or pick one.</small>
          </span>
          <span className="theme-options" role="radiogroup" aria-label="Theme">
            {[
              ["system", "Auto", null],
              ["light", "Light", Sun],
              ["dark", "Dark", Moon],
            ].map(([value, label, Icon]) => (
              <button
                key={value}
                role="radio"
                aria-checked={theme === value}
                className={`theme-option ${theme === value ? "selected" : ""}`}
                onClick={() => setTheme(value)}
              >
                {Icon && <Icon size={13} />}
                {label}
              </button>
            ))}
          </span>
        </div>
      </section>
      <section className="settings-section">
        <p className="eyebrow">APP</p>
        <InstallCard variant="row" />
        <div className="settings-row">
          <span>
            <b>What’s new</b>
            <small>See the latest things we’ve added.</small>
          </span>
          <button
            className="button button-secondary small-button"
            onClick={onWhatsNew}
          >
            <Sparkles size={13} /> See
          </button>
        </div>
      </section>
      <section className="settings-section">
        <p className="eyebrow">CALENDAR</p>
        <div className="settings-row">
          <span>
            <b>Private task calendar</b>
            <small>
              Subscribe in Google Calendar, Apple Calendar, or Outlook. Anyone
              with this link can see your dated tasks.
            </small>
          </span>
          {calendarToken ? (
            <button
              className="button button-secondary small-button"
              disabled={integrationBusy}
              onClick={() => updateCalendarFeed(true)}
            >
              Revoke link
            </button>
          ) : (
            <button
              className="button button-secondary small-button"
              disabled={integrationBusy}
              onClick={() => updateCalendarFeed()}
            >
              <CalendarDays size={13} /> Create link
            </button>
          )}
        </div>
        {calendarUrl && (
          <div className="settings-row calendar-feed-row">
            <input
              aria-label="Private calendar feed URL"
              readOnly
              value={calendarUrl}
            />
            <button
              className="button button-primary small-button"
              onClick={() =>
                navigator.clipboard
                  .writeText(calendarUrl)
                  .then(() => onError("Calendar link copied."))
                  .catch(() => onError("Couldn't copy the calendar link."))
              }
            >
              Copy
            </button>
            <button
              className="button button-secondary small-button"
              disabled={integrationBusy}
              onClick={() => updateCalendarFeed()}
            >
              Regenerate
            </button>
          </div>
        )}
        {calendarToken && !calendarUrl && (
          <p className="settings-copy">
            Set VITE_CONVEX_SITE_URL in the frontend environment to display the
            subscription link.
          </p>
        )}
      </section>
      <section className="settings-section">
        <p className="eyebrow">GOOGLE CALENDAR SYNC</p>
        <div className="settings-row">
          <span>
            <b>
              {googleCalendar.connected
                ? "Kinda tasks only"
                : "Connect Google Calendar"}
            </b>
            <small>
              {googleCalendar.lastError ||
                (googleCalendar.syncing
                  ? "Syncing your Kinda tasks…"
                  : googleCalendar.lastSyncAt
                    ? `Last synced ${new Date(googleCalendar.lastSyncAt).toLocaleString()}. Only tasks created in Kinda are synced.`
                    : "Two-way sync for tasks created in Kinda. Other Google Calendar events are never imported.")}
            </small>
          </span>
          {googleCalendar.connected ? (
            <>
              <button
                className="button button-secondary small-button"
                disabled={integrationBusy || googleCalendar.syncing}
                onClick={syncGoogleCalendar}
              >
                Sync now
              </button>
              <button
                className="button button-secondary small-button"
                disabled={integrationBusy}
                onClick={disconnectGoogleCalendar}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              className="button button-secondary small-button"
              disabled={integrationBusy}
              onClick={connectGoogleCalendar}
            >
              Connect
            </button>
          )}
        </div>
      </section>
      <section className="settings-section">
        <p className="eyebrow">TELEGRAM</p>
        <div className="settings-row">
          <span>
            <b>Task reminders in Telegram</b>
            <small>
              {telegramLinked
                ? "Your Kinda reminders are connected to Telegram."
                : "Connect your Telegram account to receive scheduled task reminders."}
            </small>
          </span>
          {telegramLinked ? (
            <>
              <button
                className="button button-secondary small-button"
                onClick={refreshTelegramStatus}
              >
                Refresh
              </button>
              <button
                className="button button-secondary small-button"
                disabled={integrationBusy}
                onClick={disconnectTelegram}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              className="button button-secondary small-button"
              disabled={integrationBusy}
              onClick={connectTelegram}
            >
              <Send size={13} /> Connect
            </button>
          )}
        </div>
      </section>
      {!pushSupported && (
        <section className="settings-section">
          <p className="eyebrow">PUSH NOTIFICATIONS</p>
          <div className="settings-row">
            <span>
              <b>Push notifications</b>
              <small>
                {typeof window !== "undefined" &&
                "serviceWorker" in navigator &&
                "PushManager" in window
                  ? "Not set up on this site yet."
                  : isIOS && !standalone
                    ? "On iPhone, add Kinda to your Home Screen first, then reopen it from there."
                    : "This browser doesn’t support push notifications."}
              </small>
            </span>
            <span>Unavailable</span>
          </div>
        </section>
      )}
      {pushSupported && (
        <section className="settings-section">
          <p className="eyebrow">PUSH NOTIFICATIONS</p>
          <div className="settings-row">
            <span>
              <b>Notify me, even when Kinda is closed</b>
              <small>
                {isIOS && !standalone
                  ? "On iPhone, add Kinda to your Home Screen first, then turn this on."
                  : "Messages in your circles and nudges from friends."}
              </small>
            </span>
            {notifPermission === "denied" ? (
              <span>Blocked in browser</span>
            ) : (
              <button
                className="button button-secondary small-button"
                onClick={onTogglePush}
              >
                <Bell size={13} /> {pushOn ? "Turn off" : "Turn on"}
              </button>
            )}
          </div>
        </section>
      )}
      <section className="settings-section">
        <p className="eyebrow">NOTIFICATIONS</p>
        <div className="settings-row">
          <span>
            <b>Browser alerts</b>
            <small>
              Get a ping for new messages, nudges and task reminders while Kinda
              is open in a tab.
            </small>
          </span>
          {notifPermission === "granted" ? (
            <span>On</span>
          ) : notifPermission === "denied" ? (
            <span>Blocked in browser</span>
          ) : notifPermission === "unsupported" ? (
            <span>Not supported</span>
          ) : (
            <button
              className="button button-secondary small-button"
              onClick={onEnableNotifications}
            >
              <Bell size={13} /> Turn on
            </button>
          )}
        </div>
      </section>
      <section className="settings-section">
        <p className="eyebrow">YOUR DATA</p>
        <p className="settings-copy">
          Your Kinda data is stored securely in the cloud. Your tasks stay
          private unless you choose to share them with friends or a circle.
        </p>
        <div className="settings-row">
          <span>
            <b>Export my data</b>
            <small>
              Download your profile, tasks and sent messages as a JSON file.
            </small>
          </span>
          <button
            className="button button-secondary small-button"
            onClick={onExport}
          >
            <Download size={13} /> Export
          </button>
        </div>
        <div className="settings-row">
          <span>
            <b>Delete account</b>
            <small>
              Permanently removes your account, tasks, messages and friendships.
              This can’t be undone.
            </small>
          </span>
          {!confirming && (
            <button
              className="button button-secondary small-button danger-button"
              onClick={() => setConfirming(true)}
            >
              Delete…
            </button>
          )}
        </div>
        {confirming && (
          <form
            className="delete-confirm"
            onSubmit={(event) => {
              event.preventDefault();
              onDelete(confirmText);
            }}
          >
            <label>
              Type <b>DELETE</b> to confirm
              <input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                autoComplete="off"
              />
            </label>
            <div>
              <button
                className="button button-secondary small-button danger-button"
                type="submit"
                disabled={confirmText !== "DELETE"}
              >
                Delete my account
              </button>
              <button
                className="text-link"
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
      <button
        className="button button-secondary logout-button"
        onClick={onSignOut}
      >
        <LogOut size={15} /> Log out
      </button>
    </div>
  );
}

function TaskDialog({ task, groups, friends = [], initialGroupIds = [], initialSharedWith = [], onClose, onSave }) {
  const selectedGroupIds = task?.groupIds || initialGroupIds;
  const selectedFriendIds = task?.sharedWith || initialSharedWith;
  const [more, setMore] = useState(Boolean(task) || initialGroupIds.length > 0 || initialSharedWith.length > 0);
  return (
    <Modal
      title={task ? "Edit task" : "New task"}
      subtitle={
        task
          ? "Make a quick update."
          : "Just the essentials. Everything else is optional."
      }
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={onSave}>
        <label>
          Task
          <input
            name="title"
            autoFocus
            defaultValue={task?.title || ""}
            placeholder="What would you like to do?"
            required
            maxLength="120"
          />
        </label>
        <div className="form-grid">
          <label>
            Due date
            <input
              name="dueDate"
              type="date"
              defaultValue={task ? task.dueDate || "" : localDate()}
            />
          </label>
          <label>
            Priority
            <select name="priority" defaultValue={task?.priority || "normal"}>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          className="more-toggle"
          aria-expanded={more}
          onClick={() => setMore((value) => !value)}
        >
          <ChevronDown size={15} className={more ? "open" : ""} />{" "}
          {more ? "Fewer options" : "More options"}
          <small>
            Details, category, focus time, repeat, reminder, circles
          </small>
        </button>
        <div className="more-fields" hidden={!more}>
          <label>
            Description <span className="optional-label">Optional</span>
            <textarea
              name="description"
              defaultValue={task?.description || task?.note || ""}
              rows="2"
              maxLength="500"
              placeholder="Add a little detail"
            />
          </label>
          <div className="form-grid">
            <label>
              Category
              <select
                name="category"
                defaultValue={task?.category || "Personal"}
              >
                {[
                  ...new Set([
                    ...(task?.category ? [task.category] : []),
                    ...categories,
                  ]),
                ].map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
          </div>
          <FocusTimeField defaultValue={task?.targetMinutes || 25} />
          <div className="form-grid">
            <label>
              Repeat <span className="optional-label">needs a due date</span>
              <select name="repeat" defaultValue={task?.repeat || "none"}>
                <option value="none">Does not repeat</option>
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekly">Every week</option>
              </select>
            </label>
            <label>
              Reminder <span className="optional-label">Optional</span>
              <input
                name="reminderTime"
                type="time"
                defaultValue={task?.reminderTime || ""}
              />
            </label>
          </div>
          {groups.length > 0 && (
            <fieldset className="circle-share-field">
              <legend>
                Share with circles{" "}
                <span className="optional-label">Optional</span>
              </legend>
              <p>
                Only members of selected circles can see this task and its
                progress.
              </p>
              {groups.map((group) => (
                <label className="circle-share-option" key={group.id}>
                  <input
                    type="checkbox"
                    name="groupIds"
                    value={group.id}
                    defaultChecked={selectedGroupIds.includes(group.id)}
                  />
                  <span>
                    <b>{group.name}</b>
                    <small>
                      {group.memberCount}{" "}
                      {group.memberCount === 1 ? "member" : "members"}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {friends.length > 0 && (
            <fieldset className="circle-share-field">
              <legend>Share with specific friends <span className="optional-label">Optional</span></legend>
              <p>Only the friends you select can see this task and its progress.</p>
              {friends.map((friend) => (
                <label className="circle-share-option" key={friend.id}>
                  <input type="checkbox" name="sharedWith" value={friend.id} defaultChecked={selectedFriendIds.includes(friend.id)} />
                  <span><b>{friend.name}</b><small>{friend.email}</small></span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
        <button className="button button-primary full-button" type="submit">
          {task ? "Save changes" : "Add task"} <ArrowRight size={15} />
        </button>
      </form>
    </Modal>
  );
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
  return (
    <Modal
      title="Create a circle"
      subtitle="A shared space for people, tasks, progress, and one group chat."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        <label>
          Circle name
          <input
            name="name"
            autoFocus
            placeholder="e.g. Sunday runners"
            required
            minLength="2"
            maxLength="60"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button button-primary full-button"
          type="submit"
          disabled={busy}
        >
          <Users size={15} />
          {busy ? "Creating…" : "Create circle"}
        </button>
      </form>
    </Modal>
  );
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
  return (
    <Modal
      title="Add a friend"
      subtitle="Find someone who already has a Kinda account."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoFocus
            placeholder="friend@example.com"
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-primary full-button" type="submit">
          <Users size={15} /> Add friend
        </button>
      </form>
    </Modal>
  );
}

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          className="modal-close icon-quiet"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
        <h2>{title}</h2>
        <p className="modal-subtitle">{subtitle}</p>
        {children}
      </section>
    </div>
  );
}

function InviteScreen({ invitation, error, onSignup, onLogin, onHome }) {
  return (
    <main className="invite-screen">
      <button className="wordmark wordmark-button" onClick={onHome}>
        kinda<span className="wordmark-flame"><Kindle mood="happy" size={22} /></span>
      </button>
      <section className="invite-card">
        <span className="invite-icon">
          <Users size={24} />
        </span>
        <p className="eyebrow">A PLACE IN THE CIRCLE</p>
        {error ? (
          <>
            <h1>This invite link isn’t available.</h1>
            <p>{error}</p>
            <button className="button button-secondary" onClick={onHome}>
              Back to Kinda
            </button>
          </>
        ) : invitation ? (
          <>
            <h1>Join {invitation.name}.</h1>
            <p>
              {invitation.ownerName} invited you to share tasks, follow each
              other’s progress, and chat together. You can create an account
              now; we’ll add you to this circle automatically.
            </p>
            <small>
              {invitation.memberCount}{" "}
              {invitation.memberCount === 1 ? "member" : "members"} so far
            </small>
            <div className="invite-actions">
              <button className="button button-primary" onClick={onSignup}>
                Create an account <ArrowRight size={15} />
              </button>
              <button className="text-link" onClick={onLogin}>
                Already have an account? Log in
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>Opening your invite…</h1>
            <p>We’re finding your circle.</p>
          </>
        )}
      </section>
      <section className="landing-feature-story" id="little-things">
        <div className="feature-story-heading">
          <p className="eyebrow">A LITTLE BETTER, TOGETHER</p>
          <h2>
            Small steps.
            <br />
            <em>Shared momentum.</em>
          </h2>
          <p>Four simple ways Kinda helps your circle keep showing up.</p>
        </div>
        <div className="feature-showcase">
          <article className="feature-panel feature-leaderboard">
            <div className="feature-copy">
              <span className="feature-label">A FRIENDLY PUSH</span>
              <h3>Cheer each other on.</h3>
              <p>
                See how your circle is doing today, one finished task at a time.
              </p>
            </div>
            <div className="feature-art leaderboard-art">
              <div className="feature-window-head">
                <span>Today’s leaderboard</span>
                <span className="feature-live">TODAY</span>
              </div>
              <div className="leaderboard-podium">
                <div className="leaderboard-person second">
                  <span className="feature-avatar avatar-lilac">M</span>
                  <b>Morgan</b>
                  <small>3 tasks</small>
                  <i>2</i>
                </div>
                <div className="leaderboard-person first">
                  <span className="feature-avatar avatar-gold">A</span>
                  <b>Alex</b>
                  <small>4 tasks</small>
                  <i>1</i>
                </div>
                <div className="leaderboard-person third">
                  <span className="feature-avatar avatar-peach">J</span>
                  <b>You</b>
                  <small>2 tasks</small>
                  <i>3</i>
                </div>
              </div>
              <div className="leaderboard-foot">
                <Trophy size={14} /> A little progress goes a long way
              </div>
            </div>
          </article>
          <article className="feature-panel feature-circles">
            <div className="feature-copy">
              <span className="feature-label">YOUR PEOPLE</span>
              <h3>Make room for your people.</h3>
              <p>
                Share tasks in a circle and celebrate the little wins together.
              </p>
            </div>
            <div className="feature-art circles-art">
              <div className="circles-card">
                <div className="circles-card-head">
                  <span>
                    <Users size={15} />
                  </span>
                  <div>
                    <b>Sunday people</b>
                    <small>4 members</small>
                  </div>
                  <span className="circles-online">● 3 here</span>
                </div>
                <div className="circles-members">
                  <i className="avatar-peach">A</i>
                  <i className="avatar-lilac">M</i>
                  <i className="avatar-blue">J</i>
                  <i className="avatar-gold">Y</i>
                  <span>Better, together</span>
                </div>
                <div className="circles-task">
                  <span className="circles-check">
                    <Check size={12} />
                  </span>
                  <span>
                    <b>Take a proper lunch</b>
                    <small>Shared by Morgan</small>
                  </span>
                  <Heart size={15} />
                </div>
                <div className="circles-task">
                  <span className="circles-empty" />
                  <span>
                    <b>Get outside for a bit</b>
                    <small>Shared by Alex</small>
                  </span>
                  <span className="circles-count">2/4</span>
                </div>
                <div className="circles-invite">
                  <Users size={14} /> Invite someone to your circle{" "}
                  <ArrowRight size={13} />
                </div>
              </div>
            </div>
          </article>
          <article className="feature-panel feature-chat">
            <div className="feature-copy">
              <span className="feature-label">CIRCLE CHAT</span>
              <h3>Good company, built in.</h3>
              <p>
                One shared conversation for your circle, with replies and
                reactions.
              </p>
            </div>
            <div className="feature-art chat-art">
              <div className="chat-card">
                <div className="chat-card-head">
                  <span className="chat-head-avatar">S</span>
                  <div>
                    <b>Sunday people</b>
                    <small>
                      <i /> everyone’s welcome
                    </small>
                  </div>
                  <MoreHorizontal size={18} />
                </div>
                <div className="chat-date">TODAY</div>
                <div className="chat-bubble chat-other">
                  <small>Morgan</small>Got outside for a walk 🌿
                </div>
                <div className="chat-reaction">💛 2</div>
                <div className="chat-bubble chat-own">
                  That counts. Proud of you!
                </div>
                <div className="chat-typing">
                  <span />
                  <span />
                  <span /> Morgan is typing
                </div>
                <div className="chat-input">
                  <span>Say something kind…</span>
                  <span>
                    <Send size={13} />
                  </span>
                </div>
              </div>
            </div>
          </article>
          <article className="feature-panel feature-streak">
            <div className="feature-copy">
              <span className="feature-label">YOUR OWN PACE</span>
              <h3>Keep a rhythm, not a streak of perfection.</h3>
              <p>
                Plan at least 5 tasks and finish 80% to keep your streak going. Miss a
                day? Start again kindly.
              </p>
            </div>
            <div className="feature-art streak-art">
              <div className="streak-card">
                <div className="streak-card-head">
                  <span>
                    <Flame size={16} />
                  </span>
                  <div>
                    <b>Your rhythm</b>
                    <small>One day at a time</small>
                  </div>
                  <span className="streak-count">
                    5 <small>days</small>
                  </span>
                </div>
                <div className="streak-week">
                  <div className="streak-day done">
                    <span>M</span>
                    <i>✓</i>
                  </div>
                  <div className="streak-day done">
                    <span>T</span>
                    <i>✓</i>
                  </div>
                  <div className="streak-day done">
                    <span>W</span>
                    <i>✓</i>
                  </div>
                  <div className="streak-day done">
                    <span>T</span>
                    <i>✓</i>
                  </div>
                  <div className="streak-day today">
                    <span>F</span>
                    <i>•</i>
                  </div>
                  <div className="streak-day">
                    <span>S</span>
                    <i>·</i>
                  </div>
                  <div className="streak-day">
                    <span>S</span>
                    <i>·</i>
                  </div>
                </div>
                <div className="streak-progress-copy">
                  <span>Today’s progress</span>
                  <b>5 tasks + 80%</b>
                </div>
                <div className="streak-progress">
                  <i />
                </div>
                <div className="streak-note">
                  <Sparkles size={14} /> Progress over perfect. Always.
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

const landingDemoScenes = [
  ["tasks", "Your tasks"],
  ["leaderboard", "Leaderboard"],
  ["circles", "Circles"],
  ["chat", "Circle chat"],
  ["streak", "Streak"],
];

function Landing({ onStart, onLogin }) {
  const [device, setDevice] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 700px)").matches
      ? "phone"
      : "laptop",
  );
  const [scene, setScene] = useState("tasks");
  const [demoPlaying, setDemoPlaying] = useState(
    () =>
      typeof window !== "undefined" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [demoScreenHost, setDemoScreenHost] = useState(null);
  const [landingDark, setLandingDark] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [activeFeature, setActiveFeature] = useState(null);
  const [completed, setCompleted] = useState([true, false, false]);
  const [nudged, setNudged] = useState(false);
  const count = completed.filter(Boolean).length;
  const taskLabels = [
    "Send the first draft",
    "Take a proper lunch",
    "Read for 20 minutes",
  ];
  const featureDetails = {
    leaderboard: [
      "Leaderboards",
      "See how many of today’s tasks each person in your circle has completed. Ranks update as tasks are checked off.",
      "A daily snapshot of your circle’s progress.",
    ],
    circles: [
      "Circles",
      "Create a circle, invite people with a link, and share tasks with the people you choose.",
      "Shared tasks and progress live in your circle.",
    ],
    chat: [
      "Circle chat",
      "Each circle has one group conversation. Send messages, reply, react, and see when members are typing.",
      "A shared conversation for your circle.",
    ],
    streak: [
      "Streaks",
      "A day counts when you plan at least 5 tasks and finish 80% or more. It resets when you miss either threshold.",
      "A clear daily goal, without pretending a missed day counts.",
    ],
  };
  const toggleTask = (index) =>
    setCompleted((current) =>
      current.map((value, item) => (item === index ? !value : value)),
    );

  useEffect(() => {
    setDemoScreenHost(document.querySelector(".landing-v2 .device-screen"));
  }, []);

  useEffect(() => {
    const phoneViewport = window.matchMedia("(max-width: 700px)");
    const syncDevice = (event) =>
      setDevice((current) =>
        event.matches ? "phone" : current === "phone" ? "laptop" : current,
      );
    phoneViewport.addEventListener("change", syncDevice);
    return () => phoneViewport.removeEventListener("change", syncDevice);
  }, []);

  useEffect(() => {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = (event) => setLandingDark(event.matches);
    setLandingDark(systemTheme.matches);
    systemTheme.addEventListener("change", syncTheme);
    return () => systemTheme.removeEventListener("change", syncTheme);
  }, []);

  useEffect(() => {
    if (!demoPlaying) return undefined;
    const timer = window.setInterval(() => {
      setScene(
        (current) =>
          landingDemoScenes[
            (landingDemoScenes.findIndex(([key]) => key === current) + 1) %
              landingDemoScenes.length
          ][0],
      );
      setNudged(false);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [demoPlaying]);

  useEffect(() => {
    const showcase = document.querySelector(".landing-v2 .feature-showcase");
    if (!showcase) return undefined;
    const openFeature = (event) => {
      const panel = event.target.closest(".feature-panel");
      if (panel)
        setActiveFeature(
          panel.classList.contains("feature-leaderboard")
            ? "leaderboard"
            : panel.classList.contains("feature-circles")
              ? "circles"
              : panel.classList.contains("feature-chat")
                ? "chat"
                : "streak",
        );
    };
    const activateFeature = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openFeature(event);
      }
    };
    showcase.querySelectorAll(".feature-panel").forEach((panel) => {
      panel.tabIndex = 0;
      panel.setAttribute("role", "button");
    });
    showcase.addEventListener("click", openFeature);
    showcase.addEventListener("keydown", activateFeature);
    return () => {
      showcase.removeEventListener("click", openFeature);
      showcase.removeEventListener("keydown", activateFeature);
    };
  }, []);
  useEffect(() => {
    if (!activeFeature) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setActiveFeature(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeFeature]);

  return (
    <main
      className={`landing-page landing-v2 ${landingDark ? "landing-dark" : ""}`}
    >
      {demoScreenHost &&
        createPortal(
          <LandingAppReel
            scene={scene}
            device={device}
            onSetScene={setScene}
            onOpenFeature={setActiveFeature}
          />,
          demoScreenHost,
        )}
      {activeFeature && (
        <LandingFeatureDetailPage
          feature={activeFeature}
          dark={landingDark}
          onBack={() => setActiveFeature(null)}
          onToggleDark={() => setLandingDark((value) => !value)}
          onStart={onStart}
        />
      )}
      {activeFeature && (
        <div
          className="feature-detail-backdrop"
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setActiveFeature(null)
          }
        >
          <section
            className="feature-detail-page"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feature-detail-title"
          >
            <button
              className="feature-detail-back"
              onClick={() => setActiveFeature(null)}
            >
              <ArrowLeft size={16} /> All features
            </button>
            <div className="feature-detail-content">
              <div className="feature-detail-copy">
                <p className="feature-label">
                  KINDA · {activeFeature.toUpperCase()}
                </p>
                <h1 id="feature-detail-title">
                  {featureDetails[activeFeature][0]}
                </h1>
                <p>{featureDetails[activeFeature][1]}</p>
                <button className="button button-primary" onClick={onStart}>
                  Try Kinda <ArrowRight size={15} />
                </button>
              </div>
              <div className={`feature-detail-art detail-${activeFeature}`}>
                <div className="feature-detail-screen">
                  <span className="detail-screen-label">
                    {featureDetails[activeFeature][2]}
                  </span>
                  {activeFeature === "leaderboard" ? (
                    <div className="detail-preview-list">
                      <span>
                        #1 &nbsp; Circle member &nbsp; <b>4/5 done</b>
                      </span>
                      <span>
                        #2 &nbsp; Circle member &nbsp; <b>3/5 done</b>
                      </span>
                      <span>
                        #3 &nbsp; You &nbsp; <b>2/5 done</b>
                      </span>
                    </div>
                  ) : activeFeature === "circles" ? (
                    <div className="detail-preview-list">
                      <span>
                        <Users size={16} /> Circle members
                      </span>
                      <span>
                        <CheckSquare2 size={16} /> Shared tasks
                      </span>
                      <span>
                        <Share size={16} /> Invite link
                      </span>
                    </div>
                  ) : activeFeature === "chat" ? (
                    <div className="detail-preview-chat">
                      <span>Circle conversation</span>
                      <span className="detail-chat-bubble">
                        Message from a member
                      </span>
                      <span className="detail-chat-bubble own">Your reply</span>
                      <span className="detail-chat-input">
                        Write a message…
                      </span>
                    </div>
                  ) : (
                    <div className="detail-preview-streak">
                      <Flame size={30} />
                      <b>80%</b>
                      <span>of today’s planned tasks</span>
                      <div>
                        <i />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
      <nav className="landing-nav">
        <button className="wordmark wordmark-button" onClick={onStart}>
          kinda<span className="wordmark-flame"><Kindle mood="happy" size={22} /></span>
        </button>
        <div className="landing-nav-links">
          <a href="#demo">Take a look</a>
          <a href="#little-things">The little things</a>
          <a href="#meet-kindle">Meet Kindle</a>
        </div>
        <div className="landing-nav-actions">
          <button
            className="landing-theme-toggle"
            onClick={() => setLandingDark((value) => !value)}
            aria-label={
              landingDark
                ? "Switch landing page to light mode"
                : "Switch landing page to dark mode"
            }
          >
            {landingDark ? <Sun size={15} /> : <Moon size={15} />}
            <span>{landingDark ? "Light" : "Dark"}</span>
          </button>
          <button className="nav-login" onClick={onLogin}>
            Log in
          </button>
          <button className="button button-primary nav-cta" onClick={onStart}>
            Get started <ArrowRight size={15} />
          </button>
        </div>
      </nav>
      <section className="landing-intro">
        <div className="landing-intro-copy">
          <h1>
            Make room for
            <br />
            <em>what moves you.</em>
          </h1>
          <p>
            Make progress at your own pace. Bring your people when it helps.
          </p>
          <div className="landing-intro-actions">
            <button className="button button-primary" onClick={onStart}>
              Start your space <ArrowRight size={16} />
            </button>
            <span>
              <span className="tiny-avatars">
                <i>J</i>
                <i>M</i>
                <i>A</i>
              </span>{" "}
              Better, together.
            </span>
          </div>
        </div>
        <div className="intro-orbit" aria-hidden="true">
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
          <span className="orbit-dot orbit-dot-one" />
          <span className="orbit-dot orbit-dot-two" />
          <div className="intro-flower">
            k<span>✳</span>
          </div>
          <span className="orbit-label orbit-label-top">
            one thing at a time
          </span>
          <span className="orbit-label orbit-label-bottom">
            your people, in your corner
          </span>
        </div>
      </section>
      <section
        className={`landing-demo ${demoPlaying ? "demo-is-playing" : ""}`}
        id="demo"
        aria-label="Interactive Kinda app demo"
      >
        <div className="demo-heading">
          <div>
            <p className="eyebrow">A LITTLE TOUR</p>
            <h2>Come on in.</h2>
            <p>Pick a screen. Tap around. Get the feel of it.</p>
          </div>
          <div
            className="device-switch"
            role="group"
            aria-label="Choose device preview"
          >
            {[
              ["laptop", Laptop, "Laptop"],
              ["tablet", Tablet, "Tablet"],
              ["phone", Smartphone, "Phone"],
            ].map(([key, Icon, label]) => (
              <button
                key={key}
                className={device === key ? "selected" : ""}
                aria-pressed={device === key}
                onClick={() => setDevice(key)}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={`demo-stage demo-${device}`}>
          <div className="demo-glow" />
          <div className="device-frame">
            <div className="device-camera" />
            <div className="device-screen">
              <div className="mock-app">
                <aside className="mock-sidebar">
                  <span className="mock-logo">
                    k<span>.</span>
                  </span>
                  <span className={scene === "today" ? "mock-nav-active" : ""}>
                    <CheckSquare2 size={14} /> Today
                  </span>
                  <span className={scene === "circle" ? "mock-nav-active" : ""}>
                    <Users size={14} /> Circle
                  </span>
                  <span
                    className={scene === "calendar" ? "mock-nav-active" : ""}
                  >
                    <CalendarDays size={14} /> Week
                  </span>
                  <div className="mock-side-bottom">
                    <span className="mock-avatar">J</span>
                    <span>Jamie</span>
                  </div>
                </aside>
                <div className="mock-main">
                  <header className="mock-top">
                    <span>YOUR DAY · YOUR PACE</span>
                    <span className="mock-weather">
                      A good day to begin <span>✳</span>
                    </span>
                    <span className="mock-avatar mock-avatar-small">J</span>
                  </header>
                  <div className="mock-content">
                    {scene === "today" && (
                      <>
                        <div className="mock-title-row">
                          <div>
                            <p className="mock-kicker">YOUR SPACE</p>
                            <h3>A little at a time.</h3>
                            <p>Three things you chose for today.</p>
                          </div>
                          <button className="mock-add" aria-label="Add task">
                            +
                          </button>
                        </div>
                        <div className="mock-progress">
                          <div>
                            <span>Today's rhythm</span>
                            <b>{count} / 3</b>
                          </div>
                          <span className="progress-track">
                            <i style={{ width: `${(count / 3) * 100}%` }} />
                          </span>
                        </div>
                        <div className="mock-task-list">
                          {taskLabels.map((task, index) => (
                            <button
                              key={task}
                              className={`mock-task ${completed[index] ? "is-done" : ""}`}
                              onClick={() => toggleTask(index)}
                            >
                              <span className="mock-check">
                                {completed[index] && <Check size={12} />}
                              </span>
                              <span>
                                {task}
                                <small>
                                  {index === 0
                                    ? "BUILDING · 25 MIN"
                                    : index === 1
                                      ? "SELF-CARE · 30 MIN"
                                      : "PERSONAL · 20 MIN"}
                                </small>
                              </span>
                              <span className="mock-task-time">
                                {index === 0
                                  ? "9:30"
                                  : index === 1
                                    ? "12:00"
                                    : "18:00"}
                              </span>
                            </button>
                          ))}
                        </div>
                        <div className="mock-streak">
                          <span>✳</span>
                          <div>
                            <b>
                              {count >= 2
                                ? "Your streak is looking good."
                                : "Your streak is yours to grow."}
                            </b>
                            <small>Small, steady progress counts.</small>
                          </div>
                          <b className="mock-streak-count">5 days</b>
                        </div>
                      </>
                    )}
                    {scene === "circle" && (
                      <>
                        <div className="mock-title-row">
                          <div>
                            <p className="mock-kicker">YOUR PEOPLE</p>
                            <h3>Here for each other.</h3>
                            <p>A little encouragement goes a long way.</p>
                          </div>
                          <span className="mock-online">3 here today</span>
                        </div>
                        <div className="mock-circle-card">
                          <div className="mock-circle-head">
                            <span className="mock-circle-avatars">
                              <i>J</i>
                              <i>M</i>
                              <i>A</i>
                              <i>+</i>
                            </span>
                            <span>
                              <b>Sunday people</b>
                              <small>Just showing up counts.</small>
                            </span>
                            <Heart size={17} />
                          </div>
                          <div className="mock-member">
                            <span className="mock-avatar">M</span>
                            <span>
                              <b>Morgan</b>
                              <small>Finished a tough thing today</small>
                            </span>
                            <span className="mock-reaction">♥ 4</span>
                          </div>
                          <div className="mock-member">
                            <span className="mock-avatar mock-avatar-peach">
                              A
                            </span>
                            <span>
                              <b>Alex</b>
                              <small>2 of 3 things done</small>
                            </span>
                            <button
                              className={`mock-nudge ${nudged ? "nudged" : ""}`}
                              onClick={() => setNudged(true)}
                            >
                              {nudged ? "Sent ✓" : "Send a nudge"}
                            </button>
                          </div>
                          <div className="mock-message">
                            <span className="mock-avatar mock-avatar-lilac">
                              J
                            </span>
                            <span>
                              <b>You</b>
                              <small>Cheering you both on ✨</small>
                            </span>
                            <span>now</span>
                          </div>
                        </div>
                        <div className="mock-note-card">
                          <span>☀</span>
                          <p>Progress feels lighter when it’s shared.</p>
                          <span>✳</span>
                        </div>
                      </>
                    )}
                    {scene === "calendar" && (
                      <>
                        <div className="mock-title-row">
                          <div>
                            <p className="mock-kicker">YOUR WEEK</p>
                            <h3>See the shape of it.</h3>
                            <p>One calm view of what’s ahead.</p>
                          </div>
                          <span className="mock-calendar-icon">
                            <CalendarDays size={17} />
                          </span>
                        </div>
                        <div className="mock-week">
                          <div className="mock-week-labels">
                            {[
                              ["M", "21"],
                              ["T", "22"],
                              ["W", "23"],
                              ["T", "24"],
                              ["F", "25"],
                            ].map(([day, date], index) => (
                              <span
                                key={day + date}
                                className={index === 1 ? "today" : ""}
                              >
                                <small>{day}</small>
                                <b>{date}</b>
                              </span>
                            ))}
                          </div>
                          <div className="mock-week-events">
                            <span
                              className="event-chip event-peach"
                              style={{ gridColumn: "1 / 3" }}
                            >
                              Make a little progress
                            </span>
                            <span
                              className="event-chip event-blue"
                              style={{ gridColumn: "2 / 4" }}
                            >
                              Catch up with Morgan
                            </span>
                            <span
                              className="event-chip event-gold"
                              style={{ gridColumn: "4 / 6" }}
                            >
                              A bit of breathing room
                            </span>
                          </div>
                        </div>
                        <div className="mock-calendar-foot">
                          <span>
                            <CalendarDays size={15} /> Private calendar feed
                          </span>
                          <span>Google · Apple · Outlook</span>
                        </div>
                        <div className="mock-sync-note">
                          <span className="mock-sync-dot" /> Your Kinda tasks,
                          in sync.
                        </div>
                      </>
                    )}
                    {scene === "share" && (
                      <>
                        <div className="mock-title-row">
                          <div>
                            <p className="mock-kicker">YOUR LITTLE WINS</p>
                            <h3>Look how far you came.</h3>
                            <p>A week worth being proud of.</p>
                          </div>
                          <span className="mock-share-icon">
                            <Heart size={16} />
                          </span>
                        </div>
                        <div className="mock-share-card">
                          <div className="share-card-top">
                            <span>
                              kinda<span className="wordmark-flame"><Kindle mood="happy" size={22} /></span>
                            </span>
                            <span>THIS WEEK ✳</span>
                          </div>
                          <div className="share-card-big">
                            You showed
                            <br />
                            up for <em>you.</em>
                          </div>
                          <div className="share-card-bottom">
                            <div>
                              <b>12</b>
                              <small>things done</small>
                            </div>
                            <div>
                              <b>5 days</b>
                              <small>in your rhythm</small>
                            </div>
                            <span>✳</span>
                          </div>
                        </div>
                        <div className="mock-share-actions">
                          <button onClick={() => setNudged(true)}>
                            {nudged ? "Ready to share ✓" : "Share your card"}{" "}
                            <ArrowRight size={13} />
                          </button>
                          <span>Instagram · WhatsApp · X</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="device-stand" />
            <div className="device-base" />
          </div>
          <div className="demo-under">
            <div
              className="demo-scenes"
              role="tablist"
              aria-label="Demo screens"
            >
              {landingDemoScenes.map(([key, label], index) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={scene === key}
                  className={scene === key ? "active" : ""}
                  onClick={() => {
                    setScene(key);
                    setNudged(false);
                  }}
                >
                  {
                    [
                      <CheckSquare2 size={14} />,
                      <Users size={14} />,
                      <CalendarDays size={14} />,
                      <Heart size={14} />,
                    ][index]
                  }
                  {label}
                </button>
              ))}
            </div>
            <button
              className="demo-play"
              aria-label={
                demoPlaying ? "Pause automatic demo" : "Play automatic demo"
              }
              onClick={() => setDemoPlaying((value) => !value)}
            >
              {demoPlaying ? (
                <>
                  <Pause size={12} /> Pause tour
                </>
              ) : (
                <>
                  <Play size={12} /> Play tour
                </>
              )}
            </button>
          </div>
        </div>
        <div className="demo-caption">
          <span className="demo-live-dot" /> Product walkthrough · interactive
          preview
        </div>
      </section>
      <section className="landing-feature-story" id="little-things">
        <div className="feature-story-heading">
          <p className="eyebrow">A LITTLE BETTER, TOGETHER</p>
          <h2>
            Small steps.
            <br />
            <em>Shared momentum.</em>
          </h2>
          <p>Four simple ways Kinda helps your circle keep showing up.</p>
        </div>
        <div className="feature-showcase">
          <article className="feature-panel feature-leaderboard">
            <div className="feature-copy">
              <span className="feature-label">A FRIENDLY PUSH</span>
              <h3>Cheer each other on.</h3>
              <p>
                See how your circle is doing today, one finished task at a time.
              </p>
            </div>
            <div className="feature-art">
              <div className="leaderboard-art">
                <div className="feature-window-head">
                  <span>Today’s leaderboard</span>
                  <span className="feature-live">TODAY</span>
                </div>
                <div className="leaderboard-podium">
                  <div className="leaderboard-person second">
                    <span className="feature-avatar avatar-lilac">M</span>
                    <b>Morgan</b>
                    <small>3 tasks</small>
                    <i>2</i>
                  </div>
                  <div className="leaderboard-person first">
                    <span className="feature-avatar avatar-gold">A</span>
                    <b>Alex</b>
                    <small>4 tasks</small>
                    <i>1</i>
                  </div>
                  <div className="leaderboard-person third">
                    <span className="feature-avatar avatar-peach">J</span>
                    <b>You</b>
                    <small>2 tasks</small>
                    <i>3</i>
                  </div>
                </div>
                <div className="leaderboard-foot">
                  <Trophy size={14} /> A little progress goes a long way
                </div>
              </div>
            </div>
          </article>
          <article className="feature-panel feature-circles">
            <div className="feature-copy">
              <span className="feature-label">YOUR PEOPLE</span>
              <h3>Make room for your people.</h3>
              <p>
                Share tasks in a circle and celebrate the little wins together.
              </p>
            </div>
            <div className="feature-art">
              <div className="circles-card">
                <div className="circles-card-head">
                  <span>
                    <Users size={15} />
                  </span>
                  <div>
                    <b>Sunday people</b>
                    <small>4 members</small>
                  </div>
                  <span className="circles-online">● 3 here</span>
                </div>
                <div className="circles-members">
                  <i className="avatar-peach">A</i>
                  <i className="avatar-lilac">M</i>
                  <i className="avatar-blue">J</i>
                  <i className="avatar-gold">Y</i>
                  <span>Better, together</span>
                </div>
                <div className="circles-task">
                  <span className="circles-check">
                    <Check size={12} />
                  </span>
                  <span>
                    <b>Take a proper lunch</b>
                    <small>Shared by Morgan</small>
                  </span>
                  <Heart size={15} />
                </div>
                <div className="circles-task">
                  <span className="circles-empty" />
                  <span>
                    <b>Get outside for a bit</b>
                    <small>Shared by Alex</small>
                  </span>
                  <span className="circles-count">2/4</span>
                </div>
                <div className="circles-invite">
                  <Users size={14} /> Invite someone to your circle{" "}
                  <ArrowRight size={13} />
                </div>
              </div>
            </div>
          </article>
          <article className="feature-panel feature-chat">
            <div className="feature-copy">
              <span className="feature-label">CIRCLE CHAT</span>
              <h3>Good company, built in.</h3>
              <p>
                One shared conversation for your circle, with replies and
                reactions.
              </p>
            </div>
            <div className="feature-art">
              <div className="chat-card">
                <div className="chat-card-head">
                  <span className="chat-head-avatar">S</span>
                  <div>
                    <b>Sunday people</b>
                    <small>
                      <i /> everyone’s welcome
                    </small>
                  </div>
                  <MoreHorizontal size={18} />
                </div>
                <div className="chat-date">TODAY</div>
                <div className="chat-bubble chat-other">
                  <small>Morgan</small>Got outside for a walk 🌿
                </div>
                <div className="chat-reaction">💛 2</div>
                <div className="chat-bubble chat-own">
                  That counts. Proud of you!
                </div>
                <div className="chat-typing">
                  <span />
                  <span />
                  <span /> Morgan is typing
                </div>
                <div className="chat-input">
                  <span>Say something kind…</span>
                  <span>
                    <Send size={13} />
                  </span>
                </div>
              </div>
            </div>
          </article>
          <article className="feature-panel feature-streak">
            <div className="feature-copy">
              <span className="feature-label">YOUR OWN PACE</span>
              <h3>Keep a rhythm, not a streak of perfection.</h3>
              <p>
                Plan at least 5 tasks and finish 80% to keep your streak going. Miss a
                day? Start again kindly.
              </p>
            </div>
            <div className="feature-art">
              <div className="streak-card">
                <div className="streak-card-head">
                  <span>
                    <Flame size={16} />
                  </span>
                  <div>
                    <b>Your rhythm</b>
                    <small>One day at a time</small>
                  </div>
                  <span className="streak-count">
                    5 <small>days</small>
                  </span>
                </div>
                <div className="streak-week">
                  <div className="streak-day done">
                    <span>M</span>
                    <i>✓</i>
                  </div>
                  <div className="streak-day done">
                    <span>T</span>
                    <i>✓</i>
                  </div>
                  <div className="streak-day done">
                    <span>W</span>
                    <i>✓</i>
                  </div>
                  <div className="streak-day done">
                    <span>T</span>
                    <i>✓</i>
                  </div>
                  <div className="streak-day today">
                    <span>F</span>
                    <i>•</i>
                  </div>
                  <div className="streak-day">
                    <span>S</span>
                    <i>·</i>
                  </div>
                  <div className="streak-day">
                    <span>S</span>
                    <i>·</i>
                  </div>
                </div>
                <div className="streak-progress-copy">
                  <span>Today’s progress</span>
                  <b>5 tasks + 80%</b>
                </div>
                <div className="streak-progress">
                  <i />
                </div>
                <div className="streak-note">
                  <Sparkles size={14} /> Progress over perfect. Always.
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>
      <section className="landing-little-things" id="little-things">
        <div className="little-heading">
          <p className="eyebrow">MADE FOR REAL LIFE</p>
          <h2>
            All the useful bits.
            <br />
            <em>None of the noise.</em>
          </h2>
        </div>
        <div className="little-grid">
          <article>
            <span className="little-icon little-icon-coral">
              <CheckSquare2 size={18} />
            </span>
            <b>Tasks that bend with your day</b>
            <small>
              Focus, Telegram reminders, and an 80% streak that doesn’t ask for
              perfect.
            </small>
          </article>
          <article>
            <span className="little-icon little-icon-lilac">
              <Users size={18} />
            </span>
            <b>Your people, a tap away</b>
            <small>
              Circles, kind nudges, and a place to cheer each other on.
            </small>
          </article>
          <article>
            <span className="little-icon little-icon-blue">
              <CalendarDays size={18} />
            </span>
            <b>Fits where you already plan</b>
            <small>
              Private calendar feeds and optional Google Calendar sync.
            </small>
          </article>
          <article>
            <span className="little-icon little-icon-gold">
              <Share size={18} />
            </span>
            <b>Wins worth passing along</b>
            <small>
              Weekly share cards, plus little celebrations along the way.
            </small>
          </article>
        </div>
      </section>
      <section className="landing-close">
        <div>
          <p className="eyebrow">YOUR SPACE IS WAITING</p>
          <h2>Start with one thing.</h2>
          <p>The rest can come later.</p>
        </div>
        <button className="button button-primary" onClick={onStart}>
          Make your space <ArrowRight size={16} />
        </button>
        <span className="close-doodle">✳</span>
      </section>
      <section className="meet-kindle" id="meet-kindle">
        <div className="meet-kindle-head">
          <p className="eyebrow">MEET KINDLE</p>
          <h2>
            A small flame
            <br />
            <em>that grows with you.</em>
          </h2>
          <p>
            Kindle lives inside Kinda and reacts to what you do. Finish a task and
            he cheers. Keep your streak and he lights up. Slip a day and he’s
            gentle about it.
          </p>
        </div>
        <div className="meet-kindle-name">
          <div>
            <b>Kinda</b>
            <span>Casual and low pressure. A little each day still counts.</span>
          </div>
          <div>
            <b>Kindle</b>
            <span>To light a fire. A small spark that grows with every streak day.</span>
          </div>
          <div>
            <b>Kind</b>
            <span>Circles are friends cheering each other on, so the tone stays warm.</span>
          </div>
        </div>
        <ul className="meet-kindle-grid" aria-label="Kindle’s moods">
          {KINDLE_MOODS.map((item) => (
            <li key={item.mood}>
              <Kindle mood={item.mood} size={96} />
              <b>{item.name}</b>
              <small>{item.when}</small>
              <p>“{item.say}”</p>
            </li>
          ))}
        </ul>
      </section>
      <footer className="landing-footer">
        <span>
          kinda<span className="footer-period">.</span>
        </span>
        <p>Small steps. Good people. Your own pace.</p>
        <button onClick={onLogin}>Log in</button>
      </footer>
    </main>
  );
}

function LandingAppReel({ scene, onSetScene, onOpenFeature }) {
  const [completed, setCompleted] = useState([true, false, false]);
  const [messageValue, setMessageValue] = useState("");
  const [phoneMenuOpen, setPhoneMenuOpen] = useState(false);
  const [messages, setMessages] = useState(() => [
    {
      id: "preview-message-1",
      senderId: "preview-member-1",
      senderName: "Circle member",
      content: "Finished the task I was putting off.",
      createdAt: new Date(Date.now() - 60000).toISOString(),
      mentions: [],
    },
  ]);
  const user = { id: "preview-user", name: "You" };
  const people = [
    { id: user.id, name: "You", role: "owner" },
    { id: "preview-member-1", name: "Circle member", role: "member" },
    { id: "preview-member-2", name: "Circle member", role: "member" },
  ];
  const tasks = [
    "Plan the day",
    "Take a proper lunch",
    "Read for 20 minutes",
  ].map((title, index) => ({
    id: `preview-task-${index}`,
    title,
    category: ["Personal", "Self-care", "Learning"][index],
    dueDate: localDate(),
    done: completed[index],
    priority: "normal",
    targetMinutes: 25,
    elapsedSeconds: 0,
    repeat: "none",
    groupIds: [],
  }));
  const sharedTasks = tasks.map((task, index) => ({
    ...task,
    ownerId: people[index % people.length].id,
    ownerName: people[index % people.length].name,
  }));
  const members = people.map((person, index) => ({
    ...person,
    doneCount:
      index === 0 ? completed.filter(Boolean).length : index === 1 ? 1 : 0,
    taskCount: index === 0 ? 3 : 2,
  }));
  const group = {
    id: "preview-circle",
    name: "Your circle",
    ownerId: user.id,
    myRole: "owner",
    memberCount: members.length,
    memberNames: members.map((member) => member.name).join(", "),
    taskCount: sharedTasks.length,
    doneCount: sharedTasks.filter((task) => task.done).length,
    members,
  };
  const noop = () => {};
  const groups = [group];
  const completion = tasks.length
    ? Math.round((completed.filter(Boolean).length / tasks.length) * 100)
    : 0;
  const toggleTask = (task, done) =>
    setCompleted((current) =>
      current.map((value, index) =>
        index === Number(task.id.slice(-1)) ? done : value,
      ),
    );
  const sendMessage = (event) => {
    event.preventDefault();
    if (!messageValue.trim()) return;
    setMessages((current) => [
      ...current,
      {
        id: `preview-message-${current.length + 1}`,
        senderId: user.id,
        senderName: user.name,
        content: messageValue.trim(),
        createdAt: new Date().toISOString(),
        mentions: [],
      },
    ]);
    setMessageValue("");
  };
  const current =
    scene === "tasks" || scene === "streak" ? (
      <HomePage
        user={user}
        tasks={tasks}
        done={completed.filter(Boolean).length}
        total={tasks.length}
        completion={completion}
        remainingTasks={tasks.length - completed.filter(Boolean).length}
        activity={[]}
        groups={groups}
        leaderboardGroupId={group.id}
        onSelectLeaderboardGroup={noop}
        onCreate={noop}
        onEdit={noop}
        onComplete={toggleTask}
        onTimer={noop}
        onReact={noop}
        onPage={noop}
        onCircle={() => onOpenFeature("circles")}
        onCreateCircle={noop}
        streak={{ current: 5, best: 5, percent: 80 }}
        loaded
        onShareStreak={noop}
      />
    ) : scene === "leaderboard" ? (
      <div className="page-content">
        <GroupLeaderboard group={group} userId={user.id} />
      </div>
    ) : scene === "circles" ? (
      <CirclesPage
        groups={groups}
        activeGroup={group}
        onSelect={noop}
        sharedTasks={sharedTasks}
        friends={[]}
        query=""
        setQuery={noop}
        results={[]}
        inviteLink={null}
        profile={null}
        user={user}
        onAdd={noop}
        onInvite={noop}
        onOpen={noop}
        onCloseProfile={noop}
        onCreateCircle={noop}
        onAddMember={noop}
        onCreateInvite={noop}
        onCopyInvite={noop}
        onCreateTask={noop}
        onOpenChat={() => onOpenFeature("chat")}
        recap={null}
        onNudge={noop}
        onRevokeInvite={noop}
        onLeave={noop}
        onAssign={noop}
        onDeleteAssignment={noop}
        onSetAdmin={noop}
        onRemoveMember={noop}
        onWeeklyReport={noop}
      />
    ) : (
      <ChatPage
        groups={groups}
        activeGroup={group}
        setActiveGroup={noop}
        messages={messages}
        sharedTasks={sharedTasks}
        user={user}
        value={messageValue}
        setValue={setMessageValue}
        onSend={sendMessage}
        sending={false}
        mobileOpen
        onMobileBack={noop}
        onInvite={noop}
        typingNames={[]}
        replyTo={null}
        onReply={noop}
        onCancelReply={noop}
        onEdit={noop}
        onDelete={noop}
        onTyping={noop}
        dividerTime={null}
      />
    );
  const sceneTitle =
    landingDemoScenes.find(([key]) => key === scene)?.[1] || "Kinda";
  return (
    <div className="landing-real-app">
      <aside className="landing-real-sidebar">
        <b className="landing-real-logo">
          kinda<span className="wordmark-flame"><Kindle mood="happy" size={22} /></span>
        </b>
        <span className={scene === "tasks" ? "selected" : ""}>
          <CheckSquare2 size={14} /> Today
        </span>
        <span
          className={scene === "circles" ? "selected" : ""}
          onClick={() => onOpenFeature("circles")}
        >
          <Users size={14} /> Circles
        </span>
        <span
          className={scene === "chat" ? "selected" : ""}
          onClick={() => onOpenFeature("chat")}
        >
          <MessageCircle size={14} /> Circle chat
        </span>
        <div className="landing-real-user">
          <span>Y</span> You
        </div>
      </aside>
      <div className="landing-real-main" key={scene}>
        <div className="landing-real-top">
          <button
            className="landing-phone-menu-button"
            type="button"
            aria-label={
              phoneMenuOpen ? "Close navigation menu" : "Open navigation menu"
            }
            aria-expanded={phoneMenuOpen}
            onClick={() => setPhoneMenuOpen((open) => !open)}
          >
            <Menu size={16} />
          </button>
          <span>{sceneTitle}</span>
          <span className="landing-real-preview-tag">SAMPLE CONTENT</span>
        </div>
        {phoneMenuOpen && (
          <nav className="landing-phone-menu" aria-label="Demo navigation">
            {landingDemoScenes.map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={scene === key ? "active" : ""}
                onClick={() => {
                  onSetScene(key);
                  setPhoneMenuOpen(false);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        <div className="landing-real-page">{current}</div>
      </div>
    </div>
  );
}

function LandingFeatureDetailPage({
  feature,
  dark,
  onBack,
  onToggleDark,
  onStart,
}) {
  const user = { id: "preview-user", name: "You" };
  const group = {
    id: "preview-circle",
    name: "Your circle",
    ownerId: "preview-user",
    myRole: "owner",
    memberCount: 3,
    memberNames: "You, Circle member 1, Circle member 2",
    taskCount: 0,
    members: [
      {
        id: "preview-user",
        name: "You",
        role: "owner",
        doneCount: 2,
        taskCount: 3,
      },
      {
        id: "preview-member-1",
        name: "Circle member",
        role: "member",
        doneCount: 1,
        taskCount: 3,
      },
      {
        id: "preview-member-2",
        name: "Circle member",
        role: "member",
        doneCount: 0,
        taskCount: 3,
      },
    ],
  };
  const [message, setMessage] = useState("");
  const noop = () => {};
  const detail = {
    leaderboard: [
      "Leaderboards",
      "Compare the number of tasks completed today with members of your circle. The standings update as tasks are completed.",
    ],
    circles: [
      "Circles",
      "Create a circle, invite people, share tasks, and follow progress together.",
    ],
    chat: [
      "Circle chat",
      "Every member of a circle shares one group conversation. Reply to messages, react, and see typing indicators.",
    ],
    streak: [
      "Streaks",
      "Plan at least 5 tasks and complete at least 80% of that day's tasks to continue your streak. Miss either threshold and it resets.",
    ],
  }[feature];
  const preview =
    feature === "leaderboard" ? (
      <GroupLeaderboard group={group} userId={user.id} />
    ) : feature === "circles" ? (
      <CirclesPage
        groups={[group]}
        activeGroup={group}
        onSelect={noop}
        sharedTasks={[]}
        friends={[]}
        query=""
        setQuery={noop}
        results={[]}
        inviteLink={null}
        profile={null}
        user={user}
        onAdd={noop}
        onInvite={noop}
        onOpen={noop}
        onCloseProfile={noop}
        onCreateCircle={noop}
        onAddMember={noop}
        onCreateInvite={noop}
        onCopyInvite={noop}
        onCreateTask={noop}
        onOpenChat={noop}
        recap={null}
        onNudge={noop}
        onRevokeInvite={noop}
        onLeave={noop}
        onAssign={noop}
        onDeleteAssignment={noop}
        onSetAdmin={noop}
        onRemoveMember={noop}
        onWeeklyReport={noop}
      />
    ) : feature === "chat" ? (
      <ChatPage
        groups={[group]}
        activeGroup={group}
        setActiveGroup={noop}
        messages={[]}
        sharedTasks={[]}
        user={user}
        value={message}
        setValue={setMessage}
        onSend={(event) => event.preventDefault()}
        sending={false}
        mobileOpen
        onMobileBack={noop}
        onInvite={noop}
        typingNames={[]}
        replyTo={null}
        onReply={noop}
        onCancelReply={noop}
        onEdit={noop}
        onDelete={noop}
        onTyping={noop}
        dividerTime={null}
      />
    ) : (
      <section className="streak-detail-real">
        <PageHeader
          eyebrow="YOUR DAY"
          title="Your streak"
          description="A steady rhythm, built one day at a time."
        />
        <StreakLine
          streak={{ current: 5, percent: 80 }}
          done={2}
          total={3}
          onShare={noop}
        />
        <div className="summary-progress">
          <span style={{ width: "67%" }} />
        </div>
        <p>
          Plan 5 tasks and complete at least 4 to reach 80% and keep this streak
          going.
        </p>
      </section>
    );
  return (
    <div className={`landing-feature-detail ${dark ? "is-dark" : ""}`}>
      <header>
        <button className="feature-detail-back" onClick={onBack}>
          <ArrowLeft size={16} /> All features
        </button>
        <button className="landing-theme-toggle" onClick={onToggleDark}>
          {dark ? <Sun size={15} /> : <Moon size={15} />}
          <span>{dark ? "Light" : "Dark"}</span>
        </button>
      </header>
      <div className="landing-feature-detail-copy">
        <p className="eyebrow">KINDA · {feature.toUpperCase()}</p>
        <h1>{detail[0]}</h1>
        <p>{detail[1]}</p>
        <button className="button button-primary" onClick={onStart}>
          Try Kinda <ArrowRight size={15} />
        </button>
      </div>
      <div className={`landing-feature-real-preview preview-${feature}`}>
        <span className="preview-caption">
          Kinda app preview · sample content
        </span>
        {preview}
      </div>
    </div>
  );
}

function AuthScreen({
  mode,
  setMode,
  onSubmit,
  onGoogle,
  googleEnabled,
  error,
  notice,
  busy,
  inviteName,
}) {
  const signup = mode === "signup";
  const forgot = mode === "forgot";
  const reset = mode === "reset";
  const title = signup
    ? "Make yourself at home."
    : forgot
      ? "Let’s get you back in."
      : reset
        ? "Choose a new password."
        : "Come on in.";
  const heading = signup
    ? "START WHERE YOU ARE"
    : forgot
      ? "PASSWORD HELP"
      : reset
        ? "A FRESH START"
        : "WELCOME BACK";
  const copy = forgot
    ? "Enter the email address on your account and we’ll send a reset link if it exists."
    : reset
      ? "Choose a new password with at least 8 characters."
      : inviteName
        ? `${signup ? "Create an account" : "Log in"} to join ${inviteName}.`
        : signup
          ? "Start with a fresh page and a little intention."
          : "Your people and tasks are right here.";

  return (
    <main className="auth-screen">
      <div className="auth-left">
        <button
          className="wordmark wordmark-button"
          onClick={() => setMode("landing")}
        >
          kinda<span className="wordmark-flame"><Kindle mood="happy" size={22} /></span>
        </button>
        <div className="auth-photo">
          <img src={photoOne} alt="Friends working on their goals together" />
        </div>
        <div className="auth-copy">
          <p className="eyebrow">A LITTLE MORE TOGETHER</p>
          <h1>
            Good things
            <br />
            get <em>shared.</em>
          </h1>
          <p>
            A thoughtful place to keep track of tasks and make room for your
            people.
          </p>
        </div>
        <div className="auth-bottom">TASKS, FRIENDS, YOUR OWN PACE.</div>
      </div>
      <div className="auth-right">
        <form className="auth-form" onSubmit={onSubmit}>
          <p className="eyebrow">{heading}</p>
          <h2>{title}</h2>
          <p className="auth-form-copy">{copy}</p>
          {signup && (
            <label>
              Your name
              <input
                name="name"
                placeholder="How should we call you?"
                autoComplete="name"
                minLength="2"
                maxLength="60"
                required
              />
            </label>
          )}
          {!reset && (
            <label>
              Email address
              <input
                type="email"
                name="email"
                placeholder="you@example.com"
                autoComplete="email"
                maxLength="254"
                required
              />
            </label>
          )}
          {!forgot && (
            <label>
              {reset ? "New password" : "Password"}
              <input
                type="password"
                name="password"
                placeholder="At least 8 characters"
                minLength="8"
                maxLength="128"
                autoComplete={
                  signup || reset ? "new-password" : "current-password"
                }
                required
              />
            </label>
          )}
          {reset && (
            <label>
              Confirm new password
              <input
                type="password"
                name="confirmPassword"
                placeholder="Enter the password again"
                minLength="8"
                maxLength="128"
                autoComplete="new-password"
                required
              />
            </label>
          )}
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="auth-notice" role="status">
              {notice}
            </p>
          )}
          <button
            className="button button-primary full-button"
            type="submit"
            disabled={busy}
          >
            {busy
              ? "One moment…"
              : signup
                ? "Create account"
                : forgot
                  ? "Send reset link"
                  : reset
                    ? "Reset password"
                    : "Log in"}{" "}
            <ArrowRight size={16} />
          </button>
          {googleEnabled && !forgot && !reset && (
            <button
              className="button button-secondary full-button google-sign-in"
              type="button"
              disabled={busy}
              onClick={onGoogle}
            >
              <span aria-hidden="true">G</span> Continue with Google
            </button>
          )}
          {mode === "login" && (
            <p className="auth-switch">
              <button type="button" onClick={() => setMode("forgot")}>
                Forgot password?
              </button>
            </p>
          )}
          <p className="auth-switch">
            {signup
              ? "Already have an account?"
              : reset || forgot
                ? "Remembered your password?"
                : "New around here?"}{" "}
            <button
              type="button"
              onClick={() =>
                setMode(signup || reset || forgot ? "login" : "signup")
              }
            >
              {signup
                ? "Log in"
                : reset || forgot
                  ? "Log in"
                  : "Create an account"}
            </button>
          </p>
          <p className="auth-privacy">
            <Heart size={14} /> Your tasks are private unless you choose to
            share.
          </p>
        </form>
      </div>
    </main>
  );
}

function App({ authClient }) {
  const convexClient = useConvex();
  return <WorkspaceApp authClient={authClient} backendClient={convexClient} backend="convex" />;
}

export function SupabaseApp({ client }) {
  const authClient = useMemo(() => createSupabaseAuthClient(client), [client]);
  return <WorkspaceApp authClient={authClient} backendClient={client} backend="supabase" />;
}

export default App;
