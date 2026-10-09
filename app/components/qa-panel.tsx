import { useState } from "react";
import { Check, ChevronUp, EyeOff, MessageCircleQuestionMark, Pin, X } from "lucide-react";
import type { QaState } from "../hooks/use-qa";

/** The question shown on stage while a host answers it. */
export function QaBanner({ qa, beside = false }: { qa: QaState; beside?: boolean }) {
  if (!qa.pinned) return null;
  return (
    <div className={`qa-banner ${beside ? "beside-panel" : ""}`} role="status">
      <MessageCircleQuestionMark size={16} />
      <span className="qa-banner-label">Now answering</span>
      <span className="qa-banner-text">{qa.pinned.text}</span>
      <span className="qa-banner-author">— {qa.pinned.author}</span>
    </div>
  );
}

/** Ask, upvote and (for hosts) pin, answer or hide questions. */
export function QaPanel({
  qa,
  userId,
  onClose,
}: {
  qa: QaState;
  userId: string;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>) => {
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not work.");
    }
  };

  return (
    <aside className="qa-panel" aria-label="Questions">
      <header>
        <strong>Q&amp;A</strong>
        <span>{qa.open} open</span>
        <button type="button" onClick={onClose} aria-label="Close Q&A">
          <X size={16} />
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim() || busy) return;
          setBusy(true);
          void run(async () => {
            await qa.ask(draft);
            setDraft("");
          }).finally(() => setBusy(false));
        }}
      >
        <input
          value={draft}
          maxLength={300}
          placeholder="Ask the hosts a question…"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={!draft.trim() || busy}>
          Ask
        </button>
      </form>
      {error && <p className="qa-error">{error}</p>}
      <ol className="qa-list">
        {qa.questions.map((question) => (
          <li
            key={question.id}
            className={`qa-item ${question.pinned ? "pinned" : ""} ${question.answered ? "answered" : ""}`}
          >
            <button
              type="button"
              className={`qa-vote ${qa.voted.has(question.id) ? "voted" : ""}`}
              onClick={() => void run(() => qa.vote(question.id))}
              aria-label={`Upvote, ${question.votes} votes`}
              aria-pressed={qa.voted.has(question.id)}
            >
              <ChevronUp size={14} />
              <span>{question.votes}</span>
            </button>
            <div className="qa-body">
              <p>{question.text}</p>
              <small>
                {question.author}
                {question.pinned ? " · on stage now" : question.answered ? " · answered" : ""}
              </small>
            </div>
            <div className="qa-actions">
              {qa.canHost && (
                <>
                  <button
                    type="button"
                    title={question.pinned ? "Take off stage" : "Show on stage"}
                    onClick={() => void run(() => qa.host("pin", question.id))}
                  >
                    <Pin size={14} />
                  </button>
                  <button
                    type="button"
                    title={question.answered ? "Reopen" : "Mark answered"}
                    onClick={() => void run(() => qa.host("answer", question.id))}
                  >
                    <Check size={14} />
                  </button>
                </>
              )}
              {(qa.canHost || question.userId === userId) && (
                <button
                  type="button"
                  title="Hide"
                  onClick={() => void run(() => qa.host("hide", question.id))}
                >
                  <EyeOff size={14} />
                </button>
              )}
            </div>
          </li>
        ))}
        {qa.loaded && !qa.questions.length && <li className="qa-empty">No questions yet. Ask the first one!</li>}
      </ol>
    </aside>
  );
}
