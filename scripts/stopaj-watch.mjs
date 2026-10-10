// Stopaj bekçisi: node scripts/stopaj-watch.mjs [ilk çalıştırmada geriye gün=30]
// Resmi Gazete fihristini günlük tarar; yatırım fonu stopajını düzenleyen (GVK geçici 67) ve src/lib/stopaj-rules.mjs'te olmayan
// bir karar görürse GitHub issue açar (GITHUB_TOKEN, issues: write; GITHUB_REPO varsayılan alperengozum/tefas-fon).
// Oranı kendisi DEĞİŞTİRMEZ: karar metni okunup tabloya elle satır eklenir (yanlış ayrıştırma sessizce yanlış vergi göstermesin).
import pg from "pg";
import { readFileSync } from "node:fs";
import { fetchDay, parseFihrist } from "./resmigazete.mjs";
import { KNOWN_KARARLAR } from "../src/lib/stopaj-rules.mjs";

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) throw new Error("DATABASE_URL tanımlı değil");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://tefas:tefas@localhost/tefas" });
await db.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));

const ymd = (t) => new Date(t).toISOString().slice(0, 10);
const today = ymd(Date.now() + 3 * 3600e3); // TR günü (UTC+3); konteynerde tzdata yok
const { rows: [{ last }] } = await db.query("SELECT max(day)::text AS last FROM rg_scanned");
let day = last ? ymd(Date.parse(last) + 864e5) : ymd(Date.parse(today) - Number(process.argv[2] ?? 30) * 864e5);

for (; day <= today; day = ymd(Date.parse(day) + 864e5)) {
  let pages;
  try { pages = await fetchDay(day); } catch (e) { console.log("stopaj bekçisi: tarama durdu", day, e.message); break; } // sonraki çalışmada bu günden devam
  for (const p of pages)
    for (const k of parseFihrist(p.html, p.url))
      await db.query("INSERT INTO stopaj_karar (karar, day, title, url) VALUES ($1, $2, $3, $4) ON CONFLICT (karar) DO NOTHING", [k.karar, day, k.title, k.url]);
  await db.query("INSERT INTO rg_scanned VALUES ($1) ON CONFLICT DO NOTHING", [day]);
}

// Tabloda olmayan ve henüz bildirilmemiş kararlar
const { rows } = await db.query("SELECT karar, day::text, title, url FROM stopaj_karar WHERE issue_url IS NULL ORDER BY day");
const fresh = rows.filter((r) => !KNOWN_KARARLAR.has(r.karar));
const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO ?? "alperengozum/tefas-fon";
const api = process.env.GITHUB_API ?? "https://api.github.com"; // test için değiştirilebilir
for (const k of fresh) {
  console.log(`UYARI: yeni stopaj kararı ${k.karar} (${k.day}): ${k.title} ${k.url}`);
  if (!token) continue; // token yoksa her çalışmada loga yazmaya devam eder
  const res = await fetch(`${api}/repos/${repo}/issues`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "tefas-fon-stopaj-watch" },
    body: JSON.stringify(issue(k)),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) { console.log("issue açılamadı:", res.status, await res.text()); continue; }
  const { html_url } = await res.json();
  await db.query("UPDATE stopaj_karar SET issue_url = $2 WHERE karar = $1", [k.karar, html_url]);
  console.log("issue açıldı:", html_url);
}
await db.end();

function issue(k) {
  return {
    title: `Stopaj değişikliği: Karar ${k.karar} (Resmi Gazete ${k.day.split("-").reverse().join(".")})`,
    body: `Resmi Gazete'de yatırım fonu stopajını düzenleyen (GVK geçici 67) yeni bir karar yayımlandı; \`src/lib/stopaj-rules.mjs\` tablosunda yok.

**${k.title}**
Karar metni: ${k.url}

Yapılacaklar:
- [ ] Karar metnini oku: gerçek kişilerin fon payı oranını değiştiriyor mu? Hangi fon grupları (a: değişken/karma/eurobond/dış borçlanma/yabancı/serbest/döviz, b: diğer), hangi oran, hangi alış tarihinden itibaren
- [ ] Değiştiriyorsa \`STOPAJ_RULES\`'a yürürlük tarihini \`from\` yapan satır ekle (\`karar: "${k.karar}"\`, \`rg\`); değiştirmiyorsa \`REVIEWED\`'a nedeniyle ekle (DİBS, kurumlar vb.)
- [ ] Gruplar/kurallar değiştiyse \`src/lib/portfolio.ts\` \`stopajRate\`'i güncelle
- [ ] \`test/portfolio.test.mjs\`'e yeni dönem için test ekle; simülasyon sayfasındaki stopaj notunu güncelle

_scripts/stopaj-watch.mjs tarafından otomatik açıldı._`,
  };
}
