# Contributing to Hoffle

Thank you for your interest in contributing to **Hoffle**! Whether you are fixing a bug, adding a feature, improving accessibility, or translating the interface, this guide will help you get started smoothly.

---

## Architecture & Codebase Navigation

Before diving into the code, check out our engineering documentation:

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — High-level system map, runtime invariants, and directory overview.
- **[docs/codebase.md](docs/codebase.md)** — Detailed guide to the Cloudflare Worker runtime, Durable Objects (`HuddleHub` & `DiscordGateway`), SQLite schema migrations (`lib/schema.ts`), WebRTC/AudioWorklet voice pipeline, Discord v10 bot compatibility, and step-by-step recipes for adding routes, events, and slash commands.

---

## Development Setup

### Prerequisites
- **Node.js 22** (required for Cloudflare Workers / Vinext compatibility)
- **npm** (ships with Node.js)

### Local Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Create your local development environment file:**
   ```bash
   cp .dev.vars.example .dev.vars
   ```
3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open **http://localhost:3001/hangout** in your browser.

4. **Run a full production build locally (optional):**
   ```bash
   npm run build && npm run serve
   ```
   This runs the compiled Worker bundle under Wrangler on **http://127.0.0.1:8730**, persisting SQLite (D1) and uploads (R2) to `./state/`.

---

## Project Layout & Module Rules

- **`worker/`** — Cloudflare Worker entrypoint (`worker/index.ts`). Handles WebSocket upgrades (`/api/realtime`, `/api/gateway`), Discord REST/CDN routing, and security headers before delegating to Vinext.
- **`lib/`** — Shared backend & domain logic (`auth.ts`, `schema.ts`, `hub.ts`, `permissions.ts`, `protocol.ts`, `lib/discord/`).
  - *Constraint*: Code in `worker/` and `lib/` runs inside Cloudflare Worker V8 isolates (`nodejs_compat`). Do not use native Node C++ addons or blocking filesystem I/O.
- **`app/`** — Next.js App Router pages, API routes (`app/api/`), React components (`app/components/`), hooks (`app/hooks/`), and browser-only utilities (`app/lib/`).
  - *Module Naming Rule*: Never give a file in `app/lib/` the exact same relative name as a file in `lib/`. In Docker builds rooted at `/app`, `@/lib/<name>` resolves against `/app/lib/<name>`, which would collide with `app/lib/<name>`. This is enforced by `test/module-names.test.ts`.
- **`docs/`** — User-facing guides (published at [hoffle.online/docs](https://hoffle.online/docs)) and engineering design notes.
  - *Docs Link Rule*: Relative links and heading anchors in `README.md` and `docs/*.md` are verified by `app/lib/docs.test.ts`.

---

## Testing & Verification

Every push and pull request is checked by `.github/workflows/verify.yml`. Always run the verification suite locally before submitting changes:

```bash
npm run verify
```

This runs two checks in order:
1. **`npm run typecheck`** (`tsc --noEmit`) — Verifies all TypeScript types across the codebase (`vinext build` strips types without checking them).
2. **`npm test`** (`vitest run`) — Runs unit tests, SQLite/D1 integration tests, `jsdom` React component tests, and `axe-core` accessibility checks.

---

## Submitting Changes

1. Keep commits focused and write clear, human-readable commit messages explaining *why* a change was made.
2. Add or update unit/component tests in `test/` or `lib/*.test.ts` for new behavior.
3. Ensure `npm run verify` passes with zero errors.

---

## License

By contributing to Hoffle, you agree that your contributions will be licensed under the **[GNU Affero General Public License v3.0 (GNU AGPLv3)](LICENSE)**.
