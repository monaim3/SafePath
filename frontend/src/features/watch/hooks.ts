"use client";

import { useSyncExternalStore } from "react";
import { isStandalone, pushSupport, type PushSupport } from "@/lib/api/watch";
import { installStore } from "@/lib/pwa";

const noop = () => () => undefined;

/** Browser capabilities, read after hydration (null on the server, so markup matches). */
export function usePushSupport(): PushSupport | null {
  return useSyncExternalStore(noop, pushSupport, () => null);
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
