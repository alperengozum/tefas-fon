#!/bin/sh
# Şemayı hazırla, ingest'i arka planda günlük döngüde çalıştır, web sunucusunu başlat.
# ponytail: konteyner içi döngü (sunucu yeniden başlarsa ingest de baştan başlar); ayrı cron/worker gerekirse ayrılır.
node scripts/ingest.mjs init || exit 1
( while true; do node scripts/ingest.mjs && sleep 86400 || sleep 3600; done ) &
exec node dist/server/entry.mjs
