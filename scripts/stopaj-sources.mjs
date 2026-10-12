// Stopaj oranı kaynakları: portföy şirketi / banka sayfalarındaki "alış tarihine göre fon stopajı" tabloları ve duyuruları.
// Resmi Gazete kararları görüntü PDF (makinece okunmuyor); bu kurumlar her değişiklikten sonra oranları metin olarak yayımlıyor.
// Her kaynak [{ from, a?, b?, serbestHisseYogun? }] satırları üretir (src/lib/stopaj-rules.mjs ile aynı model). Kaynak bayatlayabilir
// veya düzeni değişebilir: checkSource geçmişle tutarlılığı, decide kaynaklar arası uyumu denetler; şüphede hiçbir şey uygulanmaz.
import { ruleAt } from "../src/lib/stopaj-rules.mjs";

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36" };
const iso = (d, m, y) => `${y}-${m}-${d}`;
const pct = (s) => Number(s.replace(",", ".")) / 100;
export const htmlText = (s) => s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&rsquo;|&#x27;|&#39;/g, "’").replace(/&ndash;/g, "–").replace(/&ldquo;|&rdquo;/g, "\"")
  .replace(/&ccedil;/g, "ç").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü").replace(/&Ccedil;/g, "Ç").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
  .replace(/&amp;/g, "&").replace(/\s+/g, " ");

// --- Ziraat Portföy PDF tablosu -------------------------------------------------------------------------------------------
// lines: [{ y, items: [{ x, s }] }] yukarıdan aşağı. Başlık satırında dönem sütunları ("23.12.2020 ... Öncesi", "01.05.2024 – ...",
// "09.07.2025 Sonrası", "(*) 27.03.2026"); satır etiketleri solda, oranlar ilgili sütunun altında.
export function parseZiraatTable(lines) {
  const DATE = /(\d{2})\.(\d{2})\.(\d{4})/;
  const hi = lines.findIndex((l) => l.items.filter((i) => DATE.test(i.s)).length >= 4);
  if (hi < 0) throw new Error("başlık satırı yok");
  const cols = lines[hi].items.filter((i) => DATE.test(i.s)).map((i) => {
    const [, d, m, y] = i.s.match(DATE);
    const below = lines.slice(hi + 1, hi + 3).flatMap((l) => l.items).find((j) => Math.abs(j.x - i.x) < 20);
    return { x: i.x, from: below && /Öncesi/i.test(below.s) ? "0000-01-01" : iso(d, m, y) };
  });
  const label = (re) => lines.findIndex((l, k) => k > hi && l.items.some((i) => i.x < 120 && re.test(i.s)));
  const starts = [/^Değişken, karma/i, /Hisse senedi yoğun/i, /TEFAS Platformunda/i, /^Sürekli olarak/i, /^Diğer menkul/i, /^Girişim/i].map(label);
  const rates = (re) => {
    const k = label(re);
    if (k < 0) return null;
    const next = Math.min(...starts.filter((s) => s > k), lines.length);
    const row = lines.slice(k, next).find((l) => l.items.some((i) => /^%\d/.test(i.s)));
    if (!row) return null;
    const out = new Map();
    for (const i of row.items.filter((i) => /^%\d/.test(i.s))) {
      const c = cols.reduce((m, c) => (Math.abs(c.x - i.x) < Math.abs(m.x - i.x) ? c : m));
      out.set(c.from, pct(i.s.slice(1)));
    }
    return out;
  };
  const a = rates(/^Değişken, karma/i), b = rates(/^Diğer menkul/i), shy = rates(/TEFAS Platformunda/i);
  if (!a?.size || !b?.size) throw new Error("oran satırları okunamadı");
  return cols.map((c) => ({ from: c.from, a: a.get(c.from), b: b.get(c.from), serbestHisseYogun: shy?.get(c.from) }))
    .map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)))
    .filter((r) => Object.keys(r).length > 1);
}

export async function pdfLines(buf) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true, verbosity: 0 }).promise;
  const rows = new Map();
  for (let p = 1; p <= doc.numPages; p++)
    for (const t of (await (await doc.getPage(p)).getTextContent()).items) {
      const s = t.str.trim();
      if (s) { const y = p * -10000 + Math.round(t.transform[5]); (rows.get(y) ?? rows.set(y, []).get(y)).push({ x: Math.round(t.transform[4]), s }); }
    }
  return [...rows].sort((a, b) => b[0] - a[0]).map(([y, items]) => ({ y, items: items.sort((a, b) => a.x - b.x) }));
}

// Ana sayfadaki stopaj PDF bağlantısı (dosya adı her güncellemede değişiyor, ör. ...-27-03-2026-pdf_328.pdf)
export function findZiraatPdf(html, base) {
  const href = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => m[1]).find((h) => /stopaj/i.test(decodeURIComponent(h)));
  return href ? new URL(href, base).href : null;
}

// --- Kalıplı duyuru metni (Garanti BBVA, Yapı Kredi) -----------------------------------------------------------------------
// Cümle başına: "01.05.2024 - 31.10.2024 tarihleri arasında ... %7,5" veya "09.07.2025 tarihinden itibaren ... %15’den %17.5’e".
// Grup: "(değişken, karma, ... hariç)" -> b; değişken/karma geçip "hariç" yoksa -> a; ikisi de yoksa her iki grup.
// ";" ile veya "aşağıdaki stopaj oranları" ile biten parçadaki grup, ardından gelen tarihli cümlelere taşınır (Yapı Kredi düzeni:
// "...hariç olmak üzere; Diğer yatırım fonları için ... aşağıdaki stopaj oranları ... Gerçekleşme tarihi A - B ... Gerçekleşme tarihi C - D ...").
export function parseProse(text) {
  const out = [];
  let carry = null;
  for (const s of text.split(/(?<=[.;])\s+(?=[A-ZÇĞİÖŞÜ0-9])/)) {
    const groupWords = /değişken,? karma/i.test(s), below = /aşağıdaki stopaj oranları/i.test(s);
    const group = groupWords ? (/hariç/i.test(s) ? "b" : "a") : carry;
    const range = s.match(/(\d{2})\.(\d{2})\.(\d{4})\s*(?:–|-|ile)\s*\d{2}\.\d{2}\.\d{4}/);
    const since = s.match(/(\d{2})\.(\d{2})\.(\d{4})\s*(?:tarihinden itibaren|[’']?(?:den|dan|ten|tan) itibaren)/);
    if (groupWords || below) carry = s.trimEnd().endsWith(";") || below ? group : null;
    else if (!range && !since) carry = null;
    if (!/fon/i.test(s) && !group) continue;
    const m = range ?? since, rates = [...s.matchAll(/%\s?(\d+(?:[.,]\d+)?)/g)];
    if (!m || !rates.length || /tarihine kadar/i.test(s)) continue;
    const r = pct(rates[rates.length - 1][1].replace(".", ",")); // "%15’den %17.5’e": yeni oran sonda
    const row = { from: iso(m[1], m[2], m[3]) };
    if (group !== "b") row.a = r;
    if (group !== "a") row.b = r;
    out.push(row);
  }
  return out;
}

// --- Kaynak listesi (öncelik sırasıyla) ------------------------------------------------------------------------------------
async function get(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}
export const SOURCES = [
  { name: "Ziraat Portföy", url: "https://www.ziraatportfoy.com.tr/", async rows() {
    const pdf = findZiraatPdf(await (await get(this.url)).text(), this.url);
    if (!pdf) throw new Error("ana sayfada stopaj PDF bağlantısı yok");
    return parseZiraatTable(await pdfLines(Buffer.from(await (await get(pdf)).arrayBuffer())));
  } },
  { name: "Garanti BBVA", url: "https://www.garantibbva.com.tr/kurumsal-iletisim/fon-stopaj-degisikligi", async rows() {
    return parseProse(htmlText(await (await get(this.url)).text()));
  } },
  { name: "Yapı Kredi", url: "https://www.yapikredi.com.tr/yapi-kredi-hakkinda/haberler/detay/250979", async rows() {
    return parseProse(htmlText(await (await get(this.url)).text()));
  } },
];

// --- Karar ----------------------------------------------------------------------------------------------------------------
const okRate = (v) => typeof v === "number" && v >= 0 && v <= 0.4 && Math.abs(v * 400 - Math.round(v * 400)) < 1e-9; // %0,25 adım
const FIELDS = ["a", "b", "serbestHisseYogun"];

// Kaynağın satırlarını mevcut kurallarla karşılaştırır. Son bilinen dönemden (ya da önceki) satırlar mevcut oranla aynı olmalı
// (değilse kaynak güvenilmez: bayat değil, çelişkili ya da yanlış okunmuş). Sonraki satırlar yeni dönem adayı; verilmeyen alan
// bir önceki kuraldan devralınır.
export function checkSource(rows, rules) {
  const last = rules[rules.length - 1].from, conflicts = [], fresh = [];
  if (!rows.length) return { ok: false, conflicts: ["satır yok"], fresh };
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.from)) { conflicts.push(`geçersiz tarih ${r.from}`); continue; }
    for (const k of FIELDS) if (r[k] !== undefined && !okRate(r[k])) conflicts.push(`${r.from} ${k}=${r[k]} geçersiz oran`);
    if (r.from <= last) {
      const cur = ruleAt(r.from, rules);
      for (const k of FIELDS) if (r[k] !== undefined && Math.abs(r[k] - (cur[k] ?? 0)) > 1e-9) conflicts.push(`${r.from} ${k}: kaynak ${r[k]}, tablo ${cur[k] ?? 0}`);
    } else fresh.push(r);
  }
  let prev = rules[rules.length - 1];
  const rowsOut = fresh.sort((x, y) => (x.from < y.from ? -1 : 1)).map((r) => (prev = { from: r.from, a: r.a ?? prev.a, b: r.b ?? prev.b, serbestHisseYogun: r.serbestHisseYogun ?? prev.serbestHisseYogun ?? 0 }));
  return { ok: conflicts.length === 0, conflicts, fresh: rowsOut };
}

// results: [{ name, rows } | { name, error }] öncelik sırasıyla. Tutarlı kaynaklardan yeni dönem gösteren ilki uygulanır;
// tutarlı iki kaynak yeni dönemlerde ayrışıyorsa hiçbiri uygulanmaz. log: insan için açıklama satırları.
export function decide(results, rules) {
  const log = [], good = [];
  for (const r of results) {
    if (r.error) { log.push(`${r.name}: okunamadı (${r.error})`); continue; }
    const c = checkSource(r.rows, rules);
    if (!c.ok) { log.push(`${r.name}: tablo ile çelişiyor, kullanılmadı (${c.conflicts.slice(0, 3).join("; ")})`); continue; }
    log.push(`${r.name}: tutarlı, ${c.fresh.length ? `${c.fresh.length} yeni dönem` : "yeni dönem yok"}`);
    good.push({ name: r.name, fresh: c.fresh });
  }
  const withNew = good.filter((g) => g.fresh.length);
  if (!withNew.length) return { apply: [], source: null, log };
  const key = (rows) => JSON.stringify(rows);
  const disagree = withNew.filter((g) => key(g.fresh) !== key(withNew[0].fresh));
  if (disagree.length) { log.push(`yeni dönemlerde kaynaklar ayrışıyor (${withNew.map((g) => g.name).join(", ")}): uygulanmadı`); return { apply: [], source: null, log }; }
  return { apply: withNew[0].fresh, source: withNew.map((g) => g.name).join(" + "), log };
}
