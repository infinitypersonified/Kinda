import React, { useState } from "react";
import { Bell, Check } from "lucide-react";

function KiteIcon() {
  return (
    <svg className="nudge-kite" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 3 10.7 21l-2.2-8.3L21 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m8.5 12.7 8-5.9M10.7 21l2.7-5.2 4 2.2M8.5 12.7 3 10.9l5.5 1.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6.1 17.7c.5-1 1.5-1.2 2.1-1.8M4.3 20c.3-.6.8-.9 1.3-1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export default function NudgeButton({ onClick, className = "", label = "Nudge" }) {
  const [state, setState] = useState("idle");

  async function send() {
    if (state !== "idle") return;
    setState("flying");
    try {
      const sent = await onClick();
      if (!sent) {
        setState("idle");
        return;
      }
      window.setTimeout(() => setState("sent"), 620);
    } catch {
      setState("idle");
    }
  }

  return (
    <button
      type="button"
      className={`nudge-button ${className} is-${state}`}
      onClick={send}
      disabled={state !== "idle"}
      aria-live="polite"
    >
      <span className="nudge-icon-wrap" aria-hidden="true">
        <Bell className="nudge-bell" size={13} />
        <KiteIcon />
        {state === "sent" && <Check className="nudge-check" size={13} />}
      </span>
      {state === "sent" ? "Sent" : label}
    </button>
  );
}
