/**
 * Stub for the `cloudflare:workers` module, which only exists inside workerd.
 *
 * Unit tests import library code that reaches the runtime bindings; `env` is
 * empty here, and `setBindings()` is how a test supplies a fake database.
 */
export const env: Record<string, unknown> = {};

export class DurableObject {
  ctx: unknown;
  env: unknown;
  constructor(ctx: unknown, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }
}
