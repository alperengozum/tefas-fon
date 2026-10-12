import { readFileSync } from "node:fs";

// ADD COLUMN / CREATE INDEX IF NOT EXISTS, nesne zaten varsa da tablo kilidi alır: başka oturum (eski konteyner, öldürülen
// konteynerden kalan yarım transaction) kilit tutuyorsa süresiz bekler, açılışta sunucu hiç dinlemeye geçmez (Coolify rollback).
// lock_timeout ile hata verip çıkar; şema her ingest/holdings çalışmasında yeniden uygulandığı için sonra tamamlanır.
export async function applySchema(db) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout = '10s'");
    await c.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}

// konteyner öldürülünce TCP kapanmadan kalan oturum, transaction ortasındaysa kilitlerini saatlerce tutmasın
export const POOL_OPTS = { keepAlive: true, idle_in_transaction_session_timeout: 120000 };
