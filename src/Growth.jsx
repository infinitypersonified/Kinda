import React, { useMemo } from "react";
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

export default function GrowthPage({ tasks = [] }) {
  const stats = useMemo(() => analyse(tasks), [tasks]);
  const { thisWeek, delta, hasLast } = stats;

  if (!stats.enough) {
    return (
      <div className="page-content growth-page">
        <header className="growth-head">
          <div>
            <p className="eyebrow">YOUR PATTERNS</p>
            <h1>Growth</h1>
          </div>
          <Kindle mood="think" size={56} animate />
        </header>
        <p className="quiet-empty">
          Plan and finish a few tasks over a week or two, and Kindle will start
          spotting your patterns here.
        </p>
      </div>
    );
  }

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
      </section>
      <p className="growth-private">Only you can see this. It’s worked out on your device.</p>
    </div>
  );
}
