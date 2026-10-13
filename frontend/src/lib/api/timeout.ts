/** A request on a weak mobile connection can hang for minutes: give up and let the retry go sooner. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * An abort signal that fires after `ms`, or when `signal` (e.g. the query's own) aborts first.
 * Written out by hand: AbortSignal.any / .timeout are missing on older phones' browsers.
 */
export function withTimeout(signal?: AbortSignal, ms = REQUEST_TIMEOUT_MS): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const stop = () => {
    clearTimeout(timer);
    controller.abort();
  };
  if (signal?.aborted) stop();
  else signal?.addEventListener("abort", stop, { once: true });
  return controller.signal;
}
