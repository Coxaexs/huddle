"use client";

import {
  forwardRef,
  startTransition,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type SyntheticEvent,
  type TextareaHTMLAttributes,
} from "react";
import { flushSync } from "react-dom";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & {
  /** The draft the parent holds; it follows what is typed, a beat behind. */
  value: string;
};

/** Keys that act on the draft, so the parent must have seen every character first. */
const FLUSH_KEYS = new Set(["Enter", "Tab"]);

/**
 * The message box. Typing here is held in this component and only handed to the
 * chat shell as a low-priority update, so each keystroke redraws a single
 * textarea instead of the whole shell and its message list. The shell is never
 * left behind where it matters: sending, tabbing to an autocomplete, or leaving
 * the box all bring it fully up to date first.
 */
export const DraftTextarea = forwardRef<HTMLTextAreaElement, Props>(function DraftTextarea(props, ref) {
  const { value, onChange, onSelect, onKeyDown, onBlur, ...rest } = props;
  const node = useRef<HTMLTextAreaElement | null>(null);
  useImperativeHandle(ref, () => node.current as HTMLTextAreaElement);

  const [local, setLocal] = useState(value);
  /** What this box last held; the parent's value is behind it until it catches up. */
  const held = useRef(value);
  /** Typed text the parent has not committed yet. */
  const dirty = useRef(false);
  const lastChange = useRef<ChangeEvent<HTMLTextAreaElement> | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    if (value === held.current) {
      dirty.current = false;
    } else if (!dirty.current) {
      // Changed from outside: a sent message cleared it, an emoji was added, a draft was restored.
      held.current = value;
      setLocal(value);
    }
  }, [value]);

  // Grow with the text, as the shell's own effect does, without waiting for the shell.
  useLayoutEffect(() => {
    const box = node.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight + 2, window.innerHeight * 0.4)}px`;
  }, [local]);

  const flush = () => {
    const event = lastChange.current;
    if (!dirty.current || !event) return;
    flushSync(() => latest.current.onChange?.(event));
  };

  return (
    <textarea
      {...rest}
      ref={node}
      value={local}
      onChange={(event) => {
        held.current = event.target.value;
        dirty.current = true;
        lastChange.current = event;
        setLocal(event.target.value);
        startTransition(() => onChange?.(event));
      }}
      onSelect={(event: SyntheticEvent<HTMLTextAreaElement>) => {
        if (onSelect) startTransition(() => onSelect(event as never));
      }}
      onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (FLUSH_KEYS.has(event.key)) flush();
        latest.current.onKeyDown?.(event);
      }}
      onBlur={(event: FocusEvent<HTMLTextAreaElement>) => {
        flush();
        latest.current.onBlur?.(event);
      }}
    />
  );
});
