CREATE TABLE IF NOT EXISTS info (
  kind text NOT NULL, code text NOT NULL, name text, date date NOT NULL,
  price double precision, shares double precision, investors int, size double precision,
  PRIMARY KEY (code, date)
);
CREATE INDEX IF NOT EXISTS info_date ON info (date);
CREATE INDEX IF NOT EXISTS info_kind_date ON info (kind, date);
-- varlık dağılımı: son iş günü snapshot'ı, {alan: yüzde}
CREATE TABLE IF NOT EXISTS alloc (code text PRIMARY KEY, date date NOT NULL, data jsonb NOT NULL);
-- fon hisse portföyü (KAP Portföy Dağılım Raporu, PDF'ten): son rapor, hisse başına net ağırlık (fon toplam değerine %)
CREATE TABLE IF NOT EXISTS holdings (
  code text NOT NULL, ticker text NOT NULL, weight double precision NOT NULL,
  PRIMARY KEY (code, ticker)
);
CREATE INDEX IF NOT EXISTS holdings_ticker ON holdings (ticker);
CREATE TABLE IF NOT EXISTS holdings_meta (code text PRIMARY KEY, disclosure_index int NOT NULL, report text, published date);
-- KAP keşfi (artımlı): taranan günler ve bulunan Portföy Dağılım Raporu bildirimleri
CREATE TABLE IF NOT EXISTS kap_scanned (day date PRIMARY KEY);
CREATE TABLE IF NOT EXISTS kap_pdr (disclosure_index int PRIMARY KEY, code text NOT NULL, published date, rule text, title text);
CREATE INDEX IF NOT EXISTS kap_pdr_code ON kap_pdr (code, disclosure_index DESC);
-- note: rapor okunamadıysa nedeni ('muaf' nitelikli fon, 'okunamadi'); v: ayrıştırıcı sürümü (artınca yeniden işlenir)
ALTER TABLE holdings_meta ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE holdings_meta ADD COLUMN IF NOT EXISTS v int NOT NULL DEFAULT 1;
