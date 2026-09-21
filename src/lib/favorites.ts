import { useMemo, useSyncExternalStore } from "react";

// Hesap yok: favoriler tarayıcıda (localStorage) tutulur; aynı sekmedeki bileşenler olayla, diğer sekmeler "storage" ile senkron.
const KEY = "favoriler";
const read = () => { try { return localStorage.getItem(KEY) ?? "[]"; } catch { return "[]"; } };
const sub = (cb: () => void) => {
  addEventListener("storage", cb); addEventListener(KEY, cb);
  return () => { removeEventListener("storage", cb); removeEventListener(KEY, cb); };
};

export function useFavorites() {
  const raw = useSyncExternalStore(sub, read, () => "[]");
  const favs = useMemo(() => new Set<string>(JSON.parse(raw)), [raw]);
  const toggle = (code: string) => {
    const n = new Set(favs);
    if (!n.delete(code)) n.add(code);
    try { localStorage.setItem(KEY, JSON.stringify([...n])); } catch {}
    dispatchEvent(new Event(KEY));
  };
  return { favs, toggle };
}
