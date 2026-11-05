# Mail alert

Rings your phone when a takedown order or other legal mail reaches your Hoffle address, and takes down the links in a verified order. Mail is still forwarded as usual.

1. Set `FORWARD_TO` in `wrangler.toml`.
2. Pick a long random token. Put it in Hoffle's `.dev.vars` as `OPERATOR_ALERT_TOKEN` and redeploy Hoffle.
3. From this folder: `npm install`, `npx wrangler secret put OPERATOR_ALERT_TOKEN`, then `npx wrangler deploy`.
4. In Cloudflare, Email Routing, send `info@` and `legal@` to the worker `hoffle-mail-alert`.

Alerts use the push routes on your admin account, so check that your phone is set up under Settings, Phone notifications.

## Automatic takedowns

A mail counts as a verified order only when all of this is true. Otherwise the phone rings and nothing is touched:

- its one From address is at a domain in `TAKEDOWN_SENDERS`,
- the topmost `Authentication-Results` header was written by `AUTH_SERVER`,
- that header says `dkim=pass` for that same domain.

Only links in the mail's text are read, not attachments, and only links to a message or file on this Hoffle do anything. An order sent as a PDF rings your phone, and you paste the link into the Takedowns tab.

It starts off: with `TAKEDOWN_SENDERS` empty, every mail only rings your phone. To turn it on:

1. Ask ATKM which address orders come from and how they are delivered.
2. Look at the raw headers of a real mail that came through Cloudflare. The first `Authentication-Results` header has to be there, and its first word has to match `AUTH_SERVER`. **If Cloudflare does not add that header, leave this off**: a sender could then write the header themselves and it would pass.
3. Set `TAKEDOWN_SENDERS`, for example to `atkm.nl`.

