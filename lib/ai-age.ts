/**
 * AI features are for people 18 and over: Google's Gemini terms ask for it.
 * Hoffle asks once and believes the answer. It is a question, not a proof of
 * age. Every route that sends text to the AI checks it here, so the client
 * cannot skip the question.
 */
export const AI_AGE_CODE = "ai_age_required";

/** A 403 to return until this person has said they are 18 or older. */
export async function requireAiAge(db: D1Database, userId: string): Promise<Response | null> {
  const row = await db
    .prepare("SELECT ai_adult_at FROM users WHERE id = ?")
    .bind(userId)
    .first<{ ai_adult_at: string | null }>();
  if (row?.ai_adult_at) return null;
  return Response.json({ error: "AI features are for people 18 and over.", code: AI_AGE_CODE }, { status: 403 });
}
