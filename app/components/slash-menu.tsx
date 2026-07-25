"use client";

import { useEffect, useMemo, useRef } from "react";
import { matchCommands, type SlashCommand } from "../lib/commands";

interface SlashMenuProps {
  query: string;
  highlighted: number;
  onHighlight: (index: number) => void;
  onPick: (command: SlashCommand) => void;
  inVoice: boolean;
}

/**
 * The palette that opens as soon as the composer starts with "/", the way
 * Discord's does: grouped, filtered while you type, arrow keys to move.
 */
export function SlashMenu({
  query,
  highlighted,
  onHighlight,
  onPick,
  inVoice,
}: SlashMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const commands = useMemo(() => matchCommands(query), [query]);

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  if (!commands.length) {
    return (
      <div className="slash-menu">
        <div className="slash-empty">No command matches that.</div>
      </div>
    );
  }

  let lastGroup = "";
  return (
    <div className="slash-menu" ref={listRef} role="listbox" aria-label="Commands">
      {commands.map((command, index) => {
        const showGroup = command.group !== lastGroup;
        lastGroup = command.group;
        return (
          <div key={command.name}>
            {showGroup && <div className="slash-group">{command.group}</div>}
            <button
              type="button"
              role="option"
              aria-selected={index === highlighted}
              data-active={index === highlighted}
              className={`slash-item ${index === highlighted ? "active" : ""}`}
              onMouseEnter={() => onHighlight(index)}
              onMouseDown={(event) => {
                // Keep the composer focused when picking with the mouse.
                event.preventDefault();
                onPick(command);
              }}
            >
              <span className="slash-name">
                /{command.name}
                {command.args && <em>{command.args}</em>}
              </span>
              <span className="slash-description">{command.description}</span>
              {command.voice && !inVoice && (
                <span className="slash-hint">needs voice</span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
