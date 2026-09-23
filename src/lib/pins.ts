import { useMemo, useSyncExternalStore } from "react";

// Hesap yok: pinlenen fonlar tarayıcıda (localStorage) tutulur; aynı sekmedeki bileşenler olayla, diğer sekmeler "storage" ile senkron.
const KEY = "pinler";
// Eski "favoriler" listesi ilk açılışta pin olarak devralınır
const read = () => { try { return localStorage.getItem(KEY) ?? localStorage.getItem("favoriler") ?? "[]"; } catch { return "[]"; } };
const sub = (cb: () => void) => {
  addEventListener("storage", cb); addEventListener(KEY, cb);
  return () => { removeEventListener("storage", cb); removeEventListener(KEY, cb); };
};

export function usePins() {
  const raw = useSyncExternalStore(sub, read, () => "[]");
  const pins = useMemo(() => new Set<string>(JSON.parse(raw)), [raw]);
  const toggle = (code: string) => {
    const n = new Set(pins);
    if (!n.delete(code)) n.add(code);
    try { localStorage.setItem(KEY, JSON.stringify([...n])); localStorage.removeItem("favoriler"); } catch {}
    dispatchEvent(new Event(KEY));
  };
  return { pins, toggle };
}
