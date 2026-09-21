#!/bin/sh
# Şemayı hazırla, ingest + hisse portföyü (KAP) çekimini arka planda günlük döngüde çalıştır, web sunucusunu başlat.
# ponytail: konteyner içi döngü (sunucu yeniden başlarsa ingest de baştan başlar); ayrı cron/worker gerekirse ayrılır.
node scripts/ingest.mjs init || exit 1
node scripts/ingest.mjs vol || true # mevcut veriyle risk sütunu hemen dolsun (~1sn)
# nice: PDF ayrıştırma vb. web isteklerinin CPU'sunu çalmasın
( while true; do nice -n 15 node scripts/ingest.mjs && nice -n 15 node scripts/holdings.mjs && sleep 86400 || sleep 3600; done ) &
# açılışta liste önbelleğini ısıt (soğuk DB ile ilk istek ~3sn sürüyordu)
( sleep 5; for k in yat bes byf gyf; do wget -q -O /dev/null "http://127.0.0.1:${PORT:-4321}/fonlar/$k" || true; done; wget -q -O /dev/null "http://127.0.0.1:${PORT:-4321}/karsilastir" || true ) &
exec node dist/server/entry.mjs
