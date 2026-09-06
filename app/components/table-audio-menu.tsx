"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Crown, Headphones, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type { VoiceParticipant } from "@/lib/protocol";
import { MAX_TABLE_PAN, personalTableLayout } from "../lib/spatial-audio";
import { Avatar } from "./avatar";

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
        <div><span className="table-eyebrow">LIVING ROOM MODE</span><h2 id="table-audio-title">Your table, your way</h2></div>
        <button type="button" className="table-icon-button" onClick={onClose} aria-label="Close table settings"><X size={20} /></button>
      </header>
      <p className="table-intro">Give every voice a place. Your seating and DM choice only change what you hear.</p>
      <div className="table-mode-row">
        <div><strong>Spatial audio</strong><small>{controls.tableMode ? "Your seats are live — adjust as you listen." : "Set up your table, then switch it on."}</small></div>
        <button type="button" className={`table-switch ${controls.tableMode ? "active" : ""}`}
          role="switch" aria-checked={controls.tableMode} aria-label="Spatial audio"
          onClick={() => controls.setTableMode(!controls.tableMode)}><span /></button>
      </div>

      <div className="table-preview" aria-label="Your listening table">
        <div className="table-surface"><Headphones size={24} /><span>{controls.tableMode ? "You're in the room" : "Preview your table"}</span></div>
        {remotes.map((person) => {
          const pan = seats.get(person.connectionId)?.pan ?? 0;
          const ratio = pan / MAX_TABLE_PAN;
          return (
            <button type="button" key={person.connectionId}
              className={`table-seat ${selected?.connectionId === person.connectionId ? "selected" : ""}`}
              style={{ left: `${50 + ratio * 40}%`, top: `${17 + Math.abs(ratio) * 34}%` }}
              onClick={() => setSelectedId(person.connectionId)}
              aria-label={`Adjust ${person.displayName}${person.connectionId === controls.tableHostId ? ", DM" : ""}`}
              aria-pressed={selected?.connectionId === person.connectionId}>
              <Avatar className="table-avatar" avatar={person.avatar} avatarUrl={person.avatarUrl} color={person.color} />
              <span className="table-seat-name">{person.displayName}</span>
              {person.connectionId === controls.tableHostId && <span className="table-dm-badge"><Crown size={10} /> DM</span>}
            </button>
          );
        })}
        {!remotes.length && <span className="table-empty">Your friends’ seats will appear here.</span>}
        <div className="table-listener"><span><Headphones size={18} /></span><strong>You{controls.tableHostId === listenerId ? " · DM" : ""}</strong></div>
      </div>

      <div className="table-editor">
        <label className="table-field" htmlFor="table-dm"><span><Crown size={16} /> Dungeon Master</span>
          <select id="table-dm" value={people.some((p) => p.connectionId === controls.tableHostId) ? controls.tableHostId : ""}
            onChange={(event) => controls.setTableHostId(event.target.value)}>
            <option value="">No DM · automatic seating</option>
            {people.map((p) => <option key={p.connectionId} value={p.connectionId}>{p.displayName}{p.connectionId === listenerId ? " (you)" : ""}</option>)}
          </select>
          <small>The DM sits across from you. If you're the DM, you stay in the listener seat.</small>
        </label>

        {!!remotes.length && <section className="table-seat-editor" aria-label="Seat adjustment">
          <label className="table-field" htmlFor="table-person"><span><SlidersHorizontal size={16} /> Adjust a seat</span>
            <select id="table-person" value={selected?.connectionId ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
              {remotes.map((p) => <option key={p.connectionId} value={p.connectionId}>{p.displayName}</option>)}
            </select>
          </label>
          <label className="table-range" htmlFor="table-position"><span>Position <output>{isDM ? "DM · centre" : Math.abs(selectedPan) < 0.01 ? "Centre" : `${Math.round(Math.abs(selectedPan) / MAX_TABLE_PAN * 100)}% ${selectedPan < 0 ? "left" : "right"}`}</output></span>
            <input id="table-position" type="range" min={-MAX_TABLE_PAN} max={MAX_TABLE_PAN} step="0.01" value={selectedPan}
              disabled={isDM} onChange={(event) => selected && move(selected.connectionId, Number(event.target.value))} />
            <small><span>Left</span><span>Centre</span><span>Right</span></small>
          </label>
          {isDM ? <p className="table-field-hint">The DM’s seat stays centred. Choose another DM to move this seat.</p> : (
            <label className="table-field table-swap" htmlFor="table-swap"><span><ArrowLeftRight size={15} /> Swap seats</span>
              <select id="table-swap" value="" onChange={(event) => {
                const target = event.target.value;
                if (!selected || !seats.has(target)) return;
                controls.setTableSeatPans({ ...controls.tableSeatPans, [selected.connectionId]: seats.get(target)!.pan, [target]: selectedPan });
              }}>
                <option value="">Swap with…</option>
                {remotes.filter((p) => p.connectionId !== selected?.connectionId && p.connectionId !== controls.tableHostId)
                  .map((p) => <option key={p.connectionId} value={p.connectionId}>{p.displayName}</option>)}
              </select>
            </label>
          )}
        </section>}

        <label className="table-range" htmlFor="table-width"><span>Stereo width <output>{Math.round(controls.tableWidth * 100)}%</output></span>
          <input id="table-width" type="range" min="0" max="1" step="0.05" value={controls.tableWidth} onChange={(event) => controls.setTableWidth(Number(event.target.value))} />
          <small><span>Gather close</span><span>Spread out</span></small>
        </label>
      </div>
      <footer className="table-audio-footer">
        <button type="button" className="table-reset" onClick={() => { controls.setTableSeatPans({}); controls.setTableWidth(1); }}><RotateCcw size={15} /> Reset seating</button>
        <button type="button" className="table-done" onClick={onClose}>Done</button>
      </footer>
    </dialog>
  );
}
