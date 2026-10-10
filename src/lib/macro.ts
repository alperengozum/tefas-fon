// Makro seriler (TCMB EVDS): TÜFE endeksi ve TL mevduat faizi -> fon geçmişiyle aynı {date, price} biçiminde günlük seri.
// Böylece endeks tablosu, karşılaştırma grafiği ve simülasyon bunları BIST 100 / altın gibi kullanır (ret, simulate).
export type Pt = { date: string; price: number };
export type Obs = { date: string; value: number }; // ham gözlem: TÜFE ay sonu endeksi veya faiz (yıllık %)

const day = (s: string) => Date.parse(s + "T00:00:00Z") / 864e5;
const iso = (t: number) => new Date(t * 864e5).toISOString().slice(0, 10);
const eom = (d: string) => iso(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0) / 864e5);

// TÜİK 2026'da bazı 2003=100'den 2025=100'e taşıdı (EVDS: TP.FG.J0 arşiv, TP.TUKFIY2025.GENEL yeni). Bazlar farklı olduğundan
// değerler birleştirilemez, aylık değişimler birleştirilir: yeni serinin olduğu aylarda onun değişimi, öncesinde eskininki.
// Sonuç eski seri bazında tek endeks (ay sonu tarihli).
export function chainCpi(old: Obs[], next: Obs[]): Obs[] {
  const norm = (s: Obs[]) => [...new Map(s.filter((o) => o.value > 0).map((o) => [eom(o.date), o.value]))].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const o = norm(old), n = norm(next);
  if (!n.length) return o.map(([date, value]) => ({ date, value }));
  if (!o.length) return n.map(([date, value]) => ({ date, value }));
  const ratio = new Map<string, number>(); // ay -> bu ay / önceki ay
  for (const s of [o, n]) for (let i = 1; i < s.length; i++) ratio.set(s[i][0], s[i][1] / s[i - 1][1]); // n sonra yazılır: öncelikli
  const months = [...new Set([...o, ...n].map(([d]) => d))].sort();
  const out: Obs[] = [{ date: months[0], value: o[0][0] === months[0] ? o[0][1] : n[0][1] }];
  for (const m of months.slice(1)) {
    const r = ratio.get(m);
    if (r == null) break; // zincirde boşluk: devamı güvenilmez
    out.push({ date: m, value: out[out.length - 1].value * r });
  }
  return out;
}

// Aylık TÜFE (ay sonu tarihli) -> günlük endeks; ay içinde geometrik enterpolasyon. Son açıklanan aydan sonrası
// (TÜİK bir sonraki ayın 3'ünde açıklar) son aylık değişimle tahmin edilir. `to`: serinin biteceği gün.
export function cpiDaily(cpi: Obs[], to: string): Pt[] {
  if (cpi.length < 2) return [];
  const out: Pt[] = [];
  const last = cpi[cpi.length - 1], g = last.value / cpi[cpi.length - 2].value;
  let i = 0;
  for (let t = day(cpi[0].date); t <= day(to); t++) {
    const d = iso(t);
    while (i < cpi.length - 1 && cpi[i + 1].date < d) i++;
    const a = cpi[i], b = cpi[i + 1];
    if (b) out.push({ date: d, price: a.value * (b.value / a.value) ** ((t - day(a.date)) / (day(b.date) - day(a.date))) });
    else out.push({ date: d, price: last.value * g ** ((t - day(last.date)) / 30.4375) });
  }
  return out;
}

// Mevduat faizi (yıllık basit %, ör. haftalık gözlem) -> 100'den başlayan günlük birikim serisi: her gün o güne kadarki
// son açıklanan faizle günlük işler (r/365). Brüt: stopaj ve aylık vade yenileme ayrıntısı yok.
export function depositDaily(rates: Obs[], to: string): Pt[] {
  const r = [...rates].filter((o) => o.value >= 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!r.length) return [];
  const out: Pt[] = [];
  let v = 100, i = 0;
  for (let t = day(r[0].date); t <= day(to); t++) {
    const d = iso(t);
    while (i < r.length - 1 && r[i + 1].date <= d) i++;
    if (out.length) v *= 1 + r[i].value / 100 / 365;
    out.push({ date: d, price: v });
  }
  return out;
}

// Reel getiri %: nominal getirinin enflasyondan arındırılmışı ((1+n)/(1+i) - 1)
export const real = (nominal: number | null, inflation: number | null) =>
  nominal == null || inflation == null ? null : ((1 + nominal / 100) / (1 + inflation / 100) - 1) * 100;
