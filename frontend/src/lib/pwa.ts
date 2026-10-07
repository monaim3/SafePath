/**
 * Install ("Add to Home Screen") support. Chrome/Edge/Android fire `beforeinstallprompt` once,
 * early — we keep it so an Install button can use it later. iOS has no prompt; the UI explains.
 */
import { cellToCenterChild, cellToParent, getResolution } from "h3-js";
import { registerServiceWorker } from "@/lib/api/watch";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Registers the service worker and starts listening for the install offer. Safe to call repeatedly. */
export function startPwa() {
  if (started || typeof window === "undefined") return;
  started = true;
  void registerServiceWorker()?.catch(() => undefined);
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // show our own button instead of the browser's mini-bar
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export const installStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** "prompt" = we can show the browser's install dialog; "installed" = done; null = not offered. */
  get(): "prompt" | "installed" | null {
    return installed ? "installed" : deferred ? "prompt" : null;
  },
};

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  emit();
  return outcome === "accepted";
}

/** Followed areas are neighbourhood size (H3 resolution 9), same rule as the server. */
export const WATCH_RES = 9;

export function watchCellFor(cell: string): string {
  const res = getResolution(cell);
  if (res === WATCH_RES) return cell;
  return res > WATCH_RES ? cellToParent(cell, WATCH_RES) : cellToCenterChild(cell, WATCH_RES);
}

/** The short area code the site shows everywhere (e.g. "F1396"). */
export function areaCode(cell: string): string {
  return cell.slice(4, 9).toUpperCase();
}
