# TEFAS Fon Analiz

Fintables benzeri fon listeleme / analiz / karşılaştırma. Astro (SSR) + shadcn/ui + PostgreSQL.
Veri: TEFAS'ın yeni resmi JSON API'si (`/api/funds/fonGnlBlgSiraliGetir`, `/dagilimSiraliGetirT`) — auth ve scraper yok.

## Kurulum
```
npm i
export DATABASE_URL=postgres://tefas:tefas@localhost/tefas   # varsayılan bu
npm run db:init      # şema (ingest de otomatik oluşturur)
npm run ingest 400   # ~400 gün geçmiş; TEFAS dk'da 6 istek -> ~15 dk. Tekrar çalıştırınca sadece yeni günleri çeker
npm run dev          # http://localhost:4321
```
2Y/3Y/5Y getiri için tüm geçmiş çekilmez; ingest sadece o vadelerin hedef tarihi çevresindeki 1 haftalık pencereyi çeker (TEFAS: en fazla 5 yıl geriye gider). Kayan tarihler her çalıştırmada tamamlanır.
Günlük güncelleme için `npm run ingest`'i cron'a koyun.

Hisse portföyü: `npm run holdings` — KAP'ın haftalık/aylık "Portföy Dağılım Raporu" PDF'lerinden hisse ağırlıklarını çıkarır (KAP 429 verdiği için yavaş: ilk çalıştırma ~30 dk).

## Performans notları
- Volatilite (risk) her istekte değil ingest sonunda `fund_vol` tablosuna hesaplanır (`npm run ingest -- vol`); liste sorgusu 0,7 sn → 60 ms.
- Liste sonucu tür başına 5 dk bellekte tutulur; tabloya giden veri sıkıştırılmıştır (`src/lib/compact.ts`): HTML 2,6 MB → ~0,75 MB (gzip ~145 KB).
- Arama/filtre `useDeferredValue` ile ertelenir; arka plan işleri `nice` ile düşük öncelikli.

## Sayfalar
- `/fonlar/{yat,bes,byf,gyf}` — liste; Getiri / Büyüklük / Nakit Giriş-Çıkışı sekmeleri, arama, kategori, min büyüklük/yatırımcı/hisse % filtresi
- `/fon/KOD` — detay: getiri, nakit akışı, fiyat/büyüklük/yatırımcı grafiği, varlık dağılımı, rakip fonlar
- `/karsilastir?codes=A,B,...` — en fazla 10 fon: 100'e endeksli grafik, metrikler, varlık dağılımı

- `/fon/KOD` ayrıca: endekslere karşı getiri tablosu + grafik (BIST 100, USD/TRY, gram altın), BIST100 betası/korelasyonu, kayan 3 aylık getiri dağılımı, hisse portföyü en çok örtüşen fonlar
- `/karsilastir` ayrıca: fonlar arası getiri korelasyonu ve hisse örtüşmesi (Σ min ağırlık) matrisi, `endeks=1` ile endeks çizgileri
- `/hisse/TICKER` — hisseyi tutan tüm fonlar, ağırlık ve tahmini TL pozisyon
- `/portfoy` — aranabilir fon seçicilerle fon ekle, tutar (₺) ya da adet (pay) gir; birleşik varlık dağılımı, hisse maruziyeti, geriye dönük performans, korelasyon/örtüşme. Adres `?f=AFT:tl:5000&f=TCD:adet:120` biçimindedir, paylaşılabilir; tarayıcıda localStorage'a kaydedilir
- `/simulasyon?codes=AFT&monthly=5000&start=2025-09-21` — aylık düzenli alım (SIP, XIRR) ve tek seferlik alım, fon ve endekslerle kıyaslı
- Karşılaştır/Simülasyon'da fonlar aranabilir çoklu seçiciyle eklenir (`?codes=A&codes=B`; eski `?codes=A,B` bağlantıları da çalışır)

Endeks verisi Yahoo Finance'ten (`bench` tablosu, `node scripts/ingest.mjs bench`, günlük ingest sonunda otomatik). TEFAS'ta D tarihli fon fiyatı önceki işlem gününü yansıttığı için endeks tarihleri okunurken bir işlem günü kaydırılır (`getBench`). Saf hesaplar `src/lib/stats.ts`, testi `npm test`.

## Sınırlar (TEFAS API'sinde olmayan veriler)
Yönetim ücreti, stopaj, KAP akışı yok.
Hisse portföyü KAP PDR'lerinden gelir; verinin hiç olmadığı gruplar: BES fonları (KAP'ta rapor yok), nitelikli yatırımcı (özel) fonları (rapordan muaf), yazısı vektör çizili PDF yayımlayanlar (İş, Nurol, EMAA Blue, kısmen Osmanlı — OCR güvenilmez). Kalanların ~%75'i okunur; ağırlık sütunu PDF'in kendi grup toplamıyla doğrulanır, olmazsa TEFAS hisse %'sine bakılır. `npm test` ayrıştırıcıyı gerçek PDF'lerle sınar.
Nakit akışı = pay sayısı değişimi × güncel fiyat (yaklaşık). Kategori = en büyük varlık kalemi. Varlık dağılımı sadece son gün.

## Deploy (Coolify)
`Dockerfile` + `start.sh`: konteyner şemayı hazırlar, ingest'i günlük döngüde arka planda çalıştırır (ilk açılışta ~20 dk backfill), web'i 4321'de sunar.
Gerekli env: `DATABASE_URL` (Coolify Postgres iç adresi). Domain: `fon.yourapiservice.com` (Cloudflare A kaydı → sunucu IP'si, proxied).
Opsiyonel env: `SHOW_DISCLAIMER=1` — header'da yatırım tavsiyesi değildir uyarısı gösterir (bkz. [Lisans](#lisans)); resmi dağıtımda (fon.yourapiservice.com) açık, varsayılan kapalı.

## E2E testler
`npm run test:e2e` — Playwright (16 senaryo: liste filtre/sıralama/sekme, hisse filtresi, fon detay, karşılaştırma, `/api/holdings`). Yerel Postgres verisiyle build alıp 4322 portunda çalıştırır; ilk seferde `npx playwright install chromium-headless-shell`. Canlıya karşı: `E2E_BASE_URL=https://fon.yourapiservice.com npm run test:e2e`.

CI: `.github/workflows/e2e.yml` her PR ve main push'unda Postgres servisi + `e2e/seed.sql` (sahte veri) ile çalışır.

## Lisans
[PolyForm Noncommercial 1.0.0](LICENSE) — ticari kullanım/satış yasak (kod, fork, türev fark etmez); kişisel/akademik/araştırma kullanımı serbest. Ticari kullanım için lisansörle iletişime geçin.
Yatırım tavsiyesi değildir, veri sahipliği ve gizlilik notları için: [Kullanım Şartları ve Gizlilik](src/pages/kullanim-sartlari.astro) (`/kullanim-sartlari`), [LICENSE](LICENSE)'daki "Not Investment Advice; Data Disclaimer" bölümü.
