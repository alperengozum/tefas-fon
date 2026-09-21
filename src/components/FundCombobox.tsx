import { useEffect, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { XIcon } from "lucide-react";
import { decodeFunds } from "../lib/compact";

export type Opt = { value: string; label: string; price: number };

// Tüm fonlar: favoriler sayfasıyla aynı, önbelleklenebilir JSON (sayfa başına bir kez indirilir)
let cache: Promise<Opt[]> | null = null;
export function useFundOptions(): Opt[] {
  const [opts, set] = useState<Opt[]>([]);
  useEffect(() => {
    cache ??= fetch("/api/funds/all").then((r) => r.text()).then((t) => decodeFunds(t).map((f) => ({ value: f.code, label: `${f.code} · ${f.name}`, price: f.price })));
    cache.then(set).catch(() => (cache = null));
  }, []);
  return opts;
}

const INPUT = "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

// Aranabilir tek fon seçici (kod veya ad yazınca süzülür). Liste 2000+ fon: ilk 50 eşleşme gösterilir.
// locale "en": "tr" harmanlamada küçük i, büyük I ile eşleşmez (ipb yazınca IPB bulunamazdı); "en"de i/I/İ aynı harf sayılır.
export function FundCombobox({ value, options, onChange, placeholder = "Fon ara (kod veya ad)…", label = "Fon" }: {
  value: string | null; options: Opt[]; onChange: (code: string | null) => void; placeholder?: string; label?: string;
}) {
  return (
    <Combobox.Root items={options} value={options.find((o) => o.value === value) ?? null} onValueChange={(o: Opt | null) => onChange(o?.value ?? null)}
      isItemEqualToValue={(a: Opt, b: Opt) => a.value === b.value} limit={50} locale="en" autoHighlight>
      <Combobox.Input aria-label={label} placeholder={placeholder} className={INPUT} />
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50 outline-none">
          <Combobox.Popup className="w-(--anchor-width) max-w-(--available-width) rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <Combobox.Empty className="p-3 text-sm text-muted-foreground empty:hidden">Fon bulunamadı</Combobox.Empty>
            <Combobox.List className="max-h-72 overflow-y-auto overscroll-contain p-1 outline-0 data-empty:p-0">
              {(o: Opt) => (
                <Combobox.Item key={o.value} value={o} className="cursor-default truncate rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground">
                  {o.label}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

// Çoklu seçim: seçilenler çip olarak listelenir, her biri `name` alanıyla ayrı form değeri gider (?codes=A&codes=B).
export default function FundPicker({ name, initial = [], max = 10 }: { name: string; initial?: string[]; max?: number }) {
  const options = useFundOptions();
  const [codes, setCodes] = useState<string[]>(initial);
  const names = new Map(options.map((o) => [o.value, o.label]));
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-96">
      {codes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {codes.map((c) => (
            <span key={c} title={names.get(c)} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-2 text-xs">
              {c}
              <button type="button" aria-label={`${c} fonunu çıkar`} onClick={() => setCodes(codes.filter((x) => x !== c))} className="rounded-full p-0.5 hover:bg-muted"><XIcon className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
      {codes.length < max
        ? <FundCombobox value={null} options={options.filter((o) => !codes.includes(o.value))} onChange={(c) => c && setCodes([...codes, c])} placeholder={`Fon ekle (kod veya ad)… en fazla ${max}`} label="Fon ekle" />
        : <span className="text-xs text-muted-foreground">En fazla {max} fon</span>}
      {codes.map((c) => <input key={c} type="hidden" name={name} value={c} />)}
    </div>
  );
}
