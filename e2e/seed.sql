-- CI için küçük sahte veri (şema: db/schema.sql). Tarihler bugüne göre, en yeni gün = bugün.
CREATE TEMP TABLE f (code text, kind text, name text, base double precision, drift double precision, alloc jsonb);
INSERT INTO f VALUES
  ('AAA','YAT','ALFA PORTFÖY PARA PİYASASI (TL) FONU',       1.0, 0.0008, '{"hs":0,"r":0,"tr":95,"vm":5}'),
  ('BBB','YAT','ALFA PORTFÖY HİSSE SENEDİ FONU',             2.0, 0.0012, '{"hs":90,"r":5,"vm":5}'),
  ('CCC','YAT','BETA PORTFÖY SERBEST (DÖVİZ) FON',           3.0, 0.0006, '{"hs":10,"r":40,"dt":50}'),
  ('DDD','YAT','BETA PORTFÖY ALTIN KATILIM FONU',            4.0, 0.0010, '{"km":90,"r":10}'),
  ('EEE','YAT','GAMA PORTFÖY DEĞİŞKEN FON',                  5.0, 0.0009, '{"hs":40,"r":40,"tr":20}'),
  ('EMA','EMK','TEST EMEKLİLİK VE HAYAT A.Ş. HİSSE SENEDİ EMEKLİLİK YATIRIM FONU', 6.0, 0.0011, '{"hs":80,"r":20}'),
  ('BYA','BYF','ALFA PORTFÖY BORSA YATIRIM FONU',            7.0, 0.0010, '{"hs":100}'),
  ('GYA','GYF','GAMA GAYRİMENKUL YATIRIM FONU',              8.0, 0.0005, '{"gm":100}');

INSERT INTO info (kind, code, name, date, price, shares, investors, size)
SELECT f.kind, f.code, f.name, current_date - d, p, s, 1000 + d, p * s
FROM f, generate_series(0, 400) d,
     LATERAL (SELECT f.base * (1 + f.drift * (400 - d) + 0.01 * sin(d)) p, 1e6 * (1 + (400 - d) / 400.0) s) x;

INSERT INTO alloc SELECT code, current_date, alloc FROM f;

INSERT INTO holdings VALUES ('BBB','EREGL',6.5), ('BBB','THYAO',8.2), ('EEE','EREGL',3.1), ('EEE','ASELS',2.4);
INSERT INTO holdings_meta (code, disclosure_index, report, published) VALUES
  ('BBB', 1, '2026/08', current_date), ('EEE', 2, '2026/08', current_date);
