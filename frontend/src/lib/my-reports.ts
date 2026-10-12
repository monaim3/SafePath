/**
 * "My reports": the tracking codes of reports sent from (or added on) this browser, so the
 * reporter never has to type them here. Kept only in this browser; the server can't list a
 * person's reports. The place name is the one the reporter picked, never sent back by the server.
 */
import { useSyncExternalStore } from "react";
import type { CategoryKey } from "@/lib/safety/categories";

export interface MyReport {
  code: string;
  /** Known only for reports sent from this browser. */
  category?: CategoryKey;
  place?: string;
  /** ISO time it was saved here. */
  savedAt: string;
}

const KEY = "sp_my_reports";
const MAX = 50;
const EVENT = "sp-my-reports";
const EMPTY: MyReport[] = [];

let cachedRaw: string | null = null;
let cached: MyReport[] = EMPTY;

function read(): MyReport[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY; // storage blocked: the list is just empty
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cached = Array.isArray(parsed) ? parsed.filter((r): r is MyReport => typeof r?.code === "string") : EMPTY;
  } catch {
    cached = EMPTY;
  }
  return cached;
}

function write(list: MyReport[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage full or blocked: the code is still on screen to copy */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useMyReports(): MyReport[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Adds a code (newest first); an existing entry keeps its details unless new ones are given. */
export function saveMyReport(entry: Omit<MyReport, "savedAt">) {
  const list = read();
  const old = list.find((r) => r.code === entry.code);
  const merged: MyReport = { ...old, ...entry, savedAt: old?.savedAt ?? new Date().toISOString() };
  write([merged, ...list.filter((r) => r.code !== entry.code)]);
}

export function forgetMyReport(code: string) {
  write(read().filter((r) => r.code !== code));
}

/** "sp 7k3m-9qx2" → "SP-7K3M-9QX2", or null if it can't be a code. Mirrors the server's rules. */
export function normalizeCode(raw: string): string | null {
  let v = raw.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (v.length === 10 && v.startsWith("SP")) v = v.slice(2);
  if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(v)) return null;
  return `SP-${v.slice(0, 4)}-${v.slice(4)}`;
}
