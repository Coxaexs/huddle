# Mail alert

Rings your phone when a takedown order or other legal mail reaches your Hoffle address. Mail is still forwarded as usual.

1. Set `FORWARD_TO` in `wrangler.toml`.
2. Pick a long random token. Put it in Hoffle's `.dev.vars` as `OPERATOR_ALERT_TOKEN` and redeploy Hoffle.
3. From this folder: `npx wrangler secret put OPERATOR_ALERT_TOKEN`, then `npx wrangler deploy`.
4. In Cloudflare, Email Routing, send `info@` and `legal@` to the worker `hoffle-mail-alert`.

Alerts use the push routes on your admin account, so check that your phone is set up under Settings, Phone notifications.
