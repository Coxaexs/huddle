/**
 * Outgoing mail. Workers cannot speak SMTP, so mail goes through Resend's HTTP
 * API when RESEND_API_KEY and MAIL_FROM are set. Without them the message is
 * logged instead, so a self-hoster can still hand a reset link over by hand.
 */

import { bindings } from "./storage";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<boolean> {
  const { RESEND_API_KEY: key, MAIL_FROM: from } = bindings();
  if (!key || !from) {
    console.log(`[mail] not configured; would send to ${mail.to}: ${mail.subject}\n${mail.text}`);
    return false;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
  });
  if (!response.ok) {
    console.error(`[mail] send failed: ${response.status} ${await response.text().catch(() => "")}`);
    return false;
  }
  return true;
}
