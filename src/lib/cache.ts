// Genel amaçlı TTL önbelleği (anahtar başına Promise; hata önbelleklenmez, en fazla `max` kayıt, en az yakın zamanda kullanılan atılır).
// ponytail: süreç içi Map, tek konteyner; birden çok örnek olursa Redis. Veri günde bir değiştiği için 10 dk bayatlık kabul.
export function cached<A extends unknown[], T>(fn: (...a: A) => Promise<T>, key: (...a: A) => string, ttl: number, max = 500, now = Date.now) {
  const m = new Map<string, { t: number; p: Promise<T> }>();
  return (...a: A): Promise<T> => {
    const k = key(...a), hit = m.get(k);
    if (hit && now() - hit.t < ttl) {
      m.delete(k); m.set(k, hit); // Map ekleme sırası = kullanım sırası: isabet sona taşınır (LRU)
      return hit.p;
    }
    const p = fn(...a);
    m.delete(k);
    m.set(k, { t: now(), p });
    p.catch(() => { if (m.get(k)?.p === p) m.delete(k); });
    if (m.size > max) m.delete(m.keys().next().value!);
    return p;
  };
}
