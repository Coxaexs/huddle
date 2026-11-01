import { getRequestExecutionContext } from "vinext/shims/request-context";

/**
 * Work that should finish after the response is sent, without holding it up.
 *
 * A bare `void promise` in a route is not enough on Workers: once the response
 * goes out, unfinished work that nothing registered with `waitUntil` can be
 * dropped. That is how people's own messages, edits, deletes and reactions
 * never reached connected bots (the Discord bridge among them) while bot and
 * webhook messages, which awaited the same call, always did.
 *
 * Outside a request (tests, the Node dev server) the task simply runs.
 */
export function afterResponse(task: Promise<unknown> | (() => Promise<unknown>)): void {
  const promise = (typeof task === "function" ? Promise.resolve().then(task) : task).catch(() => undefined);
  try {
    getRequestExecutionContext()?.waitUntil(promise);
  } catch {
    // No request context: the promise still runs on its own.
  }
}
