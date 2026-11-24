"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Crown, Headphones, RotateCcw, Compass, SlidersHorizontal, X } from "lucide-react";
import type { VoiceParticipant } from "@/lib/protocol";
import { MAX_TABLE_PAN, personalTableLayout } from "../lib/spatial-audio";
import type { HeadTrackingStatus } from "../lib/head-tracking";
import { Avatar } from "./avatar";
import { tNow } from "../lib/i18n-context";

export interface TableControls {
  tableMode: boolean;
  setTableMode: (enabled: boolean) => void;
  tableHostId: string;
  setTableHostId: (id: string) => void;
  tableSeatOrder: string[];
  tableSeatPans: Record<string, number>;
  setTableSeatPans: (pans: Record<string, number>) => void;
  tableWidth: number;
  setTableWidth: (width: number) => void;
  headTracking: boolean;
  setHeadTracking: (enabled: boolean) => void;
  headTrackingOffered: boolean;
  airpodsOffered: boolean;
  headTrackingSource: "airpods" | "webcam";
  setHeadTrackingSource: (source: "airpods" | "webcam") => void;
  spatialOutput: "headphones" | "speakers";
  setSpatialOutput: (output: "headphones" | "speakers") => void;
  headTrackingStatus: { status: HeadTrackingStatus; live: boolean };
  recenterHead: () => void;
}

/** Head tracking can be wanted, unavailable, waiting for poses, or actually running. */
export function headTrackingHint({ headTracking, headTrackingStatus, headTrackingSource, airpodsOffered }: Pick<TableControls, "headTracking" | "headTrackingStatus" | "headTrackingSource" | "airpodsOffered">): string {
  const webcam = headTrackingSource === "webcam";
  if (!headTracking) return webcam
    ? tNow("tableAudio.ht.webcamOff")
    : tNow("tableAudio.ht.airpodsOff");
  if (headTrackingStatus.status === "denied") return webcam
    ? tNow("tableAudio.ht.webcamDenied")
    : tNow("tableAudio.ht.airpodsDenied");
  if (!webcam && !airpodsOffered) return tNow("tableAudio.ht.airpodsNeedApp");
  if (headTrackingStatus.status === "unsupported") return webcam
    ? tNow("tableAudio.ht.webcamUnsupported")
    : tNow("tableAudio.ht.airpodsUnsupported");
  if (!headTrackingStatus.live) return webcam ? tNow("tableAudio.ht.webcamWaiting") : tNow("tableAudio.ht.airpodsWaiting");
  return tNow("tableAudio.ht.live");
}

export function TableAudioMenu({ participants, listenerId, controls, onClose }: {
  participants: VoiceParticipant[];
  listenerId: string | null;
  controls: TableControls;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedId, setSelectedId] = useState("");
  const people = participants.filter((p) => !p.bot && !p.recorder);
  const remotes = people.filter((p) => p.connectionId !== listenerId);
  const selected = remotes.find((p) => p.connectionId === selectedId) ?? remotes[0];
  const ids = controls.tableSeatOrder;
  const seats = personalTableLayout(ids, controls.tableHostId, controls.tableSeatPans);
  const isDM = selected?.connectionId === controls.tableHostId;
  const selectedPan = selected ? seats.get(selected.connectionId)?.pan ?? 0 : 0;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const move = (id: string, pan: number) => {
    controls.setTableSeatPans({ ...controls.tableSeatPans, [id]: pan });
  };

  return (
    <dialog ref={dialog} className="table-audio-dialog" aria-labelledby="table-audio-title"
      onCancel={onClose} onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}>
      <header className="table-audio-header">
        <div className="table-audio-icon"><Headphones size={22} /></div>
        <div><span className="table-eyebrow">{tNow("tableAudio.eyebrow")}</span><h2 id="table-audio-title">{tNow("tableAudio.title")}</h2></div>
        <button type="button" className="table-icon-button" onClick={onClose} aria-label={tNow("tableAudio.closeAria")}><X size={20} /></button>
      </header>
      <p className="table-intro">{tNow("tableAudio.intro")}</p>
      <div className="table-mode-row">
        <div><strong>{tNow("tableAudio.spatialAudio")}</strong><small>{controls.tableMode ? tNow("tableAudio.spatialLive") : tNow("tableAudio.spatialOff")}</small></div>
        <button type="button" className={`table-switch ${controls.tableMode ? "active" : ""}`}
          role="switch" aria-checked={controls.tableMode} aria-label={tNow("tableAudio.spatialAudio")}
          onClick={() => controls.setTableMode(!controls.tableMode)}><span /></button>
      </div>

      <div className="table-preview" aria-label={tNow("tableAudio.previewAria")}>
        <div className="table-surface"><Headphones size={24} /><span>{controls.tableMode ? tNow("tableAudio.inRoom") : tNow("tableAudio.previewTable")}</span></div>
        {remotes.map((person) => {
          const pan = seats.get(person.connectionId)?.pan ?? 0;
          const ratio = pan / MAX_TABLE_PAN;
          return (
            <button type="button" key={person.connectionId}
              className={`table-seat ${selected?.connectionId === person.connectionId ? "selected" : ""}`}
              style={{ left: `${50 + ratio * 40}%`, top: `${17 + Math.abs(ratio) * 34}%` }}
              onClick={() => setSelectedId(person.connectionId)}
              aria-label={`${tNow("tableAudio.adjustAria", { name: person.displayName })}${person.connectionId === controls.tableHostId ? ", DM" : ""}`}
              aria-pressed={selected?.connectionId === person.connectionId}>
              <Avatar className="table-avatar" avatar={person.avatar} avatarUrl={person.avatarUrl} color={person.color} />
              <span className="table-seat-name">{person.displayName}</span>
              {person.connectionId === controls.tableHostId && <span className="table-dm-badge"><Crown size={10} /> DM</span>}
            </button>
          );
        })}
        {!remotes.length && <span className="table-empty">{tNow("tableAudio.emptySeats")}</span>}
        <div className="table-listener"><span><Headphones size={18} /></span><strong>{tNow("chat.overlay.you")}{controls.tableHostId === listenerId ? " · DM" : ""}</strong></div>
      </div>

      <div className="table-editor">
        <label className="table-field" htmlFor="table-dm"><span><Crown size={16} /> {tNow("tableAudio.dm")}</span>
          <select id="table-dm" value={people.some((p) => p.connectionId === controls.tableHostId) ? controls.tableHostId : ""}
            onChange={(event) => controls.setTableHostId(event.target.value)}>
            <option value="">{tNow("tableAudio.noDm")}</option>
            {people.map((p) => <option key={p.connectionId} value={p.connectionId}>{p.displayName}{p.connectionId === listenerId ? tNow("tableAudio.youSuffix") : ""}</option>)}
          </select>
          <small>{tNow("tableAudio.dmHint")}</small>
        </label>

        {!!remotes.length && <section className="table-seat-editor" aria-label={tNow("tableAudio.seatAdjustAria")}>
          <label className="table-field" htmlFor="table-person"><span><SlidersHorizontal size={16} /> {tNow("tableAudio.adjustSeat")}</span>
            <select id="table-person" value={selected?.connectionId ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
              {remotes.map((p) => <option key={p.connectionId} value={p.connectionId}>{p.displayName}</option>)}
            </select>
          </label>
          <label className="table-range" htmlFor="table-position"><span>{tNow("tableAudio.position")} <output>{isDM ? tNow("tableAudio.dmCentre") : Math.abs(selectedPan) < 0.01 ? tNow("tableAudio.centre") : selectedPan < 0 ? tNow("tableAudio.pctLeft", { pct: Math.round(Math.abs(selectedPan) / MAX_TABLE_PAN * 100) }) : tNow("tableAudio.pctRight", { pct: Math.round(Math.abs(selectedPan) / MAX_TABLE_PAN * 100) })}</output></span>
            <input id="table-position" type="range" min={-MAX_TABLE_PAN} max={MAX_TABLE_PAN} step="0.01" value={selectedPan}
              disabled={isDM} onChange={(event) => selected && move(selected.connectionId, Number(event.target.value))} />
            <small><span>{tNow("tableAudio.left")}</span><span>{tNow("tableAudio.centre")}</span><span>{tNow("tableAudio.right")}</span></small>
          </label>
          {isDM ? <p className="table-field-hint">{tNow("tableAudio.dmStaysCentred")}</p> : (
            <label className="table-field table-swap" htmlFor="table-swap"><span><ArrowLeftRight size={15} /> {tNow("tableAudio.swapSeats")}</span>
              <select id="table-swap" value="" onChange={(event) => {
                const target = event.target.value;
                if (!selected || !seats.has(target)) return;
                controls.setTableSeatPans({ ...controls.tableSeatPans, [selected.connectionId]: seats.get(target)!.pan, [target]: selectedPan });
              }}>
                <option value="">{tNow("tableAudio.swapWith")}</option>
                {remotes.filter((p) => p.connectionId !== selected?.connectionId && p.connectionId !== controls.tableHostId)
                  .map((p) => <option key={p.connectionId} value={p.connectionId}>{p.displayName}</option>)}
              </select>
            </label>
          )}
        </section>}

        <label className="table-field" htmlFor="table-output"><span><Headphones size={16} /> {tNow("tableAudio.listeningOn")}</span>
          <select id="table-output" value={controls.spatialOutput}
            onChange={(event) => controls.setSpatialOutput(event.target.value === "speakers" ? "speakers" : "headphones")}>
            <option value="headphones">{tNow("tableAudio.headphones")}</option>
            <option value="speakers">{tNow("tableAudio.speakers")}</option>
          </select>
          <small>{tNow("tableAudio.outputHint")}</small>
        </label>

        {controls.headTrackingOffered && <section className="table-head-tracking">
          <label>
            <input type="checkbox" checked={controls.headTracking}
              onChange={(event) => controls.setHeadTracking(event.target.checked)} />
            {tNow("tableAudio.followHead")}
          </label>
          <select aria-label={tNow("tableAudio.htSourceAria")} value={controls.headTrackingSource}
            onChange={(event) => controls.setHeadTrackingSource(event.target.value === "webcam" ? "webcam" : "airpods")}>
            <option value="airpods">{tNow("tableAudio.airpodsOption")}</option>
            <option value="webcam">{tNow("tableAudio.webcamOption")}</option>
          </select>
          <small>{headTrackingHint(controls)}</small>
          {controls.headTracking && controls.headTrackingStatus.live && (
            <button type="button" className="table-reset" onClick={controls.recenterHead}>
              <Compass size={15} /> {tNow("tableAudio.faceForward")}
            </button>
          )}
        </section>}

        <label className="table-range" htmlFor="table-width"><span>{tNow("tableAudio.stereoWidth")} <output>{Math.round(controls.tableWidth * 100)}%</output></span>
          <input id="table-width" type="range" min="0" max="1" step="0.05" value={controls.tableWidth} onChange={(event) => controls.setTableWidth(Number(event.target.value))} />
          <small><span>{tNow("tableAudio.gatherClose")}</span><span>{tNow("tableAudio.spreadOut")}</span></small>
        </label>
      </div>
      <footer className="table-audio-footer">
        <button type="button" className="table-reset" onClick={() => { controls.setTableSeatPans({}); controls.setTableWidth(1); }}><RotateCcw size={15} /> {tNow("tableAudio.resetSeating")}</button>
        <button type="button" className="table-done" onClick={onClose}>{tNow("tableAudio.done")}</button>
      </footer>
    </dialog>
  );
}
