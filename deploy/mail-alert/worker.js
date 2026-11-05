/**
 * Cloudflare Email Worker for the Hoffle mail address. It forwards mail as
 * usual and rings the admins' phones when a message looks like a legal order,
 * because those have deadlines measured in hours. Anything sent to legal@
 * always rings; other addresses ring when the sender or subject matches LEGAL.
 */
const LEGAL = /\b(atkm|politie|police|removal order|verwijderingsbevel|bevel|takedown|take-down|dmca|rechtbank|court order|ofcom)\b/i;

export default {
  async email(message, env) {
    await message.forward(env.FORWARD_TO);
    const subject = message.headers.get("subject") || "(no subject)";
    const legal = message.to.toLowerCase().startsWith("legal@") || LEGAL.test(`${message.from} ${subject}`);
    if (!legal) return;
    await fetch(`${env.HOFFLE_URL}/api/admin/alert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPERATOR_ALERT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Legal mail: check it now", body: `${message.from}: ${subject}` }),
    }).catch(() => undefined);
  },
};
