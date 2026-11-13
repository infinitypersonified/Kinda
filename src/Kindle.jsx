import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Flame, Sparkles } from "lucide-react";
import "./kindle.css";
import { warriorSvg } from "./kindleWarrior.js";
import { POSES, confettiHtml, pickPose, pickStreakScene, poseHtml, streakSceneHtml, thinkingHtml } from "./kindleArt.js";
import StreakWeekProgress from "./StreakWeekProgress.jsx";

const BODY = "M0-118C14-86 62-62 62-2C62 52 32 88 0 88C-32 88-62 52-62-2C-62-26-48-44-36-58C-33-36-20-26-12-30C-22-62-10-96 0-118Z";
const MID = "M0-40C8-22 44-6 44 28C44 62 24 82 0 82C-24 82-44 62-44 28C-44-6-8-22 0-40Z";
const BELLY = "M0-2C8 10 38 24 38 50C38 68 20 78 0 78C-20 78-38 68-38 50C-38 24-8 10 0-2Z";
const INK = "#4A1D0B";
const PINK = "#FB7185";
const ARMS_DOWN = "M-58 28Q-76 38-74 56M58 30Q76 40 74 58";
const ARMS_UP = "M-58 28Q-82 18-84-6M58 28Q82 18 84-6";
const ARMS_WAVE = "M-58 28Q-82 18-86-6M58 30Q76 40 74 58";

const Line = ({ d, w = 3 }) => (
  <path d={d} fill="none" stroke={INK} strokeWidth={w} strokeLinecap="round" />
);
const Eyes = ({ dx = 0, dy = 0 }) => (
  <>
    <ellipse cx="-17" cy="32" rx="9" ry="11" fill="#fff" />
    <ellipse cx="17" cy="32" rx="9" ry="11" fill="#fff" />
    <ellipse cx={-16 + dx} cy={34 + dy} rx="5.5" ry="8" fill={INK} />
    <ellipse cx={18 + dx} cy={34 + dy} rx="5.5" ry="8" fill={INK} />
    <circle cx={-14 + dx} cy={30 + dy} r="2.4" fill="#fff" />
    <circle cx={20 + dx} cy={30 + dy} r="2.4" fill="#fff" />
  </>
);
const Cheeks = () => (
  <>
    <ellipse cx="-31" cy="52" rx="7" ry="4.2" fill={PINK} opacity=".75" />
    <ellipse cx="31" cy="52" rx="7" ry="4.2" fill={PINK} opacity=".75" />
  </>
);
const Happy = () => (
  <>
    <path d="M-11 50Q0 72 11 50Z" fill={INK} />
    <ellipse cx="0" cy="62" rx="5.5" ry="3.2" fill="#FF8A80" />
  </>
);
const Smile = () => <Line d="M-9 52Q0 64 9 52" />;
const HappyEyes = () => <Line d="M-17 27Q-12 19-7 27M7 27Q12 19 17 27" />;
const SleepyEyes = () => <Line d="M-17 27Q-12 31-7 27M7 27Q12 31 17 27" />;

const CONFETTI = [
  [-70, -70, 5, "#FFD54F"], [72, -80, 4, "#60A5FA"], [-40, -110, 3, PINK],
  [48, -112, 3, "#34D399"], [0, -132, 4, "#A78BFA"], [-88, -30, 3, "#34D399"],
  [88, -40, 3, "#FFD54F"],
];

const LOOKS = {
  happy: { arms: ARMS_DOWN, face: <><Eyes /><Cheeks /><Happy /></> },
  proud: {
    arms: ARMS_DOWN,
    face: <><HappyEyes /><Cheeks /><Smile /></>,
    extra: <path d="M-86-82L-82-74L-74-70L-82-66L-86-58L-90-66L-98-70L-90-74Z" fill="#FFD54F" />,
  },
  celebrate: {
    arms: ARMS_UP,
    face: <><HappyEyes /><Cheeks /><Happy /></>,
    extra: CONFETTI.map(([x, y, r, fill]) => <circle key={`${x}${y}`} cx={x} cy={y} r={r} fill={fill} />),
  },
  enc: {
    arms: ARMS_DOWN,
    face: <><Eyes /><Line d="M-27 14L-9 20M27 14L9 20" w={3.5} /><Cheeks /><Smile /></>,
  },
  sleepy: {
    arms: ARMS_DOWN,
    opacity: 0.6,
    face: <><SleepyEyes /><Cheeks /><Line d="M-5 54H5" /></>,
    extra: <><text x="64" y="-60" fontSize="30" fill="#FFB74D">z</text><text x="84" y="-84" fontSize="24" fill="#FFB74D">z</text></>,
  },
  sad: {
    arms: ARMS_DOWN,
    opacity: 0.7,
    face: <><Eyes dy={2} /><circle cx="-27" cy="50" r="4" fill="#60A5FA" /><Cheeks /><Line d="M-9 62Q0 52 9 62" /></>,
  },
  think: {
    arms: ARMS_DOWN,
    face: <><Eyes dx={5} dy={-4} /><Cheeks /><ellipse cx="0" cy="56" rx="4" ry="5" fill={INK} /></>,
    extra: <><circle cx="70" cy="-60" r="5" fill="#FFD54F" /><circle cx="88" cy="-84" r="8" fill="#FFD54F" /></>,
  },
  cheer: {
    arms: ARMS_WAVE,
    face: <><Eyes /><Cheeks /><Happy /></>,
    extra: <path d="M98-44C86-56 98-70 106-60C114-70 126-56 114-44L106-34Z" fill={PINK} />,
  },
};

export default function Kindle({ mood = "happy", size = 48, animate = false, className = "" }) {
  const look = LOOKS[mood] || LOOKS.happy;
  return (
    <svg
      className={`kindle${animate ? " kindle-bob" : ""} ${className}`.trim()}
      viewBox="-100 -145 200 250"
      width={size}
      height={Math.round(size * 1.25)}
      aria-hidden="true"
      focusable="false"
    >
      <g opacity={look.opacity ?? 1}>
        {look.extra}
        <path d={look.arms} fill="none" stroke="#EF4423" strokeWidth="13" strokeLinecap="round" />
        <path d={BODY} fill="#EF4423" />
        <path d={MID} fill="#FF8A1F" />
        <path d={BELLY} fill="#FFD54F" />
        {look.face}
      </g>
    </svg>
  );
}

// Calls onDone after `ms`, once per `key`. The app re-renders often, so the
// latest onDone is kept in a ref instead of restarting the timer every render.
function useAutoDismiss(key, onDone, ms) {
  const latest = useRef(onDone);
  latest.current = onDone;
  useEffect(() => {
    const timer = window.setTimeout(() => latest.current && latest.current(), ms);
    return () => window.clearTimeout(timer);
  }, [key, ms]);
}

export function KindleToast({ toast, onDone }) {
  useAutoDismiss(toast.key, onDone, toast.duration || 3200);
  return (
    <div
      className={`kindle-toast${toast.variant ? ` kindle-toast-${toast.variant}` : ""}`}
      role="status"
      key={toast.key}
    >
      <Kindle mood={toast.mood} size={52} animate />
      <div className="kindle-toast-bubble">
        {toast.title && <strong>{toast.title}</strong>}
        <p>{toast.text}</p>
      </div>
    </div>
  );
}

export const KINDLE_MOODS = [
  { mood: "happy", name: "Happy", when: "Your home screen", say: "Morning! You’ve got three tasks today." },
  { mood: "proud", name: "Proud", when: "A task is finished", say: "Nice one. Another down." },
  { mood: "celebrate", name: "Celebrating", when: "A streak day", say: "Day 7 and still burning!" },
  { mood: "enc", name: "Encouraging", when: "Tasks still open", say: "Just two left. You’ve got this." },
  { mood: "sleepy", name: "Sleepy", when: "Your streak is at risk", say: "Don’t let me fade out!" },
  { mood: "sad", name: "Comforting", when: "A streak ends", say: "We’ll relight it tomorrow." },
  { mood: "cheer", name: "Cheering", when: "A friend finishes a task", say: "Sam just finished one!" },
  { mood: "think", name: "Thinking", when: "You’re adding a task", say: "Ooh, what’s next?" },
];

const Html = ({ html, className, style }) => (
  <div className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />
);

const KINDLE_VOICE_ANIMATION_MS = 7000;

// Big cheer when a task is ticked: a random pose with its own words.
export function KindleCheer({ cheer, onDone }) {
  useAutoDismiss(cheer.key, onDone, KINDLE_VOICE_ANIMATION_MS);
  const confetti = useMemo(() => confettiHtml(14), [cheer.key]);
  return (
    <div className="kd-ov kd-ov-soft kd-jump" role="status" key={cheer.key} onClick={onDone}>
      <Html html={confetti} />
      <div className="kd-cheer-burst" aria-hidden="true" />
      <Html className="kd-enter" html={poseHtml(cheer.pose, 230)} />
      <div className="kd-cheer-badge" aria-hidden="true">
        <Check size={15} strokeWidth={3} />
        Task complete
      </div>
      <div className="kd-bubble">{cheer.text || POSES[cheer.pose]?.say}</div>
    </div>
  );
}

// Full-screen cheer when a task has been created.
export function KindleCreated({ created, onDone }) {
  useAutoDismiss(created.key, onDone, KINDLE_VOICE_ANIMATION_MS);
  const confetti = useMemo(() => confettiHtml(30), [created.key]);
  return (
    <div className="kd-ov kd-ov-full kd-jump" role="status" key={created.key} onClick={onDone}>
      <Html html={confetti} />
      <Html className="kd-enter" html={poseHtml(created.pose, 280)} />
      <h2>Task added!</h2>
      <p>You’ve got this.</p>
      <div className="kd-created-badge" aria-hidden="true">
        <Sparkles size={15} />
        Added to your plan
      </div>
    </div>
  );
}

// Thinking Kindle at the top of the new-task form.
export function KindleThinking() {
  return (
    <div className="kd-think-row" aria-hidden="true">
      <Html html={thinkingHtml(104)} />
      <div className="kd-bubble">Ooh, what’s next?</div>
    </div>
  );
}

// Calm streak animation. The number comes from the app; this only draws it.
export function KindleStreak({ to, scene, week }) {
  const html = useMemo(() => streakSceneHtml(scene, to), [scene, to]);
  const todayQualified = week?.some((day) => day.today && day.qualified);
  const [newDayRevealed, setNewDayRevealed] = useState(false);

  useEffect(() => {
    if (
      !todayQualified ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setNewDayRevealed(true);
      return undefined;
    }

    setNewDayRevealed(false);
    const timer = window.setTimeout(() => setNewDayRevealed(true), 2700);
    return () => window.clearTimeout(timer);
  }, [to, todayQualified]);

  const displayedWeek = useMemo(() => {
    if (!todayQualified || newDayRevealed) return week;
    return week.map((day) => day.today ? { ...day, qualified: false } : day);
  }, [newDayRevealed, todayQualified, week]);

  return (
    <>
      <Html html={html} />
      <StreakWeekProgress week={displayedWeek} className="kd-week" />
    </>
  );
}

export { pickPose, pickStreakScene };

// Full-screen warrior moment for challenges. Tap anywhere to close.
export function KindleWarrior({ scene, title, line, onDone }) {
  useAutoDismiss(`${scene}-${title}`, onDone, KINDLE_VOICE_ANIMATION_MS);
  return (
    <div className="kw-ov" role="dialog" aria-label={title} onClick={onDone}>
      <div className="kw-ov-art">
        <Html html={warriorSvg(scene)} />
      </div>
      <div className="kw-victory-badge" aria-hidden="true">
        <Flame size={15} />
        Team win
      </div>
      <h2>{title}</h2>
      {line && <p>{line}</p>}
    </div>
  );
}
