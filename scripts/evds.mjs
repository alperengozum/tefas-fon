// TCMB EVDS (evds3) istemcisi: ücretsiz API anahtarı gerekir (evds3.tcmb.gov.tr > Profilim > API Key), EVDS_API_KEY ortam değişkeninden.
// İstek: GET <BASE>series=A-B&startDate=dd-mm-yyyy&endDate=dd-mm-yyyy&type=json, anahtar `key` başlığında.
const BASE = "https://evds3.tcmb.gov.tr/igmevdsms-dis/";
const eom = (y, m) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // m: 1-12
const dmy = (d) => `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;

// Yanıt: items[{ Tarih: "2025-3" (aylık, ay sonuna çekilir) | "14-03-2025" (haftalık/günlük), TP_FG_J0: "1234.5" | null }]
export function parseEvds(items, series) {
  const key = series.replace(/\./g, "_");
  return items.flatMap((it) => {
    const v = it[key] == null || it[key] === "" ? NaN : Number(it[key]);
    const t = String(it.Tarih ?? "");
    const m = t.match(/^(\d{4})-(\d{1,2})$/), d = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    const date = m ? eom(+m[1], +m[2]) : d ? `${d[3]}-${d[2]}-${d[1]}` : null;
    return date && isFinite(v) ? [{ date, value: v }] : [];
  });
}

export async function evds(series, from, to, key) {
  const url = `${BASE}series=${series}&startDate=${dmy(from)}&endDate=${dmy(to)}&type=json`;
  const res = await fetch(url, { headers: { key }, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  // geçersiz anahtar/eski uç: JSON yerine HTML giriş sayfası döner
  if (!res.ok || !text.startsWith("{")) throw new Error(`EVDS ${series}: HTTP ${res.status}`);
  return parseEvds(JSON.parse(text).items ?? [], series);
}
