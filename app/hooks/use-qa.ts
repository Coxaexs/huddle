"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { sortQuestions, type QaQuestion } from "@/lib/qa";
import { apiFetch } from "../lib/client";

/** A room's Q&A: loaded once, then kept current by hub "qa" events. */
export function useQa(channelId: string | null, enabled: boolean) {
  const [questions, setQuestions] = useState<QaQuestion[]>([]);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [canHost, setCanHost] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setQuestions([]);
    setVoted(new Set());
    setLoaded(false);
    if (!channelId || !enabled) return;
    let cancelled = false;
    apiFetch<{ questions: QaQuestion[]; voted: string[]; canHost: boolean }>(
      `/api/qa?channelId=${encodeURIComponent(channelId)}`,
    )
      .then((data) => {
        if (cancelled) return;
        setQuestions(data.questions);
        setVoted(new Set(data.voted));
        setCanHost(data.canHost);
        setLoaded(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [channelId, enabled]);

  useEffect(() => {
    if (!channelId || !enabled) return;
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        channelId: string;
        question: QaQuestion | null;
        removedId?: string;
      };
      if (detail.channelId !== channelId) return;
      setQuestions((current) => {
        if (!detail.question) return current.filter((item) => item.id !== detail.removedId);
        const rest = current.filter((item) => item.id !== detail.question!.id);
        return [detail.question, ...rest];
      });
    };
    window.addEventListener("huddle-qa", onEvent);
    return () => window.removeEventListener("huddle-qa", onEvent);
  }, [channelId, enabled]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      const data = await apiFetch<{ question?: QaQuestion; voted?: boolean }>("/api/qa", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (data.question) {
        const question = data.question;
        setQuestions((current) => [question, ...current.filter((item) => item.id !== question.id)]);
      }
      return data;
    },
    [],
  );

  const ask = useCallback(
    async (text: string) => {
      const data = await act({ action: "ask", channelId, text });
      if (data.question) setVoted((current) => new Set(current).add(data.question!.id));
    },
    [act, channelId],
  );

  const vote = useCallback(
    async (id: string) => {
      const data = await act({ action: "vote", id });
      setVoted((current) => {
        const next = new Set(current);
        if (data.voted) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [act],
  );

  const host = useCallback(
    async (action: "pin" | "answer" | "hide", id: string) => {
      await act({ action, id });
      if (action === "hide") setQuestions((current) => current.filter((item) => item.id !== id));
    },
    [act],
  );

  const sorted = useMemo(() => sortQuestions(questions), [questions]);
  const pinned = sorted.find((item) => item.pinned) || null;
  const open = sorted.filter((item) => !item.answered).length;

  return { questions: sorted, voted, canHost, loaded, pinned, open, ask, vote, host };
}

export type QaState = ReturnType<typeof useQa>;
