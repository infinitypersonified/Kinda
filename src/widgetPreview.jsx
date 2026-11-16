import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUpRight, Check, Flame, Laptop, Moon, Smartphone, Sun } from "lucide-react";
import Kindle from "./Kindle.jsx";
import "./widgetPreview.css";

const MOMENTS = [
  {
    id: "morning",
    time: "7:15 AM",
    label: "Morning",
    message: "I miss you already.",
    subline: "One small win can set the tone.",
    mood: "wave",
    motion: "wave",
    marker: "A fresh start",
  },
  {
    id: "nine",
    time: "9:15 AM",
    label: "A little start",
    message: "A tiny start still counts.",
    subline: "Pick the easiest thing first.",
    mood: "happy",
    motion: "lift",
    marker: "Keep it gentle",
  },
  {
    id: "eleven",
    time: "11:15 AM",
    label: "First win",
    message: "Your first win is waiting.",
    subline: "I’ll keep your place warm.",
    mood: "think",
    motion: "think",
    marker: "A gentle nudge",
  },
  {
    id: "one",
    time: "1:15 PM",
    label: "Midday",
    message: "These tasks aren’t gonna do themselves.",
    subline: "Pick one. I’ll be right here.",
    mood: "think",
    motion: "think",
    marker: "A gentle nudge",
  },
  {
    id: "three",
    time: "3:15 PM",
    label: "Future you",
    message: "Your future self says thanks.",
    subline: "One small thing is enough.",
    mood: "happy",
    motion: "wave",
    marker: "A little momentum",
  },
  {
    id: "five",
    time: "5:15 PM",
    label: "After work",
    message: "There’s still time to keep your flame.",
    subline: "One task can turn today around.",
    mood: "enc",
    motion: "lift",
    marker: "Keep your rhythm",
  },
  {
    id: "seven",
    time: "7:15 PM",
    label: "A little room",
    message: "Let’s get one thing off your mind.",
    subline: "Your streak is still within reach.",
    mood: "enc",
    motion: "lift",
    marker: "There’s still time",
  },
  {
    id: "risk",
    time: "8:15 PM",
    label: "Streak at risk",
    message: "Don’t let your streak die.",
    subline: "Finish 1 more task to protect it.",
    mood: "sleepy",
    motion: "sleepy",
    marker: "Only when it matters",
  },
  {
    id: "nine-evening",
    time: "9:15 PM",
    label: "Last little win",
    message: "One small finish, then rest.",
    subline: "You’ve already made it this far.",
    mood: "sleepy",
    motion: "sleepy",
    marker: "A soft landing",
  },
  {
    id: "done",
    time: "8:40 PM",
    label: "Goal reached",
    message: "You kept your flame alive.",
    subline: "That’s today taken care of. Nice work.",
    mood: "celebrate",
    motion: "celebrate",
    marker: "No more nudges today",
  },
];

const DAYS = [
  { day: "M", state: "done" },
  { day: "T", state: "done" },
  { day: "W", state: "done" },
  { day: "T", state: "done" },
  { day: "F", state: "today" },
  { day: "S", state: "open" },
  { day: "S", state: "open" },
];

function WidgetCard({ moment, mode, size, onOpenTasks }) {
  return (
    <article
      className={`wd-card is-${mode} is-${size} pose-${moment.motion}`}
      aria-label={`12 day streak. ${moment.message}`}
      key={`${moment.id}-${mode}-${size}`}
    >
      <div className="wd-card-copy">
        <div className="wd-streak-number">
          <Flame size={24} fill="currentColor" strokeWidth={1.8} aria-hidden="true" />
          <strong>12</strong>
          <span>day streak</span>
        </div>

        <div className="wd-message-block" aria-live="polite">
          <span className="wd-message-kicker">{moment.marker}</span>
          <h2>{moment.message}</h2>
          <p>{moment.subline}</p>
        </div>

        <div className="wd-week" aria-label="4 of 7 days complete this week">
          <div className="wd-week-days">
            {DAYS.map((day, index) => (
              <span className={`wd-day is-${day.state}`} key={`${day.day}-${index}`}>
                <small>{day.day}</small>
                <i>{day.state === "done" ? <Check size={13} strokeWidth={3} /> : null}</i>
              </span>
            ))}
          </div>
          <span className="wd-week-count">4 / 7 this week</span>
        </div>
        <button className="wd-open-tasks" type="button" onClick={onOpenTasks}>
          Open today&apos;s tasks <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="wd-kindle-stage" aria-hidden="true">
        <span className="wd-kindle-orbit" />
        <span className="wd-kindle-spark wd-spark-one">✦</span>
        <span className="wd-kindle-spark wd-spark-two">✦</span>
        <Kindle mood={moment.mood} size={size === "small" ? 76 : 112} className="wd-kindle" />
        <span className="wd-kindle-flame"><Flame size={15} fill="currentColor" /></span>
      </div>
      <span className="wd-card-accent" />
    </article>
  );
}

function DeviceStage({ device, moment, mode, size, onOpenTasks }) {
  if (device === "phone") {
    return (
      <div className="wd-phone-frame">
        <div className="wd-phone-screen">
          <div className="wd-phone-status"><span>{moment.time}</span><span>◔　◉　▰</span></div>
          <div className="wd-phone-date"><small>FRIDAY, NOVEMBER 20</small><strong>Make today count.</strong></div>
          <WidgetCard moment={moment} mode={mode} size={size} onOpenTasks={onOpenTasks} />
          <div className="wd-phone-apps" aria-hidden="true">
            <i>✦</i><i>◷</i><i>▧</i><i>◉</i>
          </div>
          <span className="wd-phone-homebar" />
        </div>
      </div>
    );
  }

  return (
    <div className={`wd-desktop-screen is-${device}`}>
      <div className="wd-desktop-topline">
        {device === "windows" ? <Laptop size={15} /> : <Moon size={15} />}
        <span>{device === "windows" ? "WINDOWS 11 · WIDGETS BOARD" : "MAC · DESKTOP WIDGET"}</span>
        <span className="wd-desktop-time">{moment.time}</span>
      </div>
      {device === "windows" ? (
        <div className="wd-windows-board">
          <header><strong>Widgets</strong><span>Personalise</span></header>
          <WidgetCard moment={moment} mode={mode} size={size} onOpenTasks={onOpenTasks} />
        </div>
      ) : (
        <div className="wd-mac-wallpaper">
          <div className="wd-mac-date">Monday <b>16</b></div>
          <WidgetCard moment={moment} mode={mode} size={size} onOpenTasks={onOpenTasks} />
          <span className="wd-wallpaper-sun" />
        </div>
      )}
    </div>
  );
}

function WidgetPreview() {
  const params = new URLSearchParams(window.location.search);
  const [momentId, setMomentId] = useState(() =>
    MOMENTS.some((item) => item.id === params.get("moment"))
      ? params.get("moment")
      : "risk",
  );
  const [device, setDevice] = useState(() =>
    ["phone", "windows", "mac"].includes(params.get("device"))
      ? params.get("device")
      : "phone",
  );
  const [mode, setMode] = useState(() =>
    params.get("mode") === "light" ? "light" : "dark",
  );
  const [size, setSize] = useState(() =>
    params.get("size") === "small" ? "small" : "medium",
  );
  const [actionPreview, setActionPreview] = useState(false);
  const moment = MOMENTS.find((item) => item.id === momentId) || MOMENTS[0];

  return (
    <main className="wd-page">
      <header className="wd-header">
        <a className="wd-brand" href="/" aria-label="Kinda home">
          <span className="wd-brand-mark"><Flame size={20} fill="currentColor" /></span>
          <span>kinda</span>
        </a>
        <span className="wd-preview-badge"><i /> DESIGN PREVIEW <b>NOT LIVE</b></span>
      </header>

      <section className="wd-intro">
        <p className="wd-eyebrow">A LITTLE SPARK, RIGHT WHERE YOU NEED IT</p>
        <h1>Keep the streak close.</h1>
        <p className="wd-intro-copy">A small, kind reminder that changes with your day. Choose a moment below to preview the message and Kindle’s matching pose.</p>
      </section>

      <section className="wd-controls" aria-label="Preview settings">
        <div className="wd-control-row wd-moment-row">
          <div className="wd-control-label"><b>Pick an hour</b></div>
          <div className="wd-moment-options">
            {MOMENTS.map((item) => (
              <button
                type="button"
                key={item.id}
                className={item.id === momentId ? "is-active" : ""}
                aria-pressed={item.id === momentId}
                onClick={() => setMomentId(item.id)}
              >
                <small>{item.time}</small>{item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="wd-control-row wd-device-row">
          <div className="wd-control-label"><b>Preview on</b></div>
          <div className="wd-device-options" role="group" aria-label="Device preview">
            <button type="button" className={device === "phone" ? "is-active" : ""} aria-pressed={device === "phone"} onClick={() => setDevice("phone")}><Smartphone size={15} />Phone</button>
            <button type="button" className={device === "windows" ? "is-active" : ""} aria-pressed={device === "windows"} onClick={() => setDevice("windows")}><Laptop size={15} />Windows</button>
            <button type="button" className={device === "mac" ? "is-active" : ""} aria-pressed={device === "mac"} onClick={() => setDevice("mac")}><Moon size={15} />Mac</button>
          </div>
          <div className="wd-view-options" role="group" aria-label="Widget appearance and size">
            <button type="button" className={mode === "dark" ? "is-active" : ""} aria-pressed={mode === "dark"} onClick={() => setMode("dark")}><Moon size={14} /><span>Dark</span></button>
            <button type="button" className={mode === "light" ? "is-active" : ""} aria-pressed={mode === "light"} onClick={() => setMode("light")}><Sun size={14} /><span>Light</span></button>
            <span className="wd-option-divider" />
            <button type="button" className={size === "small" ? "is-active" : ""} aria-pressed={size === "small"} onClick={() => setSize("small")}>Small</button>
            <button type="button" className={size === "medium" ? "is-active" : ""} aria-pressed={size === "medium"} onClick={() => setSize("medium")}>Medium</button>
          </div>
        </div>
      </section>

      <section className={`wd-stage-wrap is-${device}`} aria-label="Live widget mockup">
        <div className="wd-stage-label"><span>THE STREAK WIDGET</span><span>{moment.marker.toUpperCase()}</span></div>
        <DeviceStage device={device} moment={moment} mode={mode} size={size} onOpenTasks={() => setActionPreview(true)} />
      </section>

      {actionPreview && (
        <div className="wd-action-toast" role="status">
          <span className="wd-action-toast-mark"><Check size={15} /></span>
          <span><strong>Tap action preview</strong><small>Opens Kinda → Today&apos;s tasks</small></span>
          <button type="button" aria-label="Dismiss action preview" onClick={() => setActionPreview(false)}>×</button>
        </div>
      )}

      <footer className="wd-footer">
        <span>YOUR KINDLE, YOUR RHYTHM</span>
        <p>Preview only. Tap “Open today’s tasks” to preview the deep link into Kinda. A quick complete action can be added where the platform supports it; hourly copy is best-effort because each device controls widget refresh timing.</p>
        <span className="wd-motion-note"><i /> Pose changes with the message</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("widget-preview-root")).render(<WidgetPreview />);
