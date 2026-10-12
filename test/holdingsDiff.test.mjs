// İki rapor arasında hisse değişimleri
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffHoldings } from "../src/lib/holdingsDiff.ts";

const h = (o) => Object.entries(o).map(([ticker, weight]) => ({ ticker, weight }));

test("yeni giren, çıkan, artan, azalan; eşik altı değişim gürültü", () => {
  const d = diffHoldings(h({ EREGL: 4, ASELS: 5, THYAO: 8, KCHOL: 3 }), h({ EREGL: 6.5, THYAO: 8.2, KCHOL: 1, SISE: 2, BIMAS: 4 }));
  assert.deepEqual(d.added, h({ BIMAS: 4, SISE: 2 })); // ağırlığa göre
  assert.deepEqual(d.removed, h({ ASELS: 5 }));
  assert.deepEqual(d.up, [{ ticker: "EREGL", from: 4, to: 6.5, delta: 2.5 }]);
  assert.deepEqual(d.down, [{ ticker: "KCHOL", from: 3, to: 1, delta: -2 }]); // THYAO +0.2 yok
});

test("eşik ayarlanabilir; boş raporlar", () => {
  assert.equal(diffHoldings(h({ A: 1 }), h({ A: 1.2 }), 0.1).up.length, 1);
  assert.deepEqual(diffHoldings([], h({ A: 1 })), { added: h({ A: 1 }), removed: [], up: [], down: [] });
  assert.deepEqual(diffHoldings(h({ A: 1 }), []), { added: [], removed: h({ A: 1 }), up: [], down: [] });
});
