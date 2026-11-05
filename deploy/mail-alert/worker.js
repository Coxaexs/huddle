/**
 * Cloudflare Email Worker for the Hoffle mail address. It forwards mail as
 * usual and rings the admins' phones when a message looks like a legal order,
 * because those have deadlines measured in hours. Anything sent to legal@
 * always rings; other addresses ring when the sender or subject matches LEGAL.
 *
 * A mail that passes isVerifiedOrder also has the links in it taken down
 * straight away (lib/takedowns.ts). That can be undone in the admin panel.
 */
import PostalMime from "postal-mime";
import { isVerifiedOrder, linksIn, parseSenders } from "./verify.js";

const LEGAL = /\b(atkm|politie|police|removal order|verwijderingsbevel|bevel|takedown|take-down|dmca|rechtbank|court order|ofcom)\b/i;

function post(env, path, body) {
  return fetch(`${env.HOFFLE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPERATOR_ALERT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export default {
  async email(message, env) {
    await message.forward(env.FORWARD_TO);
    const subject = message.headers.get("subject") || "(no subject)";
    const legal = message.to.toLowerCase().startsWith("legal@") || LEGAL.test(`${message.from} ${subject}`);
    if (!legal) return;
    await post(env, "/api/admin/alert", { title: "Legal mail: check it now", body: `${message.from}: ${subject}` }).catch(() => undefined);

    try {
      const raw = await new Response(message.raw).text();
      if (!isVerifiedOrder(raw, parseSenders(env.TAKEDOWN_SENDERS), env.AUTH_SERVER)) return;
      const parsed = await PostalMime.parse(raw);
      const links = linksIn(`${parsed.text || ""} ${parsed.html || ""}`);
      if (links.length) await post(env, "/api/admin/takedowns", { links, from: message.from, subject });
    } catch {
      // The phone already rang, so a person will handle it.
    }
  },
};
