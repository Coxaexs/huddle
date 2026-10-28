"use client";

import { useState } from "react";
import { ArrowDown, ArrowDownLeft, ArrowLeft, ArrowUpRight, Mic, MicOff, Monitor, PhoneOff, UserPlus, Video, VideoOff } from "lucide-react";
import type { PublicChannel } from "@/lib/servers";
import type { VoiceParticipant } from "@/lib/protocol";
import type { Member } from "@/lib/users";
import { useI18n } from "../../../lib/i18n-context";
import { Avatar } from "../../avatar";
import { Hoffy } from "../../hoffy";
import { useUiMode } from "../../../lib/ui-mode";

/**
 * The pieces only the simple interface draws (app/lib/ui-mode.ts): talk rooms
 * as cards with faces and a Join button, faces and Invite in the header,
 * Hoffy's one-at-a-time tips, and big labelled call buttons.
 */

/** A voice room as a card: who is in it, and one obvious way in. */
export function TalkRoom({
  channel,
  people,
  here,
  onOpen,
}: {
  channel: PublicChannel;
  people: VoiceParticipant[];
  here: boolean;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const shown = people.slice(0, 5);
  return (
    <button
      type="button"
      className={`talk-room ${people.length ? "is-live" : ""} ${here ? "is-here" : ""}`}
      onClick={onOpen}
    >
      <span className="talk-room-name">
        {channel.name}
        {!people.length && <small>{"\u00a0· "}{t("simple.empty")}</small>}
      </span>
      {(people.length > 0 || here) && (
        <span className="talk-room-row">
          <span className="talk-room-faces">
            {shown.map((person) => (
              <Avatar
                key={person.connectionId}
                className="talk-room-face"
                size={22}
                avatar={person.avatar}
                avatarUrl={person.avatarUrl}
                color={person.color}
                title={person.displayName}
              />
            ))}
            {people.length > shown.length && <span className="talk-room-more">+{people.length - shown.length}</span>}
          </span>
          <span className="talk-room-join">{here ? t("simple.here") : t("simple.join")}</span>
        </span>
      )}
    </button>
  );
}

/** The header's right side: a few faces of who is online, and Invite. */
export function HeaderFaces({
  online,
  onFaces,
  onInvite,
}: {
  online: Member[];
  onFaces: () => void;
  onInvite: (() => void) | null;
}) {
  const { t } = useI18n();
  return (
    <span className="simple-header-faces">
      {online.length > 0 && (
        <button type="button" className="simple-faces" onClick={onFaces} title={t("simple.whoIsHere")} aria-label={t("simple.whoIsHere")}>
          {online.slice(0, 3).map((member) => (
            <Avatar key={member.id} className="simple-face" size={22} avatar={member.avatar} avatarUrl={member.avatarUrl} color={member.color} />
          ))}
        </button>
      )}
      {onInvite && (
        <button type="button" className="simple-invite" onClick={onInvite}>
          <UserPlus size={15} aria-hidden="true" />
          {t("simple.invite")}
        </button>
      )}
    </span>
  );
}

const TIPS_KEY = "huddle-simple-tips";

function readTipsSeen(): number {
  try {
    return Number(window.localStorage.getItem(TIPS_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Hoffy's tips, one at a time above the message box; each shows once. */
export function SimpleTips({ liveRoom, canInvite }: { liveRoom: string | null; canInvite: boolean }) {
  const { t } = useI18n();
  const simpleUi = useUiMode() === "simple";
  const [seen, setSeen] = useState(() => (typeof window === "undefined" ? 99 : readTipsSeen()));
  if (!simpleUi) return null;
  const tips = [
    { id: "talk", arrow: ArrowLeft, text: liveRoom ? t("simple.tip.talkLive", { room: liveRoom }) : t("simple.tip.talk") },
    { id: "picture", arrow: ArrowDown, text: t("simple.tip.picture") },
    ...(canInvite ? [{ id: "invite", arrow: ArrowUpRight, text: t("simple.tip.invite") }] : []),
    { id: "you", arrow: ArrowDownLeft, text: t("simple.tip.you") },
  ];
  if (seen >= tips.length) return null;
  const tip = tips[seen];
  const Arrow = tip.arrow;
  const next = () => {
    const after = seen + 1;
    setSeen(after);
    try {
      window.localStorage.setItem(TIPS_KEY, String(after));
    } catch {
      // This tab only.
    }
  };
  return (
    <div className="simple-tip" role="status">
      <Hoffy size={44} pose="point" face="happy" motion="idle" id="simple-tip-hoffy" className="simple-tip-hoffy" />
      <div className="simple-tip-body">
        <p>{tip.text}</p>
        <span className="simple-tip-foot">
          <Arrow size={14} aria-hidden="true" />
          {t("simple.tipCount", { n: seen + 1, total: tips.length })}
          <span aria-hidden="true">·</span>
          <button type="button" onClick={next}>{t("simple.gotIt")}</button>
        </span>
      </div>
    </div>
  );
}

/** In a call: four big buttons with words under them. */
/** What the call buttons need from the voice hook (the stage passes its own view of it). */
type CallControls = {
  muted: boolean;
  toggleMute: () => void;
  cameraOn: boolean;
  startCamera: () => Promise<unknown> | void;
  stopCamera: () => void;
  screenSharing: boolean;
  stopScreenShare: () => void;
  leave: () => void;
};

export function SimpleCallButtons({
  voice,
  onShare,
  shareOpen,
}: {
  voice: CallControls;
  onShare: () => void;
  shareOpen: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="simple-call-buttons">
      <button type="button" className={voice.muted ? "is-off" : ""} onClick={voice.toggleMute}>
        {voice.muted ? <MicOff size={20} /> : <Mic size={20} />}
        <span>{voice.muted ? t("simple.unmute") : t("simple.mute")}</span>
      </button>
      <button
        type="button"
        className={voice.cameraOn ? "is-on" : ""}
        onClick={() => (voice.cameraOn ? voice.stopCamera() : void voice.startCamera())}
      >
        {voice.cameraOn ? <VideoOff size={20} /> : <Video size={20} />}
        <span>{voice.cameraOn ? t("simple.cameraOff") : t("simple.camera")}</span>
      </button>
      <button
        type="button"
        className={voice.screenSharing || shareOpen ? "is-on" : ""}
        onClick={() => (voice.screenSharing ? voice.stopScreenShare() : onShare())}
      >
        <Monitor size={20} />
        <span>{voice.screenSharing ? t("simple.stopShare") : t("simple.share")}</span>
      </button>
      <button type="button" className="is-leave" onClick={() => voice.leave()}>
        <PhoneOff size={20} />
        <span>{t("simple.leave")}</span>
      </button>
    </div>
  );
}
