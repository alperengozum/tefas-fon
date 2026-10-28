// Genel amaçlı TTL önbelleği (anahtar başına Promise; hata önbelleklenmez, en fazla `max` kayıt, en az yakın zamanda kullanılan atılır).
// ponytail: süreç içi Map, tek konteyner; birden çok örnek olursa Redis.
// refresh(): veri değişince (bkz. db.ts onDataChange) içerideki her anahtarı sırayla yeniden hesaplar; yeni sonuç gelene kadar
// eskisi döner, kullanıcı soğuk okumaya denk gelmez. Sıralı: küçük sunucuda DB'ye aynı anda tek sorgu.
export function cached<A extends unknown[], T>(fn: (...a: A) => Promise<T>, key: (...a: A) => string, ttl: number, max = 500, now = Date.now) {
  const m = new Map<string, { t: number; p: Promise<T>; a: A }>();
  const refresh = async () => {
    for (const [k, e] of [...m]) {
      try {
        const v = await fn(...e.a);
        if (m.get(k) === e) m.set(k, { t: now(), p: Promise.resolve(v), a: e.a }); // arada atıldı/yenilendiyse dokunma
      } catch {} // hata: eskisi kalır
    }
  };
  return Object.assign((...a: A): Promise<T> => {
    const k = key(...a), hit = m.get(k);
    if (hit && now() - hit.t < ttl) {
      m.delete(k); m.set(k, hit); // Map ekleme sırası = kullanım sırası: isabet sona taşınır (LRU)
      return hit.p;
    }
    const p = fn(...a);
    m.delete(k);
    m.set(k, { t: now(), p, a });
    p.catch(() => { if (m.get(k)?.p === p) m.delete(k); });
    if (m.size > max) m.delete(m.keys().next().value!);
    return p;
  }, { refresh });
}
