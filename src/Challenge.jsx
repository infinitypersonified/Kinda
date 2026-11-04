import React from "react";
import { ArrowLeft, Check, ChevronRight, Target } from "lucide-react";
import Kindle from "./Kindle.jsx";

// Circle challenge screens. All numbers come from the server; nothing here
// touches streaks.
const STEPS = [
  [25, "Spark"],
  [50, "Glow"],
  [75, "Blaze"],
  [100, "Full"],
];
const percentOf = (challenge) =>
  Math.min(100, Math.round((challenge.totalDone / Math.max(1, challenge.goal)) * 100));
const myDone = (challenge) => challenge.todayTasks.filter((task) => task.done).length;

export function ChallengeCard({ challenge, onOpen, onJoin, busy }) {
  const percent = percentOf(challenge);
  if (challenge.status === "ended") {
    return (
      <button type="button" className="ch-card ch-ended" onClick={onOpen}>
        <Target size={20} />
        <span>
          <b>{challenge.title}</b>
          <small>Finished · {challenge.totalDone} tasks done together</small>
        </span>
        <ChevronRight size={18} />
      </button>
    );
  }
  if (!challenge.joined) {
    return (
      <section className="ch-card ch-invite">
        <p className="ch-eyebrow">NEW CHALLENGE</p>
        <h3>{challenge.title}</h3>
        <p className="ch-intro">{challenge.intro}</p>
        <div className="ch-plan">
          <small>Each day you’ll do</small>
          {challenge.dailyTasks.map((title) => (
            <span key={title}>
              <Check size={14} /> {title}
            </span>
          ))}
        </div>
        <div className="ch-meta">
          <span>
            {challenge.days} days · day {Math.max(1, challenge.dayNumber)}
          </span>
          <span>{challenge.members.length} joined</span>
        </div>
        <div className="ch-buttons">
          <button type="button" className="button button-primary" onClick={onJoin} disabled={busy}>
            Join challenge
          </button>
          <button type="button" className="button button-secondary" onClick={onOpen}>
            Details
          </button>
        </div>
      </section>
    );
  }
  return (
    <button type="button" className="ch-card ch-joined" onClick={onOpen}>
      <span className="ch-head">
        <Kindle mood="happy" size={30} />
        <span>
          <small className="ch-eyebrow">ACTIVE CHALLENGE</small>
          <b>{challenge.title}</b>
        </span>
        <ChevronRight size={18} />
      </span>
      <span className="ch-intro ch-clamp">{challenge.intro}</span>
      <span className="ch-bar">
        <i style={{ width: `${percent}%` }} />
      </span>
      <span className="ch-meta">
        <span>
          Today: {myDone(challenge)} of {challenge.perDay} done
        </span>
        <span>
          Day {challenge.dayNumber} of {challenge.days}
        </span>
      </span>
    </button>
  );
}

export function ChallengeScreen({ challenge, Avatar, onBack, onJoin, onLeave, busy }) {
  const percent = percentOf(challenge);
  const circumference = 2 * Math.PI * 44;
  const ended = challenge.status === "ended";
  const finishedToday = challenge.members.filter((m) => m.todayDone >= challenge.perDay).length;
  return (
    <div className="ch-screen">
      <header className="ch-top">
        <button type="button" className="cd-back" onClick={onBack} aria-label="Back to the circle">
          <ArrowLeft size={22} />
        </button>
        <div>
          <h2>{challenge.title}</h2>
          <small>
            {ended ? "Finished" : `Day ${challenge.dayNumber} of ${challenge.days}`}
          </small>
        </div>
      </header>
      <p className="ch-intro">{challenge.intro}</p>

      <div className="ch-ring-card">
        <div className="ch-ring">
          <svg viewBox="0 0 104 104" aria-hidden="true">
            <circle cx="52" cy="52" r="44" className="ch-ring-bg" />
            <circle
              cx="52"
              cy="52"
              r="44"
              className="ch-ring-fg"
              strokeDasharray={`${(circumference * percent) / 100} ${circumference}`}
              transform="rotate(-90 52 52)"
            />
          </svg>
          <Kindle mood={percent >= 100 ? "proud" : "happy"} size={46} animate />
        </div>
        <b>
          {challenge.totalDone} of {challenge.goal} tasks
        </b>
        <small>The circle is {percent}% of the way</small>
        <div className="ch-steps">
          {STEPS.map(([at, label]) => (
            <span key={label} className={percent >= at ? "on" : ""}>
              <i />
              {label} {at}%
            </span>
          ))}
        </div>
      </div>

      {challenge.members.length > 0 && (
        <>
          <h3 className="ch-h">Team today</h3>
          <div className="ch-team">
            <div className="ch-team-row">
              {challenge.members.map((member) => (
                <span className="ch-person" key={member.id}>
                  <span className="ch-avatar">
                    <Avatar name={member.name} avatar={member.avatar} />
                    {member.todayDone >= challenge.perDay && (
                      <em>
                        <Check size={10} />
                      </em>
                    )}
                  </span>
                  <small>{member.name.split(" ")[0]}</small>
                </span>
              ))}
            </div>
            <small>
              {finishedToday} of {challenge.members.length} have finished today
            </small>
          </div>
        </>
      )}

      {challenge.joined && !ended && (
        <>
          <h3 className="ch-h">Your plan today</h3>
          <div className="ch-today">
            {challenge.todayTasks.length ? (
              challenge.todayTasks.map((task) => (
                <span key={task.id} className={task.done ? "done" : ""}>
                  <i>{task.done && <Check size={12} />}</i>
                  {task.title}
                </span>
              ))
            ) : (
              <small>Today’s tasks will appear in a moment.</small>
            )}
          </div>
          <p className="ch-note">These are also in your Today list. Finish them in either place.</p>
        </>
      )}

      <p className="ch-note ch-center">A missed day pauses the flame. It never resets it.</p>
      {!ended && (
        <div className="ch-center">
          {challenge.joined ? (
            <button type="button" className="text-link" onClick={onLeave} disabled={busy}>
              Leave challenge
            </button>
          ) : (
            <button type="button" className="button button-primary" onClick={onJoin} disabled={busy}>
              Join challenge
            </button>
          )}
        </div>
      )}
    </div>
  );
}
