import { useState } from "react";
import { Check, ChevronUp, EyeOff, MessageCircleQuestionMark, Pin, X } from "lucide-react";
import type { QaState } from "../hooks/use-qa";
import { useI18n } from "../lib/i18n-context";

/** The question shown on stage while a host answers it. */
export function QaBanner({ qa, beside = false }: { qa: QaState; beside?: boolean }) {
  const { t } = useI18n();
  if (!qa.pinned) return null;
  return (
    <div className={`qa-banner ${beside ? "beside-panel" : ""}`} role="status">
      <MessageCircleQuestionMark size={16} />
      <span className="qa-banner-label">{t("voice.qa.nowAnswering")}</span>
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
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>) => {
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("voice.qa.error"));
    }
  };

  return (
    <aside className="qa-panel" aria-label={t("voice.qa.aria")}>
      <header>
        <strong>{t("voice.qa.title")}</strong>
        <span>{t("voice.qa.openCount", { count: qa.open })}</span>
        <button type="button" onClick={onClose} aria-label={t("voice.qa.closeAria")}>
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
          placeholder={t("voice.qa.placeholder")}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={!draft.trim() || busy}>
          {t("voice.qa.ask")}
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
              aria-label={t("voice.qa.upvoteAria", { votes: question.votes })}
              aria-pressed={qa.voted.has(question.id)}
            >
              <ChevronUp size={14} />
              <span>{question.votes}</span>
            </button>
            <div className="qa-body">
              <p>{question.text}</p>
              <small>
                {question.author}
                {question.pinned ? t("voice.qa.onStage") : question.answered ? t("voice.qa.answered") : ""}
              </small>
            </div>
            <div className="qa-actions">
              {qa.canHost && (
                <>
                  <button
                    type="button"
                    title={question.pinned ? t("voice.qa.takeOffStage") : t("voice.qa.showOnStage")}
                    onClick={() => void run(() => qa.host("pin", question.id))}
                  >
                    <Pin size={14} />
                  </button>
                  <button
                    type="button"
                    title={question.answered ? t("voice.qa.reopen") : t("voice.qa.markAnswered")}
                    onClick={() => void run(() => qa.host("answer", question.id))}
                  >
                    <Check size={14} />
                  </button>
                </>
              )}
              {(qa.canHost || question.userId === userId) && (
                <button
                  type="button"
                  title={t("voice.qa.hide")}
                  onClick={() => void run(() => qa.host("hide", question.id))}
                >
                  <EyeOff size={14} />
                </button>
              )}
            </div>
          </li>
        ))}
        {qa.loaded && !qa.questions.length && <li className="qa-empty">{t("voice.qa.empty")}</li>}
      </ol>
    </aside>
  );
}
