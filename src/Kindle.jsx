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

function BadgeCostume({ costume }) {
  switch (costume) {
    case "first_spark":
      return (
        <g fill="none" stroke="#FFF1A8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M-34-91Q0-113 34-91" strokeWidth="5" />
          <path d="M0-145L4-135L14-132L4-128L0-118L-4-128L-14-132L-4-135Z" fill="#FFF1A8" stroke="#F59E0B" strokeWidth="2" />
        </g>
      );
    case "task_master":
      return (
        <g stroke="#7C2D12" strokeLinejoin="round">
          <path d="M-28-102L-24-122L-10-112L0-130L10-112L24-122L28-102Z" fill="#FFD54F" strokeWidth="3" />
          <path d="M-28-102H28V-95H-28Z" fill="#F59E0B" strokeWidth="2" />
          <circle cx="0" cy="-109" r="4" fill="#FFF4E6" stroke="none" />
        </g>
      );
    case "century_club":
      return (
        <g fill="none" stroke="#A7F3D0" strokeLinecap="round" strokeWidth="4">
          <path d="M-52 46Q-72 15-48-15M52 46Q72 15 48-15" />
          <path d="M-56 26L-67 20M-53 8L-65 4M-47-8L-57-17M56 26L67 20M53 8L65 4M47-8L57-17" />
          <path d="M-28-92Q0-107 28-92" stroke="#FDE68A" strokeWidth="5" />
        </g>
      );
    case "afternoon_task_killer":
      return (
        <g stroke="#7C2D12" strokeLinejoin="round">
          <path d="M-38-94Q0-110 38-94L31-86H-31Z" fill="#FB923C" strokeWidth="3" />
          <circle cx="59" cy="-77" r="16" fill="#FFD54F" strokeWidth="3" />
          <path d="M59-86V-77L66-72" fill="none" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case "sunrise_spark":
      return (
        <g stroke="#C2410C" strokeLinecap="round" strokeWidth="4">
          <path d="M-28-102Q0-117 28-102" fill="none" />
          <circle cx="0" cy="-124" r="10" fill="#FFF1A8" strokeWidth="3" />
          <path d="M0-143V-138M-20-137L-16-133M20-137L16-133" />
        </g>
      );
    case "midnight_momentum":
      return (
        <g stroke="#312E81" strokeLinejoin="round">
          <path d="M-32-101Q-8-111 31-98L23-87H-28Z" fill="#818CF8" strokeWidth="3" />
          <circle cx="30" cy="-101" r="4" fill="#FFF4E6" stroke="none" />
          <path d="M-54-59L-50-50L-41-47L-50-44L-54-35L-58-44L-67-47L-58-50Z" fill="#C4B5FD" strokeWidth="2" />
        </g>
      );
    case "priority_pro":
      return (
        <g stroke="#9F1239" strokeLinejoin="round">
          <path d="M-31-54L0-44L31-54L25-34L0-26L-25-34Z" fill="#FDA4AF" strokeWidth="3" />
          <path d="M0-45V-29" stroke="#FFF4E6" strokeWidth="3" />
          <path d="M0-42L19-38L0-34Z" fill="#FFF4E6" stroke="none" />
        </g>
      );
    case "deep_work_diver":
      return (
        <g fill="none" stroke="#075985" strokeWidth="4">
          <rect x="-37" y="20" width="31" height="25" rx="10" fill="#BAE6FD" />
          <rect x="6" y="20" width="31" height="25" rx="10" fill="#BAE6FD" />
          <path d="M-6 31H6M-37 33H-45M37 33H45" strokeLinecap="round" />
          <path d="M-42-78Q-52-88-46-97M-52-69Q-59-76-55-82" stroke="#38BDF8" strokeLinecap="round" />
        </g>
      );
    case "perfect_week":
      return (
        <g>
          <path d="M-44-99Q0-120 44-99" fill="none" stroke="#FBBF24" strokeWidth="5" strokeLinecap="round" />
          {[-36, -24, -12, 0, 12, 24, 36].map((x, index) => (
            <path
              key={x}
              d={`M${x} ${index === 3 ? -117 : -111}l2.5 5 5 .8-3.7 3.6.9 5-4.7-2.5-4.7 2.5.9-5-3.7-3.6 5-.8Z`}
              fill={index % 2 ? "#FFF4E6" : "#FFD54F"}
            />
          ))}
        </g>
      );
    case "routine_builder":
      return (
        <g fill="none" stroke="#047857" strokeLinecap="round" strokeWidth="4">
          <path d="M-36-95Q0-112 36-95M-45-84Q-50-64-40-54M45-84Q50-64 40-54" />
          <path d="M-36-94Q-49-108-56-95Q-43-82-36-94ZM36-94Q49-108 56-95Q43-82 36-94Z" fill="#A7F3D0" strokeWidth="3" />
        </g>
      );
    case "challenge_warrior":
      return (
        <g stroke="#6D28D9" strokeLinejoin="round">
          <path d="M-29-102L0-115L29-102L24-91H-24Z" fill="#C4B5FD" strokeWidth="3" />
          <path d="M67 17L83 23V43Q80 57 67 65Q54 57 51 43V23Z" fill="#8B5CF6" strokeWidth="3" />
          <path d="M60 40L66 46L76 34" fill="none" stroke="#FFF4E6" strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    default:
      return null;
  }
}

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

export default function Kindle({
  mood = "happy",
  size = 48,
  animate = false,
  className = "",
  costume,
}) {
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
        <BadgeCostume costume={costume} />
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
const WEEK_PARTICLE_COLORS = ["#ffd54f", "#ff8a1f", "#fb7185", "#fff4e6", "#a78bfa", "#60a5fa"];
const WEEK_PARTICLES = Array.from({ length: 28 }, (_, index) => ({
  angle: `${(360 / 28) * index}deg`,
  distance: `-${135 + (index % 5) * 34}px`,
  delay: `${(index % 7) * 24}ms`,
  duration: `${850 + (index % 4) * 100}ms`,
  color: WEEK_PARTICLE_COLORS[index % WEEK_PARTICLE_COLORS.length],
  size: `${5 + (index % 4) * 2}px`,
  height: `${9 + (index % 4) * 3}px`,
}));

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
export function KindleStreak({ to, scene, week, onWeekCompleteReveal }) {
  const html = useMemo(() => streakSceneHtml(scene, to), [scene, to]);
  const todayQualified = week?.some((day) => day.today && day.qualified);
  const weekComplete = week?.length === 7 && week.every((day) => day.qualified);
  const weekKey = week?.map((day) => day.date).join("|") || "";
  const [newDayRevealed, setNewDayRevealed] = useState(false);
  const latestOnWeekCompleteReveal = useRef(onWeekCompleteReveal);
  const announcedWeekRef = useRef("");
  latestOnWeekCompleteReveal.current = onWeekCompleteReveal;

  useEffect(() => {
    const revealNewDay = () => {
      setNewDayRevealed(true);
      if (weekComplete && weekKey && announcedWeekRef.current !== weekKey) {
        announcedWeekRef.current = weekKey;
        latestOnWeekCompleteReveal.current?.();
      }
    };

    if (!todayQualified) {
      setNewDayRevealed(true);
      return undefined;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      revealNewDay();
      return undefined;
    }

    setNewDayRevealed(false);
    const timer = window.setTimeout(
      revealNewDay,
      weekComplete ? 2100 : 2700,
    );
    return () => window.clearTimeout(timer);
  }, [to, todayQualified, weekComplete, weekKey]);

  const displayedWeek = useMemo(() => {
    if (!todayQualified || newDayRevealed) return week;
    return week.map((day) => day.today ? { ...day, qualified: false } : day);
  }, [newDayRevealed, todayQualified, week]);

  return (
    <>
      {weekComplete && newDayRevealed && (
        <div className="kd-week-fireworks" aria-hidden="true">
          {WEEK_PARTICLES.map((particle, index) => (
            <i
              key={index}
              style={{
                "--particle-angle": particle.angle,
                "--particle-distance": particle.distance,
                "--particle-delay": particle.delay,
                "--particle-duration": particle.duration,
                "--particle-color": particle.color,
                "--particle-size": particle.size,
                "--particle-height": particle.height,
              }}
            />
          ))}
        </div>
      )}
      <Html html={html} />
      <StreakWeekProgress
        week={displayedWeek}
        className="kd-week"
        celebrateWeek={weekComplete && newDayRevealed}
      />
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
