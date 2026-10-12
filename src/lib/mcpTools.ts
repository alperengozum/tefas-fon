// MCP araçları: /api/v1 ile aynı sorgu katmanı (lib/api.ts). Hepsi salt-okur.
import { ApiError, normCode, normTicker, parseKind, parseSort, SORT_KEYS, type makeApi } from "./api.ts";
import { SCANS } from "./scans.ts";
import { ToolError, type Tool } from "./mcp.ts";

type Api = ReturnType<typeof makeApi>;
const KIND = { type: "string", enum: ["yat", "bes", "byf", "gyf", "all"], description: "Fon türü: yat (yatırım), bes (emeklilik), byf (borsa yatırım), gyf (gayrimenkul), all (hepsi)" };
const num = (v: unknown, d: number) => (v == null || v === "" ? d : Number.isFinite(Number(v)) ? Number(v) : NaN);
const guard = (run: Tool["run"]): Tool["run"] => async (a) => {
  try { return await run(a); } catch (e) { if (e instanceof ApiError) throw new ToolError(e.message); throw e; }
};

export function mcpTools(api: Api): Tool[] {
  return [
    {
      name: "search_funds", title: "Fon ara ve sırala",
      description: "TEFAS fonlarını kod/ad, tür, kurucu (PYŞ) ve fon tipine göre arar; getiri, büyüklük, yatırımcı, nakit akışı veya volatiliteye göre sıralar. Getiriler %, büyüklük TL.",
      inputSchema: {
        type: "object", additionalProperties: false,
        properties: {
          query: { type: "string", description: "Fon kodu ya da adında geçen metin (ör. 'AFT', 'altın', 'teknoloji')" },
          kind: { ...KIND, default: "yat" },
          type: { type: "string", description: "Fon tipi, kısmi eşleşme (ör. 'Hisse Senedi', 'Para Piyasası', 'Kıymetli Maden', 'Serbest')" },
          founder: { type: "string", description: "Kurucu portföy yönetim şirketi, kısmi eşleşme (ör. 'İş Portföy')" },
          sort_by: { type: "string", enum: [...SORT_KEYS], default: "size", description: "d1/w1/m1/m3/m6/ytd/y1/y2/y3/y5 = getiri vadesi; size, investors, flow_m1 (1 aylık net giriş), volatility" },
          order: { type: "string", enum: ["desc", "asc"], default: "desc" },
          min_size: { type: "number", description: "En az portföy büyüklüğü (TL)" },
          active_only: { type: "boolean", default: true, description: "Tasfiye/pasif fonları dışla" },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
        },
      },
      run: guard(async (a) => {
        const limit = num(a.limit, 10), minSize = num(a.min_size, 0);
        if (!(limit >= 1 && limit <= 50)) throw new ApiError(400, "limit 1-50 arası olmalı");
        return api.funds(parseKind(a.kind ?? "yat"), {
          query: a.query as string | undefined, type: a.type as string | undefined, founder: a.founder as string | undefined,
          sort: parseSort(a.sort_by), order: a.order === "asc" ? "asc" : "desc", limit, minSize: minSize || undefined, activeOnly: a.active_only !== false,
        });
      }),
    },
    {
      name: "get_fund", title: "Fon detayı",
      description: "Tek fonun güncel fiyatı, büyüklüğü, getirileri (1H-5Y), BIST 100 / USD / gram altın ile aynı dönem getirileri, risk (volatilite, maks. düşüş), varlık dağılımı ve KAP hisse portföyü. İsteğe bağlı günlük fiyat geçmişi.",
      inputSchema: {
        type: "object", additionalProperties: false, required: ["code"],
        properties: {
          code: { type: "string", description: "TEFAS fon kodu (ör. AFT, TCD, IPB)" },
          history_days: { type: "integer", minimum: 0, maximum: 1825, default: 0, description: "Kaç günlük fiyat geçmişi eklensin (0 = yok)" },
        },
      },
      run: guard(async (a) => api.fund(normCode(a.code), num(a.history_days, 0) || 0)),
    },
    {
      name: "funds_holding_stock", title: "Hisseyi tutan fonlar",
      description: "Bir BIST hissesini portföyünde tutan fonlar (son KAP Portföy Dağılım Raporu): ağırlık (%) ve tahmini TL pozisyon.",
      inputSchema: {
        type: "object", additionalProperties: false, required: ["ticker"],
        properties: {
          ticker: { type: "string", description: "BIST hisse kodu (ör. THYAO, EREGL, ASELS)" },
          min_weight: { type: "number", minimum: 0, maximum: 100, default: 0, description: "En az ağırlık (%)" },
        },
      },
      run: guard(async (a) => api.stockFunds(normTicker(a.ticker), num(a.min_weight, 0) || 0)),
    },
    {
      name: "compare_funds", title: "Fonları karşılaştır",
      description: "2-10 fonun getirilerini yan yana ve son 1 yıl günlük getiri korelasyon matrisini döner.",
      inputSchema: {
        type: "object", additionalProperties: false, required: ["codes"],
        properties: { codes: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 10, description: "TEFAS fon kodları" } },
      },
      run: guard(async (a) => {
        if (!Array.isArray(a.codes)) throw new ApiError(400, "codes bir dizi olmalı");
        return api.compare(a.codes);
      }),
    },
    {
      name: "run_scan", title: "Hazır tarama",
      description: `Önceden tanımlı fon taramalarından birini çalıştırır: ${SCANS.map((s) => `${s.slug} (${s.title})`).join("; ")}.`,
      inputSchema: {
        type: "object", additionalProperties: false, required: ["slug"],
        properties: {
          slug: { type: "string", enum: SCANS.map((s) => s.slug) },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        },
      },
      run: guard(async (a) => api.scan(String(a.slug ?? ""), num(a.limit, 20) || 20)),
    },
  ];
}
