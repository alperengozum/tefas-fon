import { StarIcon } from "lucide-react";
import { useFavorites } from "../lib/favorites";

export function FavStar({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} aria-label={on ? "Favorilerden çıkar" : "Favorilere ekle"} title={on ? "Favorilerden çıkar" : "Favorilere ekle"}
      onClick={onClick} className="text-muted-foreground hover:text-foreground">
      <StarIcon className={`size-4 ${on ? "fill-amber-400 text-amber-500" : ""}`} />
    </button>
  );
}

// Fon detay sayfası için tek fonluk düğme
export default function FavButton({ code }: { code: string }) {
  const { favs, toggle } = useFavorites();
  const on = favs.has(code);
  return (
    <button type="button" aria-pressed={on} onClick={() => toggle(code)} className="inline-flex items-center gap-1 text-sm underline">
      <StarIcon className={`size-4 ${on ? "fill-amber-400 text-amber-500" : ""}`} />{on ? "Favorilerden çıkar" : "Favorilere ekle"}
    </button>
  );
}
