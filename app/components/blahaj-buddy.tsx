"use client";

import { useState } from "react";

const BLAHAJ_MESSAGES = [
  "You belong in this Huddle.",
  "Hydration check! Tiny sip?",
  "Bad day? Shark hug.",
  "Your identity is yours to define.",
  "Blåhaj believes in you.",
  "Remember to unclench your jaw.",
];

export function BlahajBuddy() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [awake, setAwake] = useState(false);
  const [boops, setBoops] = useState(0);

  const boop = () => {
    setAwake(true);
    setBoops((count) => count + 1);
    setMessageIndex((index) => (index + 1) % BLAHAJ_MESSAGES.length);
  };

  return (
    <aside className={`blahaj-buddy${awake ? " awake" : ""}`} aria-live="polite">
      {awake && (
        <div className="blahaj-speech">
          <strong>Blåhaj</strong>
          <span>{BLAHAJ_MESSAGES[messageIndex]}</span>
          <small>{boops === 1 ? "1 boop" : `${boops} boops`}</small>
        </div>
      )}
      <button
        type="button"
        className="blahaj-boop"
        onClick={boop}
        aria-label="Boop Blåhaj for a supportive message"
        title="Boop Blåhaj"
      >
        <span className="blahaj-spark one" aria-hidden="true">✦</span>
        <span className="blahaj-spark two" aria-hidden="true">♥</span>
        <span className="blahaj-shark" aria-hidden="true">🦈</span>
      </button>
    </aside>
  );
}
