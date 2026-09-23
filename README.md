# TEFAS Fon Analiz

Türkiye'deki yatırım, emeklilik (BES), borsa yatırım (BYF) ve girişim sermayesi (GYF) fonlarını listeleme, analiz ve karşılaştırma aracı. Fintables benzeri; veriler TEFAS'ın kamuya açık JSON API'sinden, hisse portföyleri KAP raporlarından gelir.

**Canlı demo:** [fon.yourapiservice.com](https://fon.yourapiservice.com)

![Fon listesi](docs/screenshots/liste.png)

## Özellikler

- **Fon listesi**: 2000'den fazla fon. Getiri (1G–5Y), büyüklük ve nakit giriş-çıkışı sekmeleri; sıralama, sonsuz kaydırma
- **Filtreler**: arama, fon türü, kurucu (PYŞ), döviz/katılım/hisse yoğun/nitelikli fon, min büyüklük/yatırımcı, belirli bir hisseyi en az % X oranında tutan fonlar
- **Fon detayı**: fiyat/büyüklük/yatırımcı grafiği, net nakit akışı, varlık dağılımı, risk (volatilite)
- **Endekslere karşı**: BIST 100, USD/TRY ve gram altınla getiri kıyası; BIST 100 betası ve korelasyonu, kayan 3 aylık getiri dağılımı
- **Rakipler ve örtüşme**: aynı kategorideki rakip fonlar, hisse portföyü en çok örtüşen fonlar
- **Karşılaştırma**: en fazla 10 fon; 100'e endeksli grafik, getiri korelasyonu ve hisse örtüşme matrisi
- **Hisse arama**: bir hisseyi hangi fonların ne ağırlıkla tuttuğu ve tahmini TL pozisyonu
- **Portföyüm**: tutar (₺) ya da adet girerek portföy kur; birleşik varlık dağılımı, hisse maruziyeti, geçmiş performans. Adresi paylaşılabilir
- **Simülasyon**: "şu tarihte alsaydım?" Aylık düzenli alım (XIRR) ve tek seferlik alım, fon ve endekslerle kıyaslı
- **Pinleme**: fon listelerinde pinlenen fonlar tablonun en üstünde durur (tarayıcıda saklanır)
- **PDF**: fon detayı yazdırılarak PDF'e aktarılır
- **Mobil uyumlu**: hamburger menü, tek sütun kartlar, dokunmatik grafikler

## Ekran görüntüleri

| Fon detayı | Karşılaştırma |
|---|---|
| ![Fon detayı](docs/screenshots/fon-detay.png) | ![Karşılaştırma](docs/screenshots/karsilastir.png) |
| **Portföyüm** | **Simülasyon** |
| ![Portföy](docs/screenshots/portfoy.png) | ![Simülasyon](docs/screenshots/simulasyon.png) |
| **Hisseyi tutan fonlar** | |
| ![Hisse](docs/screenshots/hisse.png) | |

### Mobil

| Liste | Fon detayı | Karşılaştırma |
|---|---|---|
| <img src="docs/screenshots/mobil-liste.png" width="260" alt="Mobil liste"> | <img src="docs/screenshots/mobil-fon-detay.png" width="260" alt="Mobil fon detayı"> | <img src="docs/screenshots/mobil-karsilastir.png" width="260" alt="Mobil karşılaştırma"> |

## Teknoloji

- **Astro 7** (SSR, `@astrojs/node`) + **React 19** adaları
- **Tailwind CSS 4** + **shadcn/ui** (Base UI), **Recharts** grafikler, Geist yazı tipi
- **PostgreSQL** (`pg`), şema: `db/schema.sql`
- **pdfjs-dist**: KAP Portföy Dağılım Raporu PDF'lerini ayrıştırma
- **Playwright** e2e, `node:test` birim testleri
- Docker (Node 22 Alpine), Coolify ile deploy, GitHub Actions CI

### Veri kaynakları

- **TEFAS**: yeni resmi JSON API (`/api/funds/fonGnlBlgSiraliGetir`, `/dagilimSiraliGetirT`). Auth ve scraper yok
- **KAP**: haftalık/aylık Portföy Dağılım Raporu PDF'lerinden hisse ağırlıkları
- **Yahoo Finance**: BIST 100, USD/TRY, gram altın (`bench` tablosu)

### Proje yapısı

```
scripts/ingest.mjs    TEFAS + endeks verisini DB'ye çeker, volatiliteyi hesaplar
scripts/holdings.mjs  KAP PDF'lerinden hisse portföylerini çıkarır
src/pages/            Astro sayfaları ve API uçları (/api/funds/[tur], /api/holdings)
src/components/       React bileşenleri (FundTable, FundCharts, CompareChart, PortfolioForm, …)
src/lib/              DB sorguları, istatistik (stats.ts), veri sıkıştırma (compact.ts), biçimlendirme
db/schema.sql         Veritabanı şeması
e2e/                  Playwright senaryoları ve CI için sahte veri (seed.sql)
```

## Kurulum

Gereksinimler: Node 22+, PostgreSQL.

```
npm i
export DATABASE_URL=postgres://tefas:tefas@localhost/tefas   # varsayılan bu
npm run db:init      # şema (ingest de otomatik oluşturur)
npm run ingest 400   # ~400 gün geçmiş; TEFAS dk'da 6 istek -> ~15 dk. Tekrar çalıştırınca sadece yeni günleri çeker
npm run dev          # http://localhost:4321
```

- 2Y/3Y/5Y getiri için tüm geçmiş çekilmez; ingest sadece o vadelerin hedef tarihi çevresindeki 1 haftalık pencereyi çeker (TEFAS en fazla 5 yıl geriye gider). Kayan tarihler her çalıştırmada tamamlanır.
- Günlük güncelleme için `npm run ingest`'i cron'a koyun.
- Hisse portföyü: `npm run holdings`. KAP 429 verdiği için yavaştır, ilk çalıştırma ~30 dk sürer.
- Endeks verisi: `node scripts/ingest.mjs bench` (günlük ingest sonunda otomatik çalışır).

### Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusu (4321) |
| `npm run build` / `npm start` | Üretim derlemesi ve sunucu |
| `npm run ingest [gün]` | TEFAS verisini çek |
| `npm run ingest -- vol` | Volatiliteyi yeniden hesapla |
| `npm run holdings` | KAP hisse portföylerini çek |
| `npm test` | Birim testleri (PDF ayrıştırıcı, istatistik) |
| `npm run test:e2e` | Playwright e2e testleri |

## Sayfalar ve URL'ler

- `/fonlar/{yat,bes,byf,gyf}`: fon listesi
- `/fon/KOD`: fon detayı
- `/karsilastir?codes=A&codes=B`: en fazla 10 fon; `endeks=1` endeks çizgilerini ekler (eski `?codes=A,B` biçimi de çalışır)
- `/hisse` ve `/hisse/TICKER`: hisseyi tutan fonlar
- `/portfoy?f=AFT:tl:5000&f=TCD:adet:120`: paylaşılabilir portföy, ayrıca localStorage'a kaydedilir
- `/simulasyon?codes=AFT&monthly=5000&start=2025-09-21`: alım simülasyonu

## Hesaplama notları

- TEFAS'ta D tarihli fon fiyatı önceki işlem gününü yansıttığı için endeks tarihleri okunurken bir işlem günü kaydırılır (`getBench`). Saf hesaplar `src/lib/stats.ts` içinde.
- Nakit akışı = pay sayısı değişimi × güncel fiyat (yaklaşık). Kategori = en büyük varlık kalemi. Varlık dağılımı sadece son gün.
- Hisse örtüşmesi = iki fonun ortak hisselerinde Σ min(ağırlık).

## Performans

- Volatilite (risk) her istekte değil ingest sonunda `fund_vol` tablosuna hesaplanır; liste sorgusu 0,7 sn → 60 ms.
- Liste sonucu tür başına 5 dk bellekte tutulur; tabloya giden veri sıkıştırılır (`src/lib/compact.ts`): HTML 2,6 MB → ~0,75 MB (gzip ~145 KB).
- Arama/filtre `useDeferredValue` ile ertelenir; arka plan işleri `nice` ile düşük öncelikli çalışır.

## Sınırlar

- TEFAS API'sinde yönetim ücreti, stopaj ve KAP akışı yok.
- Hisse portföyü verisi olmayan gruplar: BES fonları (KAP'ta rapor yok), nitelikli yatırımcı (özel) fonları (rapordan muaf), yazısı vektör çizili PDF yayımlayanlar (İş, Nurol, EMAA Blue, kısmen Osmanlı; OCR güvenilmez). Kalanların ~%75'i okunur. Ağırlık sütunu PDF'in kendi grup toplamıyla doğrulanır, olmazsa TEFAS hisse %'sine bakılır. `npm test` ayrıştırıcıyı gerçek PDF'lerle sınar.

## Deploy (Coolify)

`Dockerfile` + `start.sh`: konteyner şemayı hazırlar, ingest'i günlük döngüde arka planda çalıştırır (ilk açılışta ~20 dk backfill) ve web'i 4321 portunda sunar.

| Env | Açıklama |
|---|---|
| `DATABASE_URL` | Zorunlu. Coolify Postgres iç adresi |
| `SHOW_DISCLAIMER=1` | Opsiyonel. Header'da "yatırım tavsiyesi değildir" uyarısı gösterir; resmi dağıtımda açık, varsayılan kapalı |

Domain: `fon.yourapiservice.com` (Cloudflare A kaydı → sunucu IP'si, proxied).

## Testler

- `npm test`: KAP PDF ayrıştırıcısı ve istatistik fonksiyonları için birim testleri.
- `npm run test:e2e`: Playwright (masaüstü ve mobil senaryolar: liste filtre/sıralama/sekme, hisse filtresi, fon detayı, karşılaştırma, `/api/holdings`). Yerel Postgres verisiyle build alıp 4322 portunda çalıştırır; ilk seferde `npx playwright install chromium-headless-shell`. Canlıya karşı: `E2E_BASE_URL=https://fon.yourapiservice.com npm run test:e2e`.
- CI: `.github/workflows/e2e.yml` her PR'da ve main push'unda Postgres servisi + `e2e/seed.sql` (sahte veri) ile çalışır.

## Lisans

[PolyForm Noncommercial 1.0.0](LICENSE) © 2026 Alperen Gözüm

- Kişisel, akademik ve araştırma amaçlı kullanım serbesttir.
- Ticari kullanım ve satış yasaktır (kod, fork ya da türev fark etmez). Ticari kullanım için lisans sahibiyle iletişime geçin.

### Yasal uyarı

Bu proje ve ürettiği çıktılar (fiyat, getiri, sıralama, grafik, karşılaştırma) **yatırım tavsiyesi değildir**. Veriler TEFAS, KAP ve Yahoo Finance'ten derlenir; projeye ait değildir ve doğruluğu garanti edilmez. Yatırım kararı vermeden önce resmi kaynakları kontrol edin.

Ayrıntılar: [Terms](src/pages/terms.astro) (`/terms`), [Privacy Policy](src/pages/privacy-policy.astro) (`/privacy-policy`) ve [LICENSE](LICENSE) içindeki "Not Investment Advice; Data Disclaimer" bölümü.
