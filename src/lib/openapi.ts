// /api/v1 OpenAPI 3.1 belgesi (agent'lar ve istemci üreticileri için). Şemalar lib/api.ts çıktısıyla aynı tutulmalı.
import { SORT_KEYS } from "./api";
import { SCANS } from "./scans";
import { SITE_NAME } from "./seo";

const RET = { type: "object", description: "Getiri, %. d1=1 gün, w1=1 hafta, m1..m6=ay, ytd=yılbaşından beri, y1..y5=yıl; veri yoksa null", additionalProperties: { type: ["number", "null"] } };
const ERR = { description: "Hata", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
const LIMITED = { description: "Dakikada 60 istek sınırı aşıldı (Retry-After)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
const q = (name: string, description: string, schema: object, required = false) => ({ name, in: "query", required, description, schema });
const p = (name: string, description: string) => ({ name, in: "path", required: true, description, schema: { type: "string" } });
const ok = (ref: string) => ({ description: "Başarılı", content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } } });

export function openapi(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: `${SITE_NAME} API`, version: "1.0.0",
      description: "TEFAS fonları (yatırım, BES, BYF, GYF): liste/arama, fon detayı, hisseyi tutan fonlar, karşılaştırma, hazır taramalar. "
        + "Kimlik doğrulama yok; IP başına dakikada 60 istek. Veri günde bir güncellenir (TEFAS, KAP, Yahoo Finance). Yatırım tavsiyesi değildir. "
        + "Ticari olmayan kullanım (PolyForm Noncommercial). Aynı araçlar MCP olarak da sunulur: POST /mcp.",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/v1/funds": {
        get: {
          operationId: "searchFunds", summary: "Fonları ara, filtrele, sırala",
          parameters: [
            q("kind", "Fon türü", { type: "string", enum: ["yat", "bes", "byf", "gyf", "all"], default: "all" }),
            q("q", "Kod ya da adda geçen metin (Türkçe harf duyarsız)", { type: "string" }),
            q("type", "Fon tipi, kısmi (ör. Hisse Senedi, Para Piyasası)", { type: "string" }),
            q("founder", "Kurucu PYŞ, kısmi (ör. İş Portföy)", { type: "string" }),
            q("sort", "Sıralama alanı", { type: "string", enum: [...SORT_KEYS], default: "size" }),
            q("order", "Yön", { type: "string", enum: ["desc", "asc"], default: "desc" }),
            q("min_size", "En az büyüklük (TL)", { type: "number", minimum: 0 }),
            q("active", "0: pasif/tasfiye fonlar dahil", { type: "string", enum: ["1", "0"], default: "1" }),
            q("limit", "Sayfa boyutu", { type: "integer", minimum: 1, maximum: 100, default: 20 }),
            q("offset", "Atlanacak kayıt", { type: "integer", minimum: 0, default: 0 }),
          ],
          responses: { 200: ok("FundList"), 400: ERR, 429: LIMITED },
        },
      },
      "/api/v1/funds/{code}": {
        get: {
          operationId: "getFund", summary: "Fon detayı",
          parameters: [p("code", "TEFAS fon kodu (ör. AFT)"), q("history", "Günlük fiyat geçmişi (gün, 0 = yok)", { type: "integer", minimum: 0, maximum: 1825, default: 0 })],
          responses: { 200: ok("FundDetail"), 400: ERR, 404: ERR, 429: LIMITED },
        },
      },
      "/api/v1/stocks/{ticker}": {
        get: {
          operationId: "fundsHoldingStock", summary: "Hisseyi tutan fonlar (son KAP Portföy Dağılım Raporu)",
          parameters: [p("ticker", "BIST hisse kodu (ör. THYAO)"), q("min_weight", "En az ağırlık (%)", { type: "number", minimum: 0, maximum: 100, default: 0 })],
          responses: { 200: ok("StockFunds"), 400: ERR, 429: LIMITED },
        },
      },
      "/api/v1/compare": {
        get: {
          operationId: "compareFunds", summary: "2-10 fon: getiriler ve 1 yıllık korelasyon",
          parameters: [q("codes", "Virgülle ayrılmış fon kodları (ör. AFT,TCD)", { type: "string" }, true)],
          responses: { 200: ok("Compare"), 400: ERR, 429: LIMITED },
        },
      },
      "/api/v1/scans/{slug}": {
        get: {
          operationId: "runScan", summary: "Hazır tarama",
          parameters: [{ ...p("slug", SCANS.map((s) => `${s.slug}: ${s.title}`).join("; ")), schema: { type: "string", enum: SCANS.map((s) => s.slug) } }, q("limit", "En fazla kayıt", { type: "integer", minimum: 1, maximum: 50, default: 20 })],
          responses: { 200: ok("Scan"), 404: ERR, 429: LIMITED },
        },
      },
    },
    components: {
      schemas: {
        Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] },
        FundSummary: {
          type: "object",
          properties: {
            code: { type: "string" }, name: { type: "string" }, kind: { type: "string", enum: ["yat", "bes", "byf", "gyf"] }, type: { type: "string" },
            founder: { type: "string" }, active: { type: "boolean" }, price: { type: "number" }, size: { type: "number", description: "Portföy büyüklüğü, TL" },
            investors: { type: "integer" }, returns: RET,
            flows: { type: "object", description: "Tahmini net nakit akışı (TL): pay sayısı değişimi x fiyat", properties: { w1: { type: ["number", "null"] }, m1: { type: ["number", "null"] }, m3: { type: ["number", "null"] } } },
            risk: { type: "object", properties: { score: { type: ["integer", "null"], description: "1-7, volatiliteden tahmini" }, volatility: { type: ["number", "null"], description: "Yıllık, %" }, max_drawdown_1y: { type: ["number", "null"], description: "Son 1 yıl en büyük düşüş, %" } } },
            tags: { type: "object", properties: { fx: { type: "boolean" }, islamic: { type: "boolean" }, qualified: { type: "boolean" }, stock_focus: { type: "boolean" }, oks: { type: "boolean" } } },
            stock_pct: { type: ["number", "null"], description: "Hisse senedi oranı, %" }, url: { type: "string" },
          },
        },
        FundList: { type: "object", properties: { data_date: { type: "string", format: "date" }, total: { type: "integer" }, items: { type: "array", items: { $ref: "#/components/schemas/FundSummary" } } } },
        FundDetail: {
          allOf: [{ $ref: "#/components/schemas/FundSummary" }, {
            type: "object",
            properties: {
              data_date: { type: "string" }, date: { type: "string" }, liquidation_notice: { type: ["string", "null"] },
              benchmarks: { type: "object", additionalProperties: { type: "object", properties: { name: { type: "string" }, returns: RET } } },
              allocation: { type: "object", properties: { date: { type: ["string", "null"] }, items: { type: "array", items: { type: "object", properties: { key: { type: "string" }, name: { type: "string" }, pct: { type: "number" } } } } } },
              holdings: { type: "object", properties: { report: { type: ["string", "null"] }, published: { type: ["string", "null"] }, items: { type: "array", items: { type: "object", properties: { ticker: { type: "string" }, weight: { type: "number" } } } } } },
              history: { type: "array", items: { type: "object", properties: { date: { type: "string" }, price: { type: "number" }, size: { type: "number" }, investors: { type: "integer" } } } },
            },
          }],
        },
        StockFunds: { type: "object", properties: { ticker: { type: "string" }, count: { type: "integer" }, items: { type: "array", items: { type: "object", properties: { code: { type: "string" }, name: { type: "string" }, kind: { type: "string" }, weight: { type: "number" }, fund_size: { type: ["number", "null"] }, est_position_tl: { type: ["number", "null"] } } } } } },
        Compare: { type: "object", properties: { missing: { type: "array", items: { type: "string" } }, funds: { type: "array", items: { type: "object", properties: { code: { type: "string" }, name: { type: "string" }, kind: { type: "string" }, price: { type: "number" }, returns: RET } } }, correlation_1y: { type: "object", properties: { codes: { type: "array", items: { type: "string" } }, matrix: { type: "array", items: { type: "array", items: { type: ["number", "null"] } } } } } } },
        Scan: { type: "object", properties: { slug: { type: "string" }, title: { type: "string" }, description: { type: "string" }, data_date: { type: "string" }, items: { type: "array", items: { $ref: "#/components/schemas/FundSummary" } } } },
      },
    },
  };
}
