/**
 * The client half of lib/ai-age.ts: an AI request the server refuses for age
 * asks the question once (components/ai-age-gate.tsx), and a yes sends it again.
 */
import { AI_AGE_CODE } from "@/lib/ai-age";
import { apiFetch } from "./client";

type Reply = (adult: boolean) => void;

let showQuestion: ((reply: Reply) => void) | null = null;
let asking: Promise<boolean> | null = null;

/** The gate registers here; returns how to unregister it. */
export function onAiAgeQuestion(show: (reply: Reply) => void): () => void {
  showQuestion = show;
  return () => {
    if (showQuestion === show) showQuestion = null;
  };
}

function askAge(): Promise<boolean> {
  const show = showQuestion;
  if (!show) return Promise.resolve(false);
  asking ??= new Promise<boolean>((resolve) => {
    show((adult) => {
      asking = null;
      resolve(adult);
    });
  });
  return asking;
}

export async function aiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await apiFetch<T>(path, init);
  } catch (error) {
    if ((error as { code?: string }).code !== AI_AGE_CODE || !(await askAge())) throw error;
    await apiFetch("/api/settings/ai-age", { method: "POST", body: JSON.stringify({ adult: true }) });
    return apiFetch<T>(path, init);
  }
}
