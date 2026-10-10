import { LABELS } from "./format.ts";

// TEFAS ~60 varlık kodu veriyor (vmtl, khtl, kkstl…); filtrede tek tek seçmek anlamsız, benzerleri gruplanır.
// Grup değeri: "g:<id>" (üyelerin toplamı), tek kalem: "k:<kod>".
export const GROUPS: { id: string; name: string; keys: string[] }[] = [
  { id: "hisse", name: "Hisse Senedi", keys: ["hs"] },
  { id: "yhisse", name: "Yabancı Hisse", keys: ["yhs"] },
  { id: "devlet", name: "Devlet Tahvili / Bono", keys: ["dt", "hb"] },
  { id: "ozel", name: "Özel Sektör Borçlanma", keys: ["fb", "ost", "bb", "vdm"] },
  { id: "doviz", name: "Eurobond / Döviz Borçlanma", keys: ["eut", "kibd", "osdb", "kba", "dot", "db"] },
  { id: "yborc", name: "Yabancı Menkul / Borçlanma", keys: ["ymk", "yba", "ybkb", "ybosb"] },
  { id: "kira", name: "Kira Sertifikası", keys: ["kks", "kkstl", "kksd", "kksyd", "osks", "oksyd"] },
  { id: "mevduat", name: "Mevduat / Katılım Hesabı", keys: ["vm", "vmtl", "vmd", "vmau", "kh", "khtl", "khd", "khau"] },
  { id: "pp", name: "Para Piyasası / Repo", keys: ["tpp", "bpp", "btaa", "btas", "r", "tr"] },
  { id: "maden", name: "Kıymetli Madenler", keys: ["km", "kmbyf", "kmkba", "kmkks"] },
  { id: "fon", name: "Fon / BYF", keys: ["fkb", "yyf", "byf", "ybyf", "gykb", "gsykb"] },
  { id: "gm", name: "Gayrimenkul / Girişim", keys: ["gyy", "gsyy", "gas"] },
  { id: "turev", name: "Türev / Teminat", keys: ["t", "vint"] },
  { id: "diger", name: "Diğer", keys: ["d"] },
];
const BY_ID = new Map(GROUPS.map((g) => [g.id, g]));

export type AssetRule = { a: string; op: "has" | "not"; min: number }; // has: payı ≥ min (min 0 ise > 0), not: hiç yok

// Dağılımda bu varlığın (grup ise üyelerin toplamı) yüzdesi
export function share(alloc: Record<string, number>, a: string) {
  const [t, id] = [a.slice(0, 1), a.slice(2)];
  if (t === "k") return alloc[id] ?? 0;
  let s = 0;
  for (const k of BY_ID.get(id)?.keys ?? []) s += alloc[k] ?? 0;
  return s;
}

// Dağılımı bilinmeyen fon hiçbir kurala uymaz ("içermesin" dahil: bilmediğimizi içermiyor sayamayız)
export const matches = (alloc: Record<string, number> | null, r: AssetRule) => {
  if (!alloc) return false;
  const v = share(alloc, r.a);
  return r.op === "not" ? v <= 0 : r.min > 0 ? v >= r.min : v > 0;
};

export const assetName = (a: string) => (a.startsWith("g:") ? BY_ID.get(a.slice(2))?.name : LABELS[a.slice(2)]) ?? a.slice(2);

export const ruleText = (r: AssetRule) => `${assetName(r.a)} ${r.op === "not" ? "içermesin" : r.min > 0 ? `≥ %${r.min}` : "içersin"}`;

// Seçim listesi: verilerde geçen gruplar; birden çok kalemi olan grubun kalemleri altında girintili.
// Hiçbir gruba girmeyen yeni kodlar sonda tek başına.
export function assetOptions(present: Set<string>) {
  const out: { value: string; label: string; sub?: boolean }[] = [];
  const known = new Set<string>();
  for (const g of GROUPS) {
    g.keys.forEach((k) => known.add(k));
    const ks = g.keys.filter((k) => present.has(k));
    if (!ks.length) continue;
    out.push({ value: `g:${g.id}`, label: g.name });
    if (ks.length > 1 || LABELS[ks[0]] !== g.name) for (const k of ks) out.push({ value: `k:${k}`, label: LABELS[k] ?? k, sub: true });
  }
  for (const k of [...present].filter((k) => !known.has(k)).sort()) out.push({ value: `k:${k}`, label: LABELS[k] ?? k });
  return out;
}
