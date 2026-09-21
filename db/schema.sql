CREATE TABLE IF NOT EXISTS info (
  kind text NOT NULL, code text NOT NULL, name text, date date NOT NULL,
  price double precision, shares double precision, investors int, size double precision,
  PRIMARY KEY (code, date)
);
CREATE INDEX IF NOT EXISTS info_date ON info (date);
CREATE INDEX IF NOT EXISTS info_kind_date ON info (kind, date);
-- varlık dağılımı: son iş günü snapshot'ı, {alan: yüzde}
CREATE TABLE IF NOT EXISTS alloc (code text PRIMARY KEY, date date NOT NULL, data jsonb NOT NULL);
