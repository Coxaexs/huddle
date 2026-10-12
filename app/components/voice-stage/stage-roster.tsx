"use client";

import { Hand } from "lucide-react";
import type { VoiceParticipant } from "@/lib/protocol";
import { VoiceApi } from "./types";

export function StageRoster({
  stageMode,
  onStage,
  canManageStage,
  connectionId,
  voice,
  audience,
  raisedHands,
  amAudience,
  self,
}: {
  stageMode: boolean;
  onStage: VoiceParticipant[];
  canManageStage: boolean;
  connectionId: string | null;
  voice: VoiceApi;
  audience: VoiceParticipant[];
  raisedHands: number;
  amAudience: boolean;
  self: VoiceParticipant | null;
}) {
  return (
    <>
      {stageMode && (
        <div className="stage-roster" role="status">
          <div className="stage-roster-group">
            <span className="stage-roster-label">On stage · {onStage.length}</span>
            {canManageStage ? (
              <span className="stage-roster-list">
                {onStage.length === 0 && <span className="stage-roster-names">Nobody yet</span>}
                {onStage.map((person) => {
                  const name = person.connectionId === connectionId ? "You" : person.displayName;
                  return (
                    <span key={person.connectionId} className="stage-roster-person">
                      {name}
                      <button
                        type="button"
                        className="stage-promote-btn"
                        onClick={() => voice.setStageSpeaker(person.connectionId, false)}
                        aria-label={`Move ${name} to the audience`}
                      >
                        Move down
                      </button>
                    </span>
                  );
                })}
              </span>
            ) : (
              <span className="stage-roster-names">
                {onStage.length
                  ? onStage
                      .map((p) => (p.connectionId === connectionId ? "You" : p.displayName))
                      .join(", ")
                  : "Nobody yet"}
              </span>
            )}
          </div>

          <div className="stage-roster-group">
            <span className="stage-roster-label">
              Audience · {audience.length}
              {raisedHands > 0 && ` · ✋ ${raisedHands} waiting`}
            </span>
            {/* A host gets one control per person; everyone else gets a plain
                list, since a row of buttons they cannot use is noise. */}
            {canManageStage ? (
              <span className="stage-roster-list">
                {audience.length === 0 && <span className="stage-roster-names">Nobody yet</span>}
                {audience.map((person) => {
                  const name = person.connectionId === connectionId ? "You" : person.displayName;
                  return (
                    <span key={person.connectionId} className="stage-roster-person">
                      {name}
                      {person.handRaised && (
                        <>
                          <Hand size={12} aria-hidden="true" className="tile-hand" />
                          <span className="stage-queue-number" title="Place in the queue">
                            #{audience.indexOf(person) + 1}
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        className="stage-promote-btn"
                        onClick={() => voice.setStageSpeaker(person.connectionId, true)}
                        aria-label={`Bring ${name} on stage`}
                      >
                        Bring up
                      </button>
                    </span>
                  );
                })}
              </span>
            ) : (
              <span className="stage-roster-names">
                {audience.length
                  ? audience
                      .map((p) => {
                        const name = p.connectionId === connectionId ? "You" : p.displayName;
                        // The hand is the only bit of this worth surfacing
                        // loudly; it is the whole reason the roster exists.
                        return p.handRaised ? `${name} ✋` : name;
                      })
                      .join(", ")
                  : "Nobody yet"}
              </span>
            )}
          </div>

          {amAudience && (
            <button
              type="button"
              className={`stage-hand-btn ${self?.handRaised ? "is-up" : ""}`}
              onClick={voice.toggleHand}
              // Hosts promote from the participant menu, which already owns
              // server-mute; this only asks.
              title="Ask the hosts for the floor"
            >
              <Hand size={14} aria-hidden="true" />
              {self?.handRaised ? "Lower hand" : "Raise hand"}
            </button>
          )}

          {!amAudience && self && (
            <span className="stage-roster-hint">
              {self.muted
                ? "You are on stage. Unmute to talk."
                : "You are on stage and everyone can hear you."}
            </span>
          )}
        </div>
      )}
    </>
  );
}
