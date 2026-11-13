import React from "react";
import { Check, Flame, Sparkles, Trophy } from "lucide-react";

export default function StreakWeekProgress({
  week,
  className = "",
  celebrateWeek = false,
}) {
  if (!Array.isArray(week) || week.length !== 7) return null;

  const completed = week.filter((day) => day.qualified).length;
  const perfectWeek = celebrateWeek && completed === 7;
  const labels = week.map((day) =>
    new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, {
      weekday: "short",
    })
  );
  const today = week.find((day) => day.today)?.date;
  const activeIndex = week.reduce(
    (latest, day, index) => day.qualified ? index : latest,
    -1,
  );
  let runStartIndex = activeIndex;
  while (runStartIndex > 0 && week[runStartIndex - 1].qualified) {
    runStartIndex -= 1;
  }
  const igniting = week.some((day) => day.today && day.qualified);

  return (
    <div
      className={`streak-week-progress ${className}${perfectWeek ? " is-perfect-week" : ""}`.trim()}
      role="group"
      aria-label="Weekly streak progress"
    >
      <div className="streak-week-heading">
        <b>This week</b>
        <span>{completed}/7 days</span>
      </div>
      <div className="streak-week-days" role="list" aria-label="Days this week">
        {activeIndex >= 0 && (
          <span
            className={`streak-week-pill${igniting ? " is-advancing" : ""}`}
            style={{
              left: `${(runStartIndex / 7) * 100}%`,
              width: `${((activeIndex - runStartIndex + 1) / 7) * 100}%`,
            }}
            aria-hidden="true"
          />
        )}
        {week.map((day, index) => (
          <div
            key={day.date}
            className={`streak-week-day${day.qualified ? " is-complete" : ""}${day.today ? " is-today" : ""}${index === activeIndex ? " is-active" : ""}`}
            aria-label={`${labels[index]}${day.today ? ", today" : ""}: ${
              day.qualified
                ? "streak day earned"
                : day.today
                  ? "streak day in progress"
                  : day.date < today
                    ? "not earned"
                    : "upcoming"
            }`}
            aria-current={day.today ? "date" : undefined}
            role="listitem"
            style={{ "--week-delay": `${index * 55}ms` }}
          >
            <span className="streak-week-marker" aria-hidden="true">
              {day.qualified && index !== activeIndex ? (
                <Check size={14} strokeWidth={3} />
              ) : null}
            </span>
            <span className="streak-week-label">{labels[index]}</span>
          </div>
        ))}
        {activeIndex >= 0 && (
          <span
            className={`streak-week-slider${igniting ? " is-igniting" : ""}`}
            style={{ left: `${((activeIndex + 0.5) / 7) * 100}%` }}
            aria-hidden="true"
          >
            <Flame size={16} strokeWidth={2.5} fill="currentColor" />
          </span>
        )}
      </div>
      <span
        className="streak-week-sr-progress"
        role="progressbar"
        aria-label="Streak days this week"
        aria-valuemin={0}
        aria-valuemax={7}
        aria-valuenow={completed}
      />
      {perfectWeek && (
        <div className="streak-week-perfect" role="status">
          <span className="streak-week-perfect-icon" aria-hidden="true">
            <Trophy size={16} strokeWidth={2.5} />
          </span>
          <span className="streak-week-perfect-copy">
            <b>Perfect week</b>
            <small>Seven days. One blazing streak.</small>
          </span>
          <Sparkles className="streak-week-perfect-sparkle" size={18} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
