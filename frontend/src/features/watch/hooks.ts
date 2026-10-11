"use client";

import { useSyncExternalStore } from "react";
import { isStandalone, pushSupport, type PushSupport } from "@/lib/api/watch";
import { installStore } from "@/lib/pwa";

const noop = () => () => undefined;

/** Browser capabilities, read after hydration (null on the server, so markup matches). */
export function usePushSupport(): PushSupport | null {
  return useSyncExternalStore(noop, pushSupport, () => null);
}

/** Phones and tablets (touch-first screens up to tablet width); never laptops or desktops. */
const PHONE_QUERY = "(pointer: coarse) and (max-width: 1024px)";
function subscribePhone(cb: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}

export function useInstallState() {
  const offer = useSyncExternalStore(installStore.subscribe, installStore.get, () => null);
  const standalone = useSyncExternalStore(noop, isStandalone, () => false);
  const ios = useSyncExternalStore(
    noop,
    () => /iPad|iPhone|iPod/.test(navigator.userAgent),
    () => false,
  );
  return { offer, standalone, ios };
}
