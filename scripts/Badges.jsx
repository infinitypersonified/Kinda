import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Award,
  CalendarCheck,
  Clock3,
  Heart,
  LockKeyhole,
  Flag,
  Moon,
  Repeat,
  Share,
  Sparkles,
  Sun,
  Target,
  Timer,
  Trophy,
  X,
} from "lucide-react";
import Kindle from "../src/Kindle.jsx";
import "../src/badges.css";

const BADGE_ACCENT = "#FB8425";

export const BADGE_CATALOG = [
  {
    id: "first_spark",
    name: "First Spark",
    category: "Getting started",
    description: "Complete your first task.",
    criteria: "Complete 1 task",
    progressKey: "tasksCompleted",
    target: 1,
    mark: "01",
    icon: Sparkles,
    accent: BADGE_ACCENT,
    mood: "celebrate",
    motion: "hop",
  },
  {
    id: "task_master",
    name: "Task Master",
    category: "Momentum",
    description: "Turn small wins into serious momentum.",
    criteria: "Complete 25 tasks",
    progressKey: "tasksCompleted",
    target: 25,
    mark: "25",
    icon: Trophy,
    accent: BADGE_ACCENT,
    mood: "proud",
    motion: "flex",
  },
  {
    id: "century_club",
    name: "Century Club",
    category: "Momentum",
    description: "A hundred finished tasks is no small thing.",
    criteria: "Complete 100 tasks",
    progressKey: "tasksCompleted",
    target: 100,
    mark: "100",
    icon: Award,
    accent: BADGE_ACCENT,
    mood: "cheer",
    motion: "spin",
  },
  {
    id: "half_century",
    name: "Half-Century Hero",
    category: "Momentum",
    description: "Fifty finished tasks, each one a promise kept.",
    criteria: "Complete 50 tasks",
    progressKey: "tasksCompleted",
    target: 50,
    mark: "50",
    icon: Trophy,
    accent: BADGE_ACCENT,
    mood: "proud",
    motion: "flex",
  },
  {
    id: "task_titan",
    name: "Task Titan",
    category: "Momentum",
    description: "You turned a mountain of plans into progress.",
    criteria: "Complete 150 tasks",
    progressKey: "tasksCompleted",
    target: 150,
    mark: "150",
    icon: Award,
    accent: BADGE_ACCENT,
    mood: "cheer",
    motion: "victory",
  },
  {
    id: "task_legend",
    name: "Task Legend",
    category: "Momentum",
    description: "Two hundred little finishes add up to something big.",
    criteria: "Complete 200 tasks",
    progressKey: "tasksCompleted",
    target: 200,
    mark: "200",
    icon: Sparkles,
    accent: BADGE_ACCENT,
    mood: "celebrate",
    motion: "spin",
  },
  {
    id: "five_hundred_strong",
    name: "Five Hundred Strong",
    category: "Momentum",
    description: "A remarkable collection of follow-through.",
    criteria: "Complete 500 tasks",
    progressKey: "tasksCompleted",
    target: 500,
    mark: "500",
    icon: Trophy,
    accent: BADGE_ACCENT,
    mood: "proud",
    motion: "victory",
  },
  {
    id: "four_digit_force",
    name: "Four-Digit Force",
    category: "Momentum",
    description: "A thousand finished tasks. That is real momentum.",
    criteria: "Complete 1,000 tasks",
    progressKey: "tasksCompleted",
    target: 1000,
    mark: "1K",
    icon: Award,
    accent: BADGE_ACCENT,
    mood: "celebrate",
    motion: "victory",
  },
  {
    id: "afternoon_task_killer",
    name: "Afternoon Task Killer",
    category: "Daily rhythm",
    description: "Make the afternoon yours, one finish at a time.",
    criteria: "Complete 5 tasks from 12–6 p.m. local time",
    progressKey: "afternoonTasks",
    target: 5,
    mark: "05",
    icon: Clock3,
    accent: BADGE_ACCENT,
    mood: "happy",
    motion: "shimmy",
  },
  {
    id: "sunrise_spark",
    name: "Sunrise Spark",
    category: "Daily rhythm",
    description: "Get an early win before the day gets loud.",
    criteria: "Complete 5 tasks from 5–9 a.m. local time",
    progressKey: "dawnTasks",
    target: 5,
    mark: "05",
    icon: Sun,
    accent: BADGE_ACCENT,
    mood: "celebrate",
    motion: "hop",
  },
  {
    id: "midnight_momentum",
    name: "Midnight Momentum",
    category: "Daily rhythm",
    description: "Some of your best wins happen after hours.",
    criteria: "Complete 5 tasks from 9 p.m.–midnight local time",
    progressKey: "nightTasks",
    target: 5,
    mark: "05",
    icon: Moon,
    accent: BADGE_ACCENT,
    mood: "think",
    motion: "wave",
  },
  {
    id: "priority_pro",
    name: "Priority Pro",
    category: "Momentum",
    description: "You face the important things head-on.",
    criteria: "Complete 10 high-priority tasks",
    progressKey: "priorityTasks",
    target: 10,
    mark: "10",
    icon: Flag,
    accent: BADGE_ACCENT,
    mood: "proud",
    motion: "flex",
  },
  {
    id: "deep_work_diver",
    name: "Deep Work Diver",
    category: "Focus",
    description: "You gave your focus the time it deserved.",
    criteria: "Complete 5 tasks with at least 25 minutes tracked",
    progressKey: "deepWorkTasks",
    target: 5,
    mark: "05",
    icon: Timer,
    accent: BADGE_ACCENT,
    mood: "cheer",
    motion: "spin",
  },
  {
    id: "perfect_week",
    name: "Perfect Week",
    category: "Consistency",
    description: "Show up and protect your flame all week.",
    criteria: "Qualify all 7 days using Kinda’s streak rules",
    progressKey: "qualifiedWeekDays",
    target: 7,
    mark: "07",
    icon: CalendarCheck,
    accent: BADGE_ACCENT,
    mood: "celebrate",
    motion: "victory",
  },
  {
    id: "routine_builder",
    name: "Routine Builder",
    category: "Habits",
    description: "A repeatable routine is a powerful kind of progress.",
    criteria: "Complete the same repeating task 7 times",
    progressKey: "routineCompletions",
    target: 7,
    mark: "07",
    icon: Repeat,
    accent: BADGE_ACCENT,
    mood: "think",
    motion: "wave",
  },
  {
    id: "challenge_warrior",
    name: "Challenge Warrior",
    category: "Challenges",
    description: "You carried your challenge all the way to the finish.",
    criteria: "Complete every daily task in one challenge",
    progressKey: "challengeProgress",
    target: 100,
    mark: "WIN",
    icon: Target,
    accent: BADGE_ACCENT,
    mood: "proud",
    motion: "victory",
  },
  {
    id: "monthly_50",
    name: "Month in Motion",
    category: "Monthly wins",
    description: "You kept the month moving with steady finishes.",
    criteria: "Complete 50 tasks this month",
    progressKey: "monthlyTasks",
    target: 50,
    mark: "50",
    icon: CalendarCheck,
    accent: BADGE_ACCENT,
    mood: "happy",
    motion: "hop",
  },
  {
    id: "monthly_100",
    name: "Hundred-Daylight Month",
    category: "Monthly wins",
    description: "A hundred tasks finished in one calendar month.",
    criteria: "Complete 100 tasks this month",
    progressKey: "monthlyTasks",
    target: 100,
    mark: "100",
    icon: Award,
    accent: BADGE_ACCENT,
    mood: "proud",
    motion: "spin",
  },
  {
    id: "monthly_20_days",
    name: "Calendar Keeper",
    category: "Monthly wins",
    description: "You made room for progress on twenty different days.",
    criteria: "Complete a task on 20 days this month",
    progressKey: "monthlyActiveDays",
    target: 20,
    mark: "20",
    icon: CalendarCheck,
    accent: BADGE_ACCENT,
    mood: "celebrate",
    motion: "victory",
  },
  {
    id: "perfect_month",
    name: "Perfect Month",
    category: "Monthly wins",
    description: "Every day of a full month met your streak goal.",
    criteria: "Qualify every day in one calendar month",
    progressKey: "qualifiedMonthDays",
    target: 31,
    mark: "31",
    icon: Sparkles,
    accent: BADGE_ACCENT,
    mood: "celebrate",
    motion: "victory",
  },
  {
    id: "monthly_mix",
    name: "A Little of Everything",
    category: "Monthly wins",
    description: "A well-rounded month across different parts of life.",
    criteria: "Complete tasks in 5 categories this month",
    progressKey: "monthlyCategories",
    target: 5,
    mark: "05",
    icon: Target,
    accent: BADGE_ACCENT,
    mood: "happy",
    motion: "wave",
  },
  {
    id: "weekend_month",
    name: "Weekend Keeper",
    category: "Monthly wins",
    description: "Your weekends made space for meaningful progress.",
    criteria: "Complete 12 tasks on weekends this month",
    progressKey: "monthlyWeekendTasks",
    target: 12,
    mark: "12",
    icon: Sun,
    accent: BADGE_ACCENT,
    mood: "proud",
    motion: "flex",
  },
  {
    id: "focus_month",
    name: "Deep Month",
    category: "Monthly wins",
    description: "You gave your best work room to breathe.",
    criteria: "Track 20 focused tasks of 25 minutes or more this month",
    progressKey: "monthlyDeepWorkTasks",
    target: 20,
    mark: "20",
    icon: Timer,
    accent: BADGE_ACCENT,
    mood: "think",
    motion: "shimmy",
  },
  {
    id: "personal_50",
    name: "Grounded",
    category: "By category",
    description: "You kept showing up for the things that matter to you.",
    criteria: "Complete 50 Personal tasks",
    progressKey: "personalTasks",
    target: 50,
    mark: "50",
    icon: Heart,
    accent: BADGE_ACCENT,
    mood: "happy",
    motion: "wave",
  },
  {
    id: "work_25",
    name: "Workday Wizard",
    category: "By category",
    description: "A stack of work tasks, handled with care.",
    criteria: "Complete 25 Work tasks",
    progressKey: "workTasks",
    target: 25,
    mark: "25",
    icon: Flag,
    accent: BADGE_ACCENT,
    mood: "proud",
    motion: "flex",
  },
  {
    id: "learning_25",
    name: "Curious Mind",
    category: "By category",
    description: "You made learning part of your routine.",
    criteria: "Complete 25 Learning tasks",
    progressKey: "learningTasks",
    target: 25,
    mark: "25",
    icon: Sparkles,
    accent: BADGE_ACCENT,
    mood: "think",
    motion: "wave",
  },
  {
    id: "building_25",
    name: "Builder’s Hands",
    category: "By category",
    description: "Ideas became real, one finished step at a time.",
    criteria: "Complete 25 Building tasks",
    progressKey: "buildingTasks",
    target: 25,
    mark: "25",
    icon: Target,
    accent: BADGE_ACCENT,
    mood: "cheer",
    motion: "spin",
  },
  {
    id: "creative_25",
    name: "Made by You",
    category: "By category",
    description: "You made time to bring your ideas to life.",
    criteria: "Complete 25 Creative work tasks",
    progressKey: "creativeTasks",
    target: 25,
    mark: "25",
    icon: Sparkles,
    accent: BADGE_ACCENT,
    mood: "celebrate",
    motion: "shimmy",
  },
  {
    id: "health_25",
    name: "Wellness Keeper",
    category: "By category",
    description: "Small acts of care became a strong habit.",
    criteria: "Complete 25 Health tasks",
    progressKey: "healthTasks",
    target: 25,
    mark: "25",
    icon: Heart,
    accent: BADGE_ACCENT,
    mood: "happy",
    motion: "hop",
  },
  {
    id: "fitness_25",
    name: "Move More",
    category: "By category",
    description: "You kept putting movement on the calendar—and doing it.",
    criteria: "Complete 25 Fitness tasks",
    progressKey: "fitnessTasks",
    target: 25,
    mark: "25",
    icon: Target,
    accent: BADGE_ACCENT,
    mood: "proud",
    motion: "flex",
  },
  {
    id: "relationships_25",
    name: "Showed Up",
    category: "By category",
    description: "You made time for the people who matter.",
    criteria: "Complete 25 Relationships tasks",
    progressKey: "relationshipsTasks",
    target: 25,
    mark: "25",
    icon: Heart,
    accent: BADGE_ACCENT,
    mood: "celebrate",
    motion: "wave",
  },
  {
    id: "finance_10",
    name: "Money Mindful",
    category: "By category",
    description: "You gave your finances consistent attention.",
    criteria: "Complete 10 Finance tasks",
    progressKey: "financeTasks",
    target: 10,
    mark: "10",
    icon: Award,
    accent: BADGE_ACCENT,
    mood: "proud",
    motion: "hop",
  },
  {
    id: "home_25",
    name: "Home Keeper",
    category: "By category",
    description: "You made home and everyday errands feel lighter.",
    criteria: "Complete 25 Home & errands tasks",
    progressKey: "homeTasks",
    target: 25,
    mark: "25",
    icon: Target,
    accent: BADGE_ACCENT,
    mood: "happy",
    motion: "flex",
  },
  {
    id: "community_10",
    name: "Good Neighbor",
    category: "By category",
    description: "A little effort helped your wider community.",
    criteria: "Complete 10 Community tasks",
    progressKey: "communityTasks",
    target: 10,
    mark: "10",
    icon: Heart,
    accent: BADGE_ACCENT,
    mood: "celebrate",
    motion: "victory",
  },
];

function badgeProgress(badge, progress) {
  const target = badge.progressKey === "qualifiedMonthDays"
    ? Number(progress?.daysInMonth) || badge.target
    : badge.target;
  const value = Number(progress?.[badge.progressKey]) || 0;
  const current = Math.min(target, Math.max(0, value));
  return {
    current,
    percent: Math.round((current / target) * 100),
    label: badge.progressKey === "challengeProgress"
      ? `${Math.round(current)}%`
      : `${Math.floor(current)} / ${target}`,
  };
}

export function BadgeCollection({ data, loading, onShareBadge }) {
  const [selectedBadge, setSelectedBadge] = useState(null);
  const earned = new Map(
    (data?.badges || []).map((badge) => [badge.id, badge.earnedAt]),
  );
  const progress = data?.progress || {};
  const earnedCount = BADGE_CATALOG.filter((badge) => earned.has(badge.id)).length;

  return (
    <div className="page-content badge-page">
      <header className="page-header badge-page-header">
        <div>
          <p className="eyebrow">YOUR LITTLE WINS, MADE LEGENDARY</p>
          <h1>Badges</h1>
          <p>Every badge has a story. Keep showing up to collect yours.</p>
        </div>
        <div className="badge-count" aria-label={`${earnedCount} of ${BADGE_CATALOG.length} badges earned`}>
          <Trophy size={18} />
          <b>{earnedCount}<span>/{BADGE_CATALOG.length}</span></b>
          <small>earned</small>
        </div>
      </header>

      {loading && !data ? (
        <p className="quiet-empty" role="status">Gathering your wins…</p>
      ) : (
        <>
          <section className="badge-grid" aria-label="Badge collection">
            {BADGE_CATALOG.map((badge) => {
              const earnedAt = earned.get(badge.id);
              const { current, percent, label } = badgeProgress(badge, progress);
              const Icon = badge.icon;
              return (
                <article
                  className={`badge-card${earnedAt ? " is-earned" : " is-locked"}`}
                  key={badge.id}
                  style={{ "--badge-accent": badge.accent }}
                >
                  <button
                    className="badge-card-open"
                    type="button"
                    onClick={() => setSelectedBadge(badge)}
                    aria-label={`${badge.name}. ${
                      earnedAt
                        ? "Earned badge. View details."
                        : `${badge.criteria}. Progress ${label}. View details.`
                    }`}
                  />
                  <div className="badge-card-art" aria-hidden="true">
                    <span className="badge-card-orbit" />
                    <span className="badge-card-medallion">
                      <span className="badge-card-medallion-inner">
                        <Kindle
                          mood={badge.mood}
                          size={54}
                          costume={badge.id}
                        />
                        <span className="badge-card-medallion-symbol">
                          <Icon size={13} strokeWidth={2.5} />
                        </span>
                        <span className="badge-card-medallion-mark">{badge.mark}</span>
                      </span>
                    </span>
                    {!earnedAt && (
                      <span className="badge-card-lock">
                        <LockKeyhole size={13} />
                      </span>
                    )}
                  </div>
                  <div className="badge-card-copy">
                    <span className="badge-card-category">{badge.category}</span>
                    <h2>{badge.name}</h2>
                    <p>{badge.description}</p>
                  </div>
                  {earnedAt ? (
                    <p className="badge-earned-date">
                      Earned {new Intl.DateTimeFormat(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }).format(new Date(earnedAt))}
                    </p>
                  ) : (
                    <div className="badge-card-progress">
                      <div className="badge-progress-label">
                        <span>{badge.criteria}</span>
                        <b>{label}</b>
                      </div>
                      <span
                        className="badge-progress-track"
                        role="progressbar"
                        aria-label={`${badge.name} progress`}
                        aria-valuemin={0}
                        aria-valuemax={badge.target}
                        aria-valuenow={current}
                      >
                        <i style={{ width: `${percent}%` }} />
                      </span>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
          <p className="badge-page-note">
            Badges are yours to keep. Your sound and motion preferences are respected when one unlocks.
          </p>
        </>
      )}
      {selectedBadge && (
        <BadgeDetailDialog
          badge={selectedBadge}
          earnedAt={earned.get(selectedBadge.id)}
          progress={progress}
          onShareBadge={onShareBadge}
          onClose={() => setSelectedBadge(null)}
        />
      )}
    </div>
  );
}

function BadgeDetailDialog({ badge, earnedAt, progress, onShareBadge, onClose }) {
  const closeRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const Icon = badge.icon;
  const { current, percent, label } = badgeProgress(badge, progress);

  useEffect(() => {
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
  }, [onClose]);

  async function shareBadge() {
    if (!onShareBadge || sharing) return;
    setSharing(true);
    try {
      await onShareBadge(badge);
    } finally {
      setSharing(false);
    }
  }

  return createPortal(
    <div
      className="badge-detail-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`badge-detail-card${earnedAt ? " is-earned" : " is-locked"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-detail-title"
        style={{ "--badge-accent": badge.accent }}
      >
        <button
          ref={closeRef}
          className="badge-detail-close"
          type="button"
          onClick={onClose}
          aria-label="Close badge details"
        >
          <X size={20} />
        </button>
        <p className="badge-detail-kicker">
          {earnedAt ? "A KINDA KEEPSAKE" : "IN YOUR SIGHTS"}
        </p>
        <div className="badge-detail-stage" aria-hidden="true">
          <span className="badge-detail-halo" />
          <div className="badge-detail-medallion">
            <span className="badge-detail-rim" />
            <Kindle
              mood={badge.mood}
              size={164}
              animate
              costume={badge.id}
            />
            <span className="badge-detail-symbol">
              <Icon size={20} strokeWidth={2.4} />
            </span>
            <span className="badge-detail-mark">{badge.mark}</span>
          </div>
          <Sparkles className="badge-detail-spark badge-detail-spark-one" size={20} />
          <Sparkles className="badge-detail-spark badge-detail-spark-two" size={15} />
        </div>
        <div className="badge-detail-copy">
          <span className="badge-card-category">{badge.category}</span>
          <h2 id="badge-detail-title">{badge.name}</h2>
          <p>{badge.description}</p>
        </div>
        {earnedAt ? (
          <p className="badge-detail-earned">
            Earned{" "}
            {new Intl.DateTimeFormat(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            }).format(new Date(earnedAt))}
          </p>
        ) : (
          <div className="badge-detail-progress">
            <div className="badge-progress-label">
              <span>{badge.criteria}</span>
              <b>{label}</b>
            </div>
            <span
              className="badge-progress-track"
              role="progressbar"
              aria-label={`${badge.name} progress`}
              aria-valuemin={0}
              aria-valuemax={badge.target}
              aria-valuenow={current}
            >
              <i style={{ width: `${percent}%` }} />
            </span>
          </div>
        )}
        <button
          className="badge-detail-action"
          type="button"
          onClick={earnedAt ? shareBadge : onClose}
          disabled={earnedAt ? sharing || !onShareBadge : false}
        >
          {earnedAt ? (
            <>
              <Share size={17} strokeWidth={2.5} />
              {sharing ? "Preparing badge…" : "Share this badge"}
            </>
          ) : (
            "I’m on it"
          )}
        </button>
      </section>
    </div>,
    document.body,
  );
}

export function BadgeUnlock({ badge, onDone, onShown, onShare }) {
  const doneRef = useRef(onDone);
  const shownRef = useRef(onShown);
  const shareRef = useRef(onShare);
  const announcedBadgeRef = useRef("");
  const [sharing, setSharing] = useState(false);
  doneRef.current = onDone;
  shownRef.current = onShown;
  shareRef.current = onShare;
  const Icon = badge.icon;

  useEffect(() => {
    if (announcedBadgeRef.current !== badge.id) {
      announcedBadgeRef.current = badge.id;
      shownRef.current?.();
    }
    if (sharing) return undefined;
    const timer = window.setTimeout(() => doneRef.current(), 12000);
    return () => window.clearTimeout(timer);
  }, [badge.id, sharing]);

  async function shareAchievement() {
    if (!shareRef.current || sharing) return;
    setSharing(true);
    try {
      await shareRef.current(badge);
    } finally {
      setSharing(false);
    }
  }

  return createPortal(
    <div
      className="badge-unlock-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${badge.name} badge unlocked`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) doneRef.current();
      }}
    >
      <div
        className={`badge-unlock-card badge-motion-${badge.motion}`}
        style={{ "--badge-accent": badge.accent }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="badge-unlock-rays" aria-hidden="true" />
        <span className="badge-unlock-eyebrow"><Sparkles size={14} /> BADGE UNLOCKED</span>
        <div className="badge-unlock-medallion" aria-hidden="true">
          <span className="badge-unlock-medallion-inner">
            <Kindle mood={badge.mood} size={80} costume={badge.id} />
            <span className="badge-unlock-medallion-symbol">
              <Icon size={17} strokeWidth={2.4} />
            </span>
            <span className="badge-unlock-medallion-mark">{badge.mark}</span>
          </span>
        </div>
        <div className="badge-unlock-copy">
          <h2>{badge.name}</h2>
          <p>{badge.description}</p>
        </div>
        <div className={`badge-unlock-kindle badge-kind-${badge.motion}`}>
          <Kindle mood={badge.mood} size={112} animate costume={badge.id} />
        </div>
        <div className="badge-unlock-actions">
          <button
            type="button"
            className="badge-unlock-share"
            onClick={shareAchievement}
            disabled={sharing || !shareRef.current}
          >
            <Share size={17} strokeWidth={2.5} />
            {sharing ? "Preparing your share…" : "Share this achievement"}
          </button>
          <button
            type="button"
            className="badge-unlock-button"
            onClick={() => doneRef.current()}
            disabled={sharing}
          >
            Add to my collection
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
