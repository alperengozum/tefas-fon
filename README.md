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

## Sayfalar
- `/fonlar/{yat,bes,byf,gyf}` — liste; Getiri / Büyüklük / Nakit Giriş-Çıkışı sekmeleri, arama, kategori, min büyüklük/yatırımcı/hisse % filtresi
- `/fon/KOD` — detay: getiri, nakit akışı, fiyat/büyüklük/yatırımcı grafiği, varlık dağılımı, rakip fonlar
- `/karsilastir?codes=A,B,...` — en fazla 10 fon: 100'e endeksli grafik, metrikler, varlık dağılımı

## Sınırlar (TEFAS API'sinde olmayan veriler)
Yönetim ücreti, stopaj, risk değeri, kurucu, hisse bazlı portföy (EREGL %5 gibi), KAP akışı, BIST/dolar/altın benchmark yok.
Nakit akışı = pay sayısı değişimi × güncel fiyat (yaklaşık). Kategori = en büyük varlık kalemi. Varlık dağılımı sadece son gün.

## Deploy (Coolify)
`Dockerfile` + `start.sh`: konteyner şemayı hazırlar, ingest'i günlük döngüde arka planda çalıştırır (ilk açılışta ~20 dk backfill), web'i 4321'de sunar.
Gerekli env: `DATABASE_URL` (Coolify Postgres iç adresi). Domain: `fon.yourapiservice.com` (Cloudflare A kaydı → sunucu IP'si, proxied).
