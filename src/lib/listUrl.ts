// Fon listesi durumu <-> adres (paylaşılabilir filtreler). Yalnız varsayılandan farklı alanlar yazılır, okunabilir Türkçe anahtarlar:
// ?q=altin&durum=hepsi&tur=Hisse+Senedi&kurucu=...&bayrak=fx,islamic&risk=1-3&yatirimci=100-&buyukluk=50-500&hisseOran=50
//  &hisse=EREGL&hisseMin=2&varlik=has:g:hisse:10,not:k:vm&gorunum=risk&sirala=y1 (azalan) | sirala=code-artan
import type { AssetRule } from "./assets";

export const EMPTY = { q: "", status: "aktif", type: "", founder: "", flags: [] as string[], riskMin: "", riskMax: "", invMin: "", invMax: "", sizeMin: "", sizeMax: "", stockMin: "", stock: "", stockW: "", assets: [] as AssetRule[] };
export type Filters = typeof EMPTY;
export type ListState = { f: Filters; view: string; sort: { key: string; dir: 1 | -1 } };
export const DEFAULT_VIEW = "getiri";
export const DEFAULT_SORT = { key: "size", dir: -1 as const };

const RANGES = [["risk", "riskMin", "riskMax"], ["yatirimci", "invMin", "invMax"], ["buyukluk", "sizeMin", "sizeMax"]] as const;
const num = (s: string | null) => (s != null && s !== "" && isFinite(Number(s)) ? String(Number(s)) : "");

export function toQuery({ f, view, sort }: ListState): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.status !== EMPTY.status) p.set("durum", f.status || "hepsi");
  if (f.type) p.set("tur", f.type);
  if (f.founder) p.set("kurucu", f.founder);
  if (f.flags.length) p.set("bayrak", f.flags.join(","));
  for (const [k, lo, hi] of RANGES) if (f[lo] || f[hi]) p.set(k, `${f[lo]}-${f[hi]}`);
  if (f.stockMin) p.set("hisseOran", f.stockMin);
  if (f.stock) p.set("hisse", f.stock.toUpperCase());
  if (f.stockW) p.set("hisseMin", f.stockW);
  if (f.assets.length) p.set("varlik", f.assets.map((r) => (r.op === "has" ? `has:${r.a}:${r.min}` : `not:${r.a}`)).join(","));
  if (view !== DEFAULT_VIEW) p.set("gorunum", view);
  if (sort.key !== DEFAULT_SORT.key || sort.dir !== DEFAULT_SORT.dir) p.set("sirala", sort.dir === 1 ? `${sort.key}-artan` : sort.key);
  return p.toString();
}

// views: geçerli görünüm adları (bilinmeyen gorunum yok sayılır). Bozuk/elle yazılmış değerler sessizce atlanır.
export function fromQuery(search: string, views: string[] = [DEFAULT_VIEW]): ListState {
  const p = new URLSearchParams(search), f: Filters = { ...EMPTY, flags: [], assets: [] };
  f.q = p.get("q") ?? "";
  const durum = p.get("durum");
  if (durum === "hepsi") f.status = ""; else if (durum === "aktif" || durum === "pasif") f.status = durum;
  f.type = p.get("tur") ?? "";
  f.founder = p.get("kurucu") ?? "";
  f.flags = (p.get("bayrak") ?? "").split(",").filter((x) => /^[a-zA-Z]+$/.test(x));
  for (const [k, lo, hi] of RANGES) {
    const [a = "", b = ""] = (p.get(k) ?? "").split("-");
    f[lo] = num(a);
    f[hi] = num(b);
  }
  f.stockMin = num(p.get("hisseOran"));
  f.stock = (p.get("hisse") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // eski bağlantılar (?hisse=EREGL, hisse sayfasından): en az %1 ağırlık
  f.stockW = p.has("hisseMin") ? num(p.get("hisseMin")) : f.stock ? "1" : "";
  for (const item of (p.get("varlik") ?? "").split(",").filter(Boolean)) {
    const [op, ...rest] = item.split(":");
    const min = op === "has" ? Number(rest.pop()) : 0, a = rest.join(":");
    if (!a || !/^[a-z0-9:_]+$/i.test(a) || !isFinite(min)) continue;
    if (op === "not") f.assets.push({ a, op: "not", min: 0 });
    else if (op === "has") f.assets.push({ a, op: "has", min: Math.max(0, min) });
  }
  const g = p.get("gorunum");
  const s = p.get("sirala");
  const sort = s ? { key: s.replace(/-artan$/, ""), dir: (s.endsWith("-artan") ? 1 : -1) as 1 | -1 } : { ...DEFAULT_SORT };
  return { f, view: g && views.includes(g) ? g : DEFAULT_VIEW, sort };
}
