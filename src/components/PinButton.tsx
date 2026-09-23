import { PinIcon } from "lucide-react";
import { usePins } from "../lib/pins";

const text = (on: boolean) => (on ? "Pini kaldır" : "Listede en üste pinle");

export function PinToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} aria-label={text(on)} title={text(on)}
      onClick={onClick} className={on ? "text-foreground" : "text-muted-foreground hover:text-foreground"}>
      <PinIcon className={`size-4 ${on ? "fill-current" : ""}`} />
    </button>
  );
}

// Fon detay sayfası için tek fonluk düğme
export default function PinButton({ code }: { code: string }) {
  const { pins, toggle } = usePins();
  const on = pins.has(code);
  return (
    <button type="button" aria-pressed={on} onClick={() => toggle(code)} className="inline-flex items-center gap-1 align-middle text-sm underline">
      <PinIcon className={`size-4 ${on ? "fill-current" : ""}`} />{on ? "Pini kaldır" : "Listede pinle"}
    </button>
  );
}
