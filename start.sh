#!/bin/sh
# Şemayı hazırla, ingest + hisse portföyü (KAP) çekimini arka planda günlük döngüde çalıştır, web sunucusunu başlat.
# ponytail: konteyner içi döngü (sunucu yeniden başlarsa ingest de baştan başlar); ayrı cron/worker gerekirse ayrılır.
node scripts/ingest.mjs init || exit 1
node scripts/ingest.mjs vol || true # mevcut veriyle risk sütunu hemen dolsun (~1sn)
# nice: PDF ayrıştırma vb. web isteklerinin CPU'sunu çalmasın
# TEFAS fiyatları ~10:00'da açıklanıyor, bazı fonlar geç: her gün 10:00 ve 12:00 (TR, UTC+3 sabit) çek.
# Konteynerde tzdata yok, bu yüzden epoch'a +3 saat ekleyip gün içi saniyeyi hesaplıyoruz.
next_run() { s=$(( ($(date +%s) + 10800) % 86400 )); if [ $s -lt 36000 ]; then echo $((36000 - s)); elif [ $s -lt 43200 ]; then echo $((43200 - s)); else echo $((122400 - s)); fi; }
( while true; do nice -n 15 node scripts/ingest.mjs && nice -n 15 node scripts/holdings.mjs && nice -n 15 node scripts/kap-bulletin.mjs && sleep $(next_run) || sleep 3600; done ) &
# açılışta liste önbelleğini ısıt (soğuk DB ile ilk istek ~3sn sürüyordu)
( sleep 5; for k in yat bes byf gyf; do wget -q -O /dev/null "http://127.0.0.1:${PORT:-4321}/fonlar/$k" || true; done; wget -q -O /dev/null "http://127.0.0.1:${PORT:-4321}/karsilastir" || true ) &
exec node dist/server/entry.mjs
