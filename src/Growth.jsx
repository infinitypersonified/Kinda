import React, { useEffect, useMemo, useRef, useState } from "react";
import Kindle from "./Kindle.jsx";
import { summarizeWeek, taskEntries, weekStartKey } from "./weekly.jsx";

// Everything here is worked out on this device from the tasks the app has
// already loaded (the last ~35 days). Nothing is sent anywhere and no extra
// data is fetched. It never touches streak numbers.

const pad = (value) => String(value).padStart(2, "0");
const ymd = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseYmd = (key) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const addDays = (key, amount) => {
  const date = parseYmd(key);
  date.setDate(date.getDate() + amount);
  return ymd(date);
};
const norm = (title) => String(title || "").trim().toLowerCase().replace(/\s+/g, " ");
const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const TIME_WORDS = /\b(\d{1,2}(:\d{2})?\s?(am|pm)|at \d{1,2}|morning|evening|tonight|noon)\b/i;

function pct(done, total) {
  return total ? Math.round((done / total) * 100) : 0;
}

function analyse(tasks) {
  const today = ymd(new Date());
  const thisWeek = summarizeWeek(tasks, weekStartKey(0));
  const lastWeek = summarizeWeek(tasks, weekStartKey(-1));
  const entries = tasks.flatMap(taskEntries).filter((entry) => entry.day <= today);

  // Per-day totals (a moved task counts as not done on the day it was planned).
  const perDay = new Map();
  entries.forEach((entry) => {
    const item = perDay.get(entry.day) || { total: 0, done: 0 };
    item.total += 1;
    if (entry.status === "done") item.done += 1;
    perDay.set(entry.day, item);
  });

  // Rhythm: five weeks ending this week.
  const gridStart = addDays(weekStartKey(0), -28);
  const rhythm = Array.from({ length: 35 }, (_, index) => {
    const key = addDays(gridStart, index);
    return { key, done: (perDay.get(key) || { done: 0 }).done, future: key > today };
  });

  // Habits: repeating tasks, grouped by title, over the last 7 and 28 days.
  const habitMap = new Map();
  tasks.forEach((task) => {
    if (!task.repeat || task.repeat === "none") return;
    const key = norm(task.title);
    const habit = habitMap.get(key) || { title: task.title, days: new Map() };
    taskEntries(task).forEach((entry) => {
      if (entry.day > today || entry.status === "moved") return;
      habit.days.set(entry.day, entry.status === "done");
    });
    habitMap.set(key, habit);
  });
  const lastSeven = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const habits = [...habitMap.values()]
    .map((habit) => {
      const month = [...habit.days.entries()].filter(([day]) => day >= addDays(today, -27));
      return {
        title: habit.title,
        dots: lastSeven.map((day) => (habit.days.has(day) ? (habit.days.get(day) ? 1 : 0) : -1)),
        done: month.filter(([, done]) => done).length,
        total: month.length,
      };
    })
    .filter((habit) => habit.total >= 3)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Comeback speed: days from a weak day (under half finished) to the next solid one.
  const orderedDays = [...perDay.keys()].sort();
  const gaps = [];
  orderedDays.forEach((day, index) => {
    const stat = perDay.get(day);
    if (day === today || pct(stat.done, stat.total) >= 50) return;
    for (let next = index + 1; next < orderedDays.length; next += 1) {
      const later = perDay.get(orderedDays[next]);
      if (pct(later.done, later.total) >= 50) {
        gaps.push((parseYmd(orderedDays[next]) - parseYmd(day)) / 86400000);
        break;
      }
    }
  });
  const comeback = gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : null;

  // Patterns found in the tasks themselves.
  const insights = [];
  let experiment = "Plan tomorrow’s tasks tonight, so you start the day knowing what’s first.";

  const finished = tasks.filter((task) => task.done && task.completedAt);
  if (finished.length >= 6) {
    const buckets = { morning: 0, afternoon: 0, evening: 0 };
    finished.forEach((task) => {
      const hour = new Date(task.completedAt).getHours();
      buckets[hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"] += 1;
    });
    const [best, count] = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
    if (pct(count, finished.length) >= 40) {
      insights.push({ icon: "◔", text: `You finish most of your tasks in the ${best}. That’s your strongest time.` });
      experiment = `Do your hardest task first thing in the ${best} this week.`;
    }
  }

  const movedCounts = new Map();
  tasks.forEach((task) => {
    const moves = (task.movedFrom || []).length;
    if (moves) {
      const key = norm(task.title);
      const item = movedCounts.get(key) || { title: task.title, moves: 0 };
      item.moves += moves;
      movedCounts.set(key, item);
    }
  });
  const mostMoved = [...movedCounts.values()].sort((a, b) => b.moves - a.moves)[0];
  if (mostMoved && mostMoved.moves >= 2) {
    insights.push({ icon: "⇄", text: `“${mostMoved.title}” has been moved ${mostMoved.moves} times. Try giving it a fixed time.` });
    experiment = `Give “${mostMoved.title}” a fixed time and a reminder this week.`;
  }

  const timed = tasks.filter((task) => task.reminderTime || TIME_WORDS.test(task.title || ""));
  const untimed = tasks.filter((task) => !(task.reminderTime || TIME_WORDS.test(task.title || "")));
  const rate = (list) => pct(list.filter((task) => task.done).length, list.length);
  if (timed.length >= 5 && untimed.length >= 5 && rate(timed) - rate(untimed) >= 15) {
    insights.push({ icon: "◷", text: `Tasks with a set time get finished ${rate(timed)}% of the time, against ${rate(untimed)}% for the rest.` });
  }

  const weekdayStats = Array.from({ length: 7 }, () => ({ total: 0, done: 0 }));
  perDay.forEach((stat, day) => {
    const slot = weekdayStats[parseYmd(day).getDay()];
    slot.total += stat.total;
    slot.done += stat.done;
  });
  const bestDay = weekdayStats
    .map((stat, index) => ({ index, rate: pct(stat.done, stat.total), total: stat.total }))
    .filter((stat) => stat.total >= 5)
    .sort((a, b) => b.rate - a.rate)[0];
  if (bestDay && bestDay.rate >= 60) {
    insights.push({ icon: "★", text: `${WEEKDAYS[bestDay.index]} are your best days, with ${bestDay.rate}% finished.` });
  }

  const loads = [...perDay.values()].filter((stat) => stat.total > 0);
  if (loads.length >= 8) {
    const sorted = loads.map((stat) => stat.total).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const heavy = loads.filter((stat) => stat.total > median);
    const light = loads.filter((stat) => stat.total <= median);
    const heavyRate = pct(heavy.reduce((s, x) => s + x.done, 0), heavy.reduce((s, x) => s + x.total, 0));
    const lightRate = pct(light.reduce((s, x) => s + x.done, 0), light.reduce((s, x) => s + x.total, 0));
    if (heavy.length >= 3 && lightRate - heavyRate >= 15) {
      insights.push({ icon: "⚖", text: `On busier days you finish ${heavyRate}% of your tasks, against ${lightRate}% on lighter days.` });
    }
  }

  return {
    thisWeek,
    lastWeek,
    delta: thisWeek.completion - lastWeek.completion,
    hasLast: lastWeek.total > 0,
    rhythm,
    habits,
    comeback,
    insights: insights.slice(0, 4),
    experiment,
    enough: entries.length >= 5,
  };
}

function level(done) {
  if (done <= 0) return 0;
  if (done <= 2) return 1;
  if (done <= 4) return 2;
  return 3;
}

const COACH_PROMPTS = [
  { key: "focus", label: "What should I focus on today?", question: "What should I focus on today?" },
  { key: "week", label: "How is my week going?", question: "How is my week going?" },
  { key: "timing", label: "When do I get most done?", question: "When do I get most done?" },
  { key: "rescheduling", label: "What do I keep moving?", question: "What do I keep moving?" },
  { key: "streak", label: "What’s my streak?", question: "What’s my current streak?" },
  { key: "planning", label: "What’s due today?", question: "What tasks are due today?" },
  { key: "counts", label: "How many did I finish?", question: "How many tasks did I complete this week?" },
];

function cleanQuestion(value) {
  return String(value || "").trim().toLocaleLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}@\s-]/gu, " ").replace(/\s+/g, " ");
}

function findNamedTask(question, tasks) {
  return [...tasks]
    .filter((task) => task.title && cleanQuestion(task.title).length >= 2)
    .sort((first, second) => second.title.length - first.title.length)
    .find((task) => question.includes(cleanQuestion(task.title)));
}

function focusTaskForToday(tasks, today) {
  return tasks
    .filter((task) => !task.done && task.dueDate && task.dueDate <= today)
    .sort((first, second) => {
      const score = (task) =>
        (task.dueDate < today ? 8 : 4) +
        (task.priority === "high" ? 3 : task.priority === "normal" ? 2 : 1) +
        (Number(task.targetMinutes) <= 25 ? 1 : 0);
      return score(second) - score(first) || first.dueDate.localeCompare(second.dueDate);
    })[0] || tasks
      .filter((task) => !task.done && task.dueDate > today)
      .sort((first, second) => first.dueDate.localeCompare(second.dueDate))[0] || tasks
      .filter((task) => !task.done && !task.dueDate)
      .sort((first, second) => (second.priority === "high") - (first.priority === "high"))[0] || null;
}

const GOAL_CADENCES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function cadencePeriod(cadence, today) {
  if (cadence === "weekly") return weekStartKey(0);
  if (cadence === "monthly") return today.slice(0, 7);
  if (cadence === "yearly") return today.slice(0, 4);
  return today;
}

function goalRecommendation(goal, barrier) {
  const text = String(goal || "").toLowerCase();
  const obstacle = String(barrier || "").toLowerCase();
  const shortOnTime = /time|busy|schedule|overwhelm/.test(obstacle);
  if (/read|book|novel/.test(text)) return shortOnTime ? "Read 2 pages of your book" : "Read 5 pages of your book";
  if (/exercise|fitness|work ?out|run|walk/.test(text)) return shortOnTime ? "Take a 5-minute walk" : "Take a 10-minute walk";
  if (/sleep|rest|bedtime/.test(text)) return "Start your wind-down routine 15 minutes earlier";
  if (/learn|study|course|skill/.test(text)) return shortOnTime ? "Study for 5 focused minutes" : "Study for 15 focused minutes";
  if (/save|money|budget|finance/.test(text)) return "Review one expense and choose a small amount to save";
  if (/clean|organ|declutter|tidy/.test(text)) return "Spend 10 minutes on one small area";
  if (/work|career|project|business/.test(text)) return shortOnTime ? "Spend 5 focused minutes on your next project step" : "Spend 25 focused minutes on your next project step";
  const cleanGoal = String(goal || "your goal").trim().replace(/[.!?]+$/, "");
  return `Spend ${shortOnTime ? 5 : 10} minutes on: ${cleanGoal}`.slice(0, 120);
}

function GoalCheckIn({ userId, today, api, onCreateTask, onGoalChange }) {
  const storageKey = userId ? `kinda:goal-checkin:${userId}` : null;
  const [saved, setSaved] = useState(null);
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [progress, setProgress] = useState("");
  const [barrier, setBarrier] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [cadence, setCadence] = useState("weekly");
  const [syncState, setSyncState] = useState("local");

  useEffect(() => {
    let value = null;
    try { value = storageKey ? JSON.parse(localStorage.getItem(storageKey) || "null") : null; } catch { value = null; }
    setSaved(value && typeof value === "object" ? value : null);
    onGoalChange?.(value && typeof value === "object" ? value : null);
    setGoal(value?.goal || "");
    setProgress("");
    setBarrier(value?.barrier || "");
    setNextStep(value?.nextStep || "");
    setCadence(value?.cadence || "weekly");
    setOpen(!value);
    setSyncState("syncing");
    if (!storageKey || !api) return undefined;
    let cancelled = false;
    api("/goal-checkin").then(({ goal: remote }) => {
      if (cancelled) return;
      if (remote) {
        setSaved(remote);
        onGoalChange?.(remote);
        setGoal(remote.goal || "");
        setBarrier(remote.barrier || "");
        setNextStep(remote.nextStep || "");
        setCadence(remote.cadence || "weekly");
        setOpen(false);
        try { localStorage.setItem(storageKey, JSON.stringify(remote)); } catch { /* Server copy remains available. */ }
        setSyncState("synced");
        return;
      }
      if (value) {
        return api("/goal-checkin", { method: "POST", body: JSON.stringify(value) })
          .then(() => { if (!cancelled) setSyncState("synced"); })
          .catch(() => { if (!cancelled) setSyncState("local"); });
      }
      setSyncState("synced");
    }).catch(() => {
      if (!cancelled) setSyncState("local");
    });
    return () => { cancelled = true; };
  }, [storageKey, api]);

  const due = !saved || saved.cadence !== cadence || saved.period !== cadencePeriod(cadence, today);
  const cadenceLabel = GOAL_CADENCES.find((item) => item.value === cadence)?.label.toLowerCase() || "weekly";
  const checkInPrompt = {
    daily: "What would a small win look like today?",
    weekly: "What progress did you make toward it this week?",
    monthly: "What changed this month, and what needs adjusting?",
    yearly: "How does this goal fit the year you want to have?",
  }[cadence];
  const recommendedStep = saved?.nextStep || (saved?.goal ? goalRecommendation(saved.goal, saved.barrier) : "");

  async function submit(event) {
    event.preventDefault();
    const cleanGoal = goal.trim();
    if (!cleanGoal || !storageKey) return;
    const nextSaved = {
      goal: cleanGoal,
      progress: progress.trim(),
      barrier: barrier.trim(),
      nextStep: nextStep.trim(),
      cadence,
      period: cadencePeriod(cadence, today),
      updatedAt: new Date().toISOString(),
    };
    try { localStorage.setItem(storageKey, JSON.stringify(nextSaved)); } catch { /* Keep the current session usable if storage is unavailable. */ }
    setSaved(nextSaved);
    onGoalChange?.(nextSaved);
    setOpen(false);
    setProgress("");
    setSyncState("syncing");
    try {
      await api?.("/goal-checkin", { method: "POST", body: JSON.stringify(nextSaved) });
      setSyncState(api ? "synced" : "local");
    } catch {
      setSyncState("local");
    }
  }

  return (
    <section className="growth-goal" aria-label="Goal check-in">
      <div className="growth-goal-head">
        <div>
          <small>{saved ? (due ? `${cadenceLabel} check-in` : "Your goal") : "Start with what matters"}</small>
          <h2>{saved ? saved.goal : "What goal would you like Kinda to support?"}</h2>
        </div>
        {!open && <button className="text-link" type="button" onClick={() => setOpen(true)}>{due ? "Check in" : "Edit goal"}</button>}
      </div>

      {!open && saved && (
        <>
          {due ? <p className="growth-goal-note">A short check-in helps keep your recommendations relevant.</p> : <p className="growth-goal-note">Next check-in: {cadenceLabel}. {syncState === "synced" ? "Your goal is private to your account." : syncState === "syncing" ? "Saving your goal…" : "Saved on this device; account sync is unavailable."}</p>}
          {recommendedStep && (
            <div className="growth-goal-next">
              <div><small>{saved.nextStep ? "Your next step" : "Kinda’s suggestion"}</small><p>{recommendedStep}</p></div>
              <button className="button button-secondary small-button" type="button" onClick={() => onCreateTask?.(recommendedStep)}>Add as task</button>
            </div>
          )}
        </>
      )}

      {open && (
        <form className="growth-goal-form" onSubmit={submit}>
          <label>
            What goal would you like Kinda to help with?
            <input value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={120} required placeholder="For example, read more consistently" />
          </label>
          {saved && <label>
            {checkInPrompt}
            <textarea value={progress} onChange={(event) => setProgress(event.target.value)} maxLength={300} rows={2} placeholder="A few words is enough" />
          </label>}
          <div className="growth-goal-fields">
            <label>
              What might get in the way? <span className="optional-label">Optional</span>
              <input value={barrier} onChange={(event) => setBarrier(event.target.value)} maxLength={160} placeholder="Time, energy, remembering…" />
            </label>
            <label>
              One small next step
              <input value={nextStep} onChange={(event) => setNextStep(event.target.value)} maxLength={120} placeholder="For example, read 10 pages" />
            </label>
          </div>
          <label className="growth-goal-cadence">
            How often should Kinda check in?
            <select value={cadence} onChange={(event) => setCadence(event.target.value)}>
              {GOAL_CADENCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <div className="growth-goal-actions">
            <button className="button button-primary small-button" type="submit" disabled={!goal.trim()}>{saved ? "Save check-in" : "Save goal"}</button>
            {saved && <button className="text-link" type="button" onClick={() => {
              setGoal(saved.goal || "");
              setBarrier(saved.barrier || "");
              setNextStep(saved.nextStep || "");
              setCadence(saved.cadence || "weekly");
              setProgress("");
              setOpen(false);
            }}>Cancel</button>}
          </div>
          <p className="growth-goal-note">Kinda uses this goal to shape suggestions. Check-ins appear when you open Growth; they won’t send notifications.</p>
        </form>
      )}
    </section>
  );
}

function buildCoachReply(rawQuestion, tasks, today, week, streak, goalProfile) {
  const question = cleanQuestion(rawQuestion);
  const namedTask = findNamedTask(question, tasks);
  const asksMove = /\b(move|reschedule|push|shift)\b/.test(question) && /\b(tomorrow|next day)\b/.test(question);
  const asksComplete = /^(mark|complete|finish|done)\b/.test(question);

  if (asksMove) {
    if (!namedTask) return { category: "actions", text: "I couldn’t match that to a task. Include its title, like “Move grocery shopping to tomorrow.”" };
    if (namedTask.done) return { category: "actions", text: `“${namedTask.title}” is already complete, so I can’t move it.` };
    return { category: "actions", text: `I found “${namedTask.title}”. You can review the change before it’s saved.`, action: { kind: "move", task: namedTask, label: "Review move to tomorrow" } };
  }

  if (asksComplete) {
    if (!namedTask) return { category: "actions", text: "I couldn’t match that to a task. Include its title, like “Mark water the plants done.”" };
    if (namedTask.done) return { category: "actions", text: `“${namedTask.title}” is already marked complete.` };
    return { category: "actions", text: `I found “${namedTask.title}”. Mark it complete?`, action: { kind: "complete", task: namedTask, label: "Mark complete" } };
  }

  if (/\b(hello|hi|hey|good morning|good afternoon|good evening)\b/.test(question)) {
    return { category: "welcome", text: "Hi. Ask me about today’s focus, your week, when you tend to finish tasks, or tasks you keep moving. You can also ask me to move or complete a task by name." };
  }

  if (/\b(streak|streaks)\b/.test(question)) {
    if (!streak) return { category: "streak", text: "Your streak hasn’t loaded yet. Give Kinda a moment, then ask me again." };
    return {
      category: "streak",
      text: `Your current streak is ${Number(streak.current) || 0} days${streak.best ? `, and your best is ${streak.best} days` : ""}.${streak.doneToday ? " You’ve met today’s goal." : " Keep going on today’s tasks to protect it."}`,
      evidence: "Kinda streak summary",
    };
  }

  if (/\b(am i done|done for today|did i finish|how many left|left for today|today progress)\b/.test(question)) {
    const todayTasks = tasks.filter((task) => task.dueDate === today);
    const done = todayTasks.filter((task) => task.done).length;
    const total = todayTasks.length;
    const needed = total < 5 ? 5 - total : Math.max(0, Math.ceil(total * 0.8) - done);
    return {
      category: "focus",
      text: streak?.doneToday
        ? `You’ve met today’s goal: ${done} of ${total} tasks due today are complete.`
        : `You’ve completed ${done} of ${total} tasks due today. ${needed ? `Kinda’s streak goal needs ${needed} more task${needed === 1 ? "" : "s"} completed.` : "Today’s task goal is met."}`,
      evidence: `${done} complete · ${total} due today`,
    };
  }

  if (/\b(what|which|list).{0,30}\b(completed|complete|finished|done)\b/.test(question)) {
    const start = /\b(today)\b/.test(question) ? today : /\b(this week|week)\b/.test(question) ? weekStartKey(0) : addDays(today, -6);
    const completed = tasks.filter((task) => {
      if (!task.done) return false;
      const completedOn = task.completedAt ? ymd(new Date(task.completedAt)) : task.dueDate || "";
      return completedOn >= start && completedOn <= today;
    });
    return {
      category: "counts",
      text: completed.length
        ? `You completed ${completed.length} task${completed.length === 1 ? "" : "s"}: ${completed.slice(0, 6).map((task) => `“${task.title}”`).join(", " )}${completed.length > 6 ? `, and ${completed.length - 6} more` : ""}.`
        : "I don’t see a completed task in that period yet.",
      evidence: `${start === today ? "Today" : start === weekStartKey(0) ? "This week to date" : "Last 7 days"} · completed tasks`,
    };
  }

  if (namedTask && /\b(due|priority|status|details|tell me about|what is|whats|complete|finished|done|about|why|when|how)\b/.test(question)) {
    const status = namedTask.done ? "complete" : "still open";
    const due = namedTask.dueDate ? ` It’s due ${dayLabel(namedTask.dueDate).toLowerCase()}.` : " It has no due date.";
    const priority = namedTask.priority ? ` Priority is ${namedTask.priority}.` : "";
    return { category: "task-details", text: `“${namedTask.title}” is ${status}.${due}${priority}`, evidence: "From your task list" };
  }

  if (/\b(how many|number of|count|total)\b/.test(question)) {
    const wantsCompleted = /\b(completed|complete|finished|finish|done|achieved)\b/.test(question);
    if (wantsCompleted) {
      const yesterday = addDays(today, -1);
      const monthStart = `${today.slice(0, 7)}-01`;
      const start = /\byesterday\b/.test(question)
        ? yesterday
        : /\b(today|this morning|this afternoon)\b/.test(question)
          ? today
          : /\b(this week|week to date|weekly)\b/.test(question)
            ? weekStartKey(0)
            : /\b(this month)\b/.test(question)
              ? monthStart
              : /\b(monthly|last 30 days|past 30 days)\b/.test(question)
                ? addDays(today, -29)
                : addDays(today, -6);
      const end = /\byesterday\b/.test(question) ? yesterday : today;
      const completed = tasks.filter((task) => {
        if (!task.done) return false;
        const completionDate = task.completedAt
          ? ymd(new Date(task.completedAt))
          : task.dueDate || "";
        return completionDate >= start && completionDate <= end;
      });
      const period = start === yesterday && end === yesterday ? "yesterday" : start === today ? "today" : start === weekStartKey(0) ? "this week to date" : start === monthStart ? "this month" : start === addDays(today, -29) ? "the last 30 days" : "the last 7 days";
      return { category: "counts", text: `You’ve completed ${completed.length} task${completed.length === 1 ? "" : "s"} in ${period}.`, evidence: `${period} · based on your completed tasks` };
    }
    const dueDate = /\btomorrow\b/.test(question) ? addDays(today, 1) : today;
    const open = tasks.filter((task) => !task.done && task.dueDate === dueDate);
    const label = dueDate === today ? "today" : "tomorrow";
    return { category: "counts", text: `You have ${open.length} open task${open.length === 1 ? "" : "s"} due ${label}.`, evidence: `${label} · open tasks` };
  }

  if (/\b(overdue|due|upcoming|planned|open tasks|what tasks|which tasks)\b/.test(question)) {
    let label = "due today";
    let list = tasks.filter((task) => !task.done && task.dueDate === today);
    if (/\boverdue\b/.test(question)) {
      label = "overdue";
      list = tasks.filter((task) => !task.done && task.dueDate && task.dueDate < today);
    } else if (/\btomorrow\b/.test(question)) {
      label = "due tomorrow";
      const tomorrow = addDays(today, 1);
      list = tasks.filter((task) => !task.done && task.dueDate === tomorrow);
    } else if (/\b(upcoming|next few days)\b/.test(question)) {
      label = "coming up in the next 7 days";
      const end = addDays(today, 7);
      list = tasks.filter((task) => !task.done && task.dueDate > today && task.dueDate <= end);
    }
    const titles = list.slice(0, 5).map((task) => `“${task.title}”`);
    return {
      category: "planning",
      text: titles.length ? `You have ${list.length} open task${list.length === 1 ? "" : "s"} ${label}: ${titles.join(", " )}${list.length > titles.length ? `, and ${list.length - titles.length} more` : ""}.` : `You don’t have any open tasks ${label}.`,
      evidence: `${list.length} ${label}`,
    };
  }

  if (/\b(week|weekly|progress|productiv|follow.?through|doing|how am i|how.*going)\b/.test(question)) {
    if (!week.total) return { category: "week", text: "There isn’t enough planned task history for this week yet. As you add and finish tasks, I can summarize your follow-through here." };
    return { category: "week", text: `You’ve completed ${week.done.length} of ${week.total} planned task entries so far this week (${week.completion}%).${week.bestDay ? ` ${week.bestDay.label} has the most completions so far (${week.bestDay.done}).` : " I don’t have a clear strongest day yet."}`, evidence: `${week.total} task entries · week to date` };
  }

  if (/\b(focus|start|priorit|what should i do|what do i do|what next|next task|today|first)\b/.test(question)) {
    if (goalProfile?.goal) {
      const nextStep = goalProfile.nextStep || goalRecommendation(goalProfile.goal, goalProfile.barrier);
      return {
        category: "focus",
        text: `For your goal, “${goalProfile.goal},” a useful small step is: ${nextStep}. Add it to today’s list if it fits your day.`,
        evidence: "Based on your saved goal and the obstacle you mentioned",
        action: { kind: "create", title: nextStep, label: "Add as task" },
      };
    }
    const openToday = tasks.filter((task) => !task.done && task.dueDate === today);
    const overdue = tasks.filter((task) => !task.done && task.dueDate && task.dueDate < today);
    const choice = focusTaskForToday(tasks, today);
    if (!choice) return { category: "focus", text: "You don’t have an open dated task to focus on. Add one small task for today, or ask me about your week." };
    const timing = !choice.dueDate ? "It doesn’t have a due date yet." : choice.dueDate < today ? "It’s overdue." : choice.dueDate === today ? "It’s due today." : `It’s the next dated task, due ${dayLabel(choice.dueDate)}.`;
    const priority = choice.priority === "high" ? " It’s marked high priority." : "";
    return { category: "focus", text: `I’d start with “${choice.title}”. ${timing}${priority}${overdue.length + openToday.length > 1 ? ` You have ${overdue.length + openToday.length} open tasks due today or earlier, so choose one and keep the rest for later.` : ""}`, evidence: `${overdue.length} overdue · ${openToday.length} due today`, task: choice };
  }

  if (/\b(when|time|morning|afternoon|evening|productive|most done|strongest day|best day|weekday)\b/.test(question)) {
    const cutoff = Date.now() - 30 * 86400000;
    const completed = tasks.filter((task) => task.done && task.completedAt && Date.parse(task.completedAt) >= cutoff && Date.parse(task.completedAt) <= Date.now());
    if (completed.length < 6) return { category: "timing", text: `I’ve seen ${completed.length} completed tasks in the last 30 days. I need a few more before I can point to a reliable time or day.`, evidence: `${completed.length} completions · last 30 days` };
    const weekdays = Array(7).fill(0);
    const times = { morning: 0, afternoon: 0, evening: 0 };
    completed.forEach((task) => {
      const date = new Date(task.completedAt);
      weekdays[date.getDay()] += 1;
      const hour = date.getHours();
      times[hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"] += 1;
    });
    const weekday = weekdays.indexOf(Math.max(...weekdays));
    const timeOfDay = Object.entries(times).sort((first, second) => second[1] - first[1])[0];
    return { category: "timing", text: `In the last 30 days, you completed the most tasks on ${WEEKDAYS[weekday]} (${weekdays[weekday]}). Your most common completion time was the ${timeOfDay[0]} (${timeOfDay[1]} of ${completed.length}). That’s a pattern in your history, not a guarantee about future tasks.`, evidence: `${completed.length} completions · last 30 days` };
  }

  if (/\b(move|moving|postpon|putting off|reschedul|keep delay)\b/.test(question)) {
    const cutoff = addDays(today, -30);
    const moved = tasks
      .map((task) => ({ task, count: (task.movedFrom || []).filter((day) => day >= cutoff && day <= today).length }))
      .filter((item) => item.count)
      .sort((first, second) => second.count - first.count);
    const repeated = moved.find((item) => item.count >= 2);
    if (!moved.length) return { category: "rescheduling", text: "I haven’t found a task moved in the last 30 days. If you reschedule tasks in Kinda, I can look for a repeated pattern." };
    return { category: "rescheduling", text: repeated ? `“${repeated.task.title}” has been moved ${repeated.count} times in the last 30 days. Would making the first step smaller or choosing a more realistic day help?` : `I found ${moved.length} task${moved.length === 1 ? "" : "s"} moved in the last 30 days. None has been moved repeatedly yet.`, evidence: `${moved.reduce((sum, item) => sum + item.count, 0)} recorded moves · last 30 days` };
  }

  // If a question names one of the user's tasks but doesn't match a known
  // question type, still answer with verified task facts instead of the
  // general fallback. This keeps the deterministic coach useful without
  // pretending to understand free-form questions like a language model.
  if (namedTask) {
    const status = namedTask.done ? "complete" : "still open";
    const due = namedTask.dueDate ? ` It’s due ${dayLabel(namedTask.dueDate).toLowerCase()}.` : " It has no due date.";
    const priority = namedTask.priority ? ` Priority is ${namedTask.priority}.` : "";
    return { category: "task-details", text: `About “${namedTask.title}”: it’s ${status}.${due}${priority}`, evidence: "From your task list" };
  }

  const dueNow = tasks.filter((task) => !task.done && task.dueDate && task.dueDate <= today).length;
  return { category: "help", text: `I may have misunderstood that. From your task list, you have ${dueNow} open task${dueNow === 1 ? "" : "s"} due today or earlier, and you’ve completed ${week.done.length} task${week.done.length === 1 ? "" : "s"} so far this week. Try asking about a task, your streak, what’s due, your weekly progress, or when you get most done.`, evidence: "Based on your task list and this week’s activity" };
}

function GrowthCoach({ tasks, today, week, streak, userId, goalProfile, onMoveTomorrow, onCompleteTask, onStartTask, onCreateTask }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [preferences, setPreferences] = useState({});
  const threadRef = useRef(null);
  const storageKey = userId ? `kinda:coach-feedback:${userId}` : null;

  useEffect(() => {
    if (!storageKey) {
      setPreferences({});
      setMessages([]);
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      setPreferences(saved && typeof saved === "object" ? saved : {});
    } catch {
      setPreferences({});
    }
    setMessages([]);
  }, [storageKey]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages]);

  const prompts = [...COACH_PROMPTS].sort((first, second) =>
    (Number(preferences[second.key]) || 0) - (Number(preferences[first.key]) || 0),
  );

  function ask(value = question) {
    const text = String(value || "").trim();
    if (!text) return;
    const reply = buildCoachReply(text, tasks, today, week, streak, goalProfile);
    if (storageKey) {
      const nextPreferences = {
        ...preferences,
        [reply.category]: Math.max(-5, Math.min(5, (Number(preferences[reply.category]) || 0) + 0.25)),
      };
      setPreferences(nextPreferences);
      try { localStorage.setItem(storageKey, JSON.stringify(nextPreferences)); } catch { /* Local storage may be unavailable. */ }
    }
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-${Math.random()}`, role: "user", text },
      { id: `${Date.now()}-${Math.random()}-reply`, role: "coach", ...reply },
    ]);
    setQuestion("");
  }

  function rateReply(message, value) {
    if (!storageKey) return;
    const next = {
      ...preferences,
      [message.category]: Math.max(-5, Math.min(5, (Number(preferences[message.category]) || 0) + value)),
    };
    setPreferences(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Local storage may be unavailable. */ }
  }

  function runTaskAction(message) {
    if (message.action.kind === "move") onMoveTomorrow?.(message.action.task);
    if (message.action.kind === "complete") onCompleteTask?.(message.action.task);
    if (message.action.kind === "create") onCreateTask?.(message.action.title);
    setMessages((current) => current.map((item) => item.id === message.id
      ? { ...item, action: null, text: message.action.kind === "move" ? `I’ve opened the confirmation for “${message.action.task.title}”.` : message.action.kind === "complete" ? `I’ve sent a completion request for “${message.action.task.title}”.` : "I’ve opened a new task with that step filled in. Review it and save when you’re ready." }
      : item));
  }

  return (
    <section className="growth-coach" aria-label="Kinda task coach" data-tour="growth-coach">
      <div className="growth-coach-head">
        <div>
          <h2>Ask Kinda</h2>
          <p>I use your task history and clear rules. This isn’t a general AI model, and I don’t save chat messages.</p>
        </div>
        {Object.values(preferences).some((value) => Number(value)) && (
          <button className="text-link growth-reset-learning" type="button" onClick={() => {
            setPreferences({});
            try { if (storageKey) localStorage.removeItem(storageKey); } catch { /* Ignore unavailable storage. */ }
          }}>Reset feedback</button>
        )}
      </div>
      <div className="growth-coach-prompts" aria-label="Suggested questions">
        {prompts.map((prompt) => (
          <button type="button" key={prompt.key} onClick={() => ask(prompt.question)}>{prompt.label}</button>
        ))}
      </div>
      <div ref={threadRef} className="growth-coach-thread" aria-live="polite" aria-relevant="additions text">
        {!messages.length ? (
          <p className="growth-coach-welcome">Ask a question or pick a prompt. I’ll use the tasks available on this device and show what supports my answer.</p>
        ) : messages.map((message) => (
          <article className={`growth-coach-message ${message.role}`} key={message.id}>
            <p>{message.text}</p>
            {message.evidence && <small>{message.evidence}</small>}
            {message.task && message.role === "coach" && (
              <button className="text-link" type="button" onClick={() => onStartTask?.(message.task)}>Start focus</button>
            )}
            {message.action && (
              <button className="button button-secondary small-button" type="button" onClick={() => runTaskAction(message)}>{message.action.label}</button>
            )}
            {message.role === "coach" && message.category !== "welcome" && (
              <div className="growth-coach-feedback" aria-label="Rate this response">
                <button type="button" onClick={() => rateReply(message, 1)}>Useful</button>
                <button type="button" onClick={() => rateReply(message, -1)}>Not useful</button>
              </div>
            )}
          </article>
        ))}
      </div>
      <form className="growth-coach-form" onSubmit={(event) => { event.preventDefault(); ask(); }}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about your tasks or progress"
          aria-label="Ask Kinda about your tasks or progress"
          maxLength={240}
        />
        <button className="button button-primary small-button" type="submit" disabled={!question.trim()}>Ask</button>
      </form>
      <p className="growth-coach-memory">Question topics and feedback only reorder suggested prompts on this device. Messages aren’t saved.</p>
    </section>
  );
}

export default function GrowthPage({ tasks = [], userId, streak, onMoveTomorrow, onCompleteTask, onStartTask, onCreateTask, api }) {
  const [goalProfile, setGoalProfile] = useState(null);
  const historyTasks = useMemo(() => {
    const byOccurrence = new Map();
    for (const task of tasks) {
      const key = task.seriesId && task.dueDate
        ? `${task.seriesId}:${task.dueDate}`
        : String(task.id);
      const current = byOccurrence.get(key);
      if (!current || (!current.done && task.done)) byOccurrence.set(key, task);
    }
    return [...byOccurrence.values()];
  }, [tasks]);
  const stats = useMemo(() => analyse(historyTasks), [historyTasks]);
  const today = ymd(new Date());
  const week = useMemo(() => {
    const start = weekStartKey(0);
    const entries = historyTasks.flatMap(taskEntries)
      .filter((entry) => entry.day >= start && entry.day <= today);
    const done = entries.filter((entry) => entry.status === "done");
    const perDay = new Map();
    done.forEach((entry) => perDay.set(entry.day, (perDay.get(entry.day) || 0) + 1));
    const bestEntry = [...perDay.entries()].sort((first, second) => second[1] - first[1])[0];
    return {
      total: entries.length,
      done,
      completion: entries.length ? Math.round((done.length / entries.length) * 100) : 0,
      bestDay: bestEntry ? {
        label: parseYmd(bestEntry[0]).toLocaleDateString(undefined, { weekday: "long" }),
        done: bestEntry[1],
      } : null,
    };
  }, [historyTasks, today]);
  const { thisWeek, delta, hasLast } = stats;

  return (
    <div className="page-content growth-page">
      <header className="growth-head">
        <div>
          <p className="eyebrow">YOUR PATTERNS</p>
          <h1>Growth</h1>
          <p className="growth-sub">
            {delta > 0
              ? "Your habits are getting steadier."
              : "Here’s how your last few weeks have gone."}
          </p>
        </div>
        <Kindle mood={delta > 0 ? "proud" : "happy"} size={56} animate />
      </header>

      <GoalCheckIn userId={userId} today={today} api={api} onCreateTask={onCreateTask} onGoalChange={setGoalProfile} />

      <GrowthCoach
        tasks={historyTasks}
        today={today}
        week={week}
        streak={streak}
        userId={userId}
        goalProfile={goalProfile}
        onMoveTomorrow={onMoveTomorrow}
        onCompleteTask={onCompleteTask}
        onStartTask={onStartTask}
        onCreateTask={onCreateTask}
      />

      {!stats.enough ? (
        <p className="quiet-empty">
          Keep adding and finishing tasks. Your weekly patterns appear after there’s enough history to support them.
        </p>
      ) : (
      <>

      <div className="growth-metrics">
        <div className="growth-card">
          <small>Follow-through this week</small>
          <b>{thisWeek.completion}%</b>
          {hasLast && (
            <span className={delta >= 0 ? "up" : "down"}>
              {delta >= 0 ? "Up" : "Down"} {Math.abs(delta)}% on last week
            </span>
          )}
        </div>
        <div className="growth-card">
          <small>Comeback speed</small>
          <b>{stats.comeback === null ? "—" : `${stats.comeback.toFixed(1)} days`}</b>
          <span>{stats.comeback === null ? "No slow days lately" : "From a slow day to a solid one"}</span>
        </div>
      </div>

      {stats.habits.length > 0 && (
        <section className="growth-section">
          <h2>Habit strength</h2>
          <div className="growth-list">
            {stats.habits.map((habit) => (
              <div className="growth-habit" key={habit.title}>
                <span>
                  <b>{habit.title}</b>
                  <small>{habit.done} of {habit.total} days this month</small>
                </span>
                <span className="growth-dots" aria-hidden="true">
                  {habit.dots.map((dot, index) => (
                    <i key={index} className={dot === 1 ? "on" : dot === 0 ? "miss" : ""} />
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="growth-section">
        <h2>Your rhythm, last 5 weeks</h2>
        <div className="growth-heat-days" aria-hidden="true">
          {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>
        <div className="growth-heat" role="img" aria-label="Tasks finished per day over five weeks">
          {stats.rhythm.map((day) => (
            <i key={day.key} title={`${day.key}: ${day.done} done`} className={`lv${day.future ? 0 : level(day.done)}${day.future ? " future" : ""}`} />
          ))}
        </div>
        <p className="growth-legend">Brighter days are days you finished more.</p>
      </section>

      <section className="growth-section">
        <h2>Patterns Kindle noticed</h2>
        {stats.insights.length ? (
          <div className="growth-list">
            {stats.insights.map((insight) => (
              <div className="growth-insight" key={insight.text}>
                <span aria-hidden="true">{insight.icon}</span>
                <p>{insight.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="quiet-empty">Keep going. Patterns show up after a week or two of tasks.</p>
        )}
      </section>

      <section className="growth-experiment">
        <small>This week’s experiment</small>
        <b>{stats.experiment}</b>
        <button className="button button-secondary small-button" type="button" onClick={() => onCreateTask?.(stats.experiment)}>Add recommendation as task</button>
      </section>
      <p className="growth-private">Only you can see this. It’s worked out on your device.</p>
      </>
      )}
    </div>
  );
}
