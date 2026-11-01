"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { VOICE_SOUNDS, previewVoiceSound, setVoiceSoundOn, voiceSoundOn, type VoiceSoundId } from "../../lib/audio-cues";

/** The sounds listed before "Show more": the ones people reach for most. */
const ALWAYS_SHOWN = 4;

/** Voice & Video → Sounds: every voice cue with a preview and an on/off switch. */
export function VoiceSounds() {
  const [on, setOn] = useState<Record<VoiceSoundId, boolean>>(
    () => Object.fromEntries(VOICE_SOUNDS.map(({ id }) => [id, voiceSoundOn(id)])) as Record<VoiceSoundId, boolean>,
  );
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = VOICE_SOUNDS.length - ALWAYS_SHOWN;

  const toggle = (id: VoiceSoundId) => {
    const next = !on[id];
    setVoiceSoundOn(id, next);
    setOn((current) => ({ ...current, [id]: next }));
  };

  const row = ({ id, label }: (typeof VOICE_SOUNDS)[number]) => (
    <div key={id} className="vs-sound-row">
      <div className="vs-sound-text">
        <strong>{label}</strong>
        <button type="button" className="vs-sound-preview" onClick={() => previewVoiceSound(id)}>
          Preview sound
        </button>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on[id]}
        aria-label={label}
        className={`vs-switch ${on[id] ? "on" : ""}`}
        onClick={() => toggle(id)}
      >
        <span />
      </button>
    </div>
  );

  return (
    <section className="vs-section" data-settings-anchor="sounds" data-settings-label="Sounds">
      <h3 className="field-label">Sounds</h3>
      <div className="vs-sound-list">
        {VOICE_SOUNDS.slice(0, ALWAYS_SHOWN).map(row)}
        <button
          type="button"
          className="vs-sound-more"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          <strong>{expanded ? `Hide ${hiddenCount} sounds` : `Show ${hiddenCount} more sounds`}</strong>
          <span className="vs-sound-more-icon">
            <ChevronDown size={18} />
          </span>
        </button>
        {expanded && VOICE_SOUNDS.slice(ALWAYS_SHOWN).map(row)}
      </div>
    </section>
  );
}
