/**
 * Anonymous install ID: a random value kept in this browser. It identifies nothing about the
 * person; the server only stores a salted hash of it for rate limits and trust.
 */
const KEY = "sp_device";
let memoryId: string | null = null;

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Private mode / blocked storage: fall back to a per-tab ID.
    memoryId ??= crypto.randomUUID();
    return memoryId;
  }
}
