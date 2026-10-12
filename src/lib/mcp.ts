// Minimal MCP sunucusu (Streamable HTTP, durumsuz): POST /mcp gövdesi tek JSON-RPC mesajı, yanıt application/json.
// Oturum, SSE ve sunucudan istemciye istek yok; sadece salt-okur araçlar. SDK yerine elle: 4 metot, bağımlılık yok.
// Spesifikasyon: https://modelcontextprotocol.io/specification (lifecycle, tools, transports)

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

export type Tool = {
  name: string; title: string; description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  run: (args: Record<string, unknown>) => Promise<unknown>;
};

type Id = string | number | null;
type Msg = { jsonrpc?: string; id?: Id; method?: string; params?: Record<string, unknown> };
export type RpcResponse = { jsonrpc: "2.0"; id: Id; result?: unknown; error?: { code: number; message: string; data?: unknown } };

const ok = (id: Id, result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });
const err = (id: Id, code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

// Araç hatası (geçersiz argüman, bulunamadı): protokol hatası değil, modele isError ile metin olarak döner (kendini düzeltebilsin)
export class ToolError extends Error {}

export const SERVER_INFO = { name: "tefas-fon", title: "TEFAS Fon Analiz", version: "1.0.0" };
const INSTRUCTIONS = "Türkiye'deki TEFAS fonları (yatırım, BES, BYF, GYF): arama/sıralama, fon detayı (getiri, risk, varlık dağılımı, hisse portföyü), "
  + "hisseyi tutan fonlar, karşılaştırma ve hazır taramalar. Getiriler yüzde (%), tutarlar TL. Veri günde bir güncellenir. Yatırım tavsiyesi değildir.";

// Geçerli mesaj -> yanıt; bildirim (id yok) -> null (HTTP 202, gövdesiz)
export async function handleMessage(msg: unknown, tools: Tool[]): Promise<RpcResponse | null> {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return err(null, -32600, "Geçersiz istek");
  const { jsonrpc, id, method, params } = msg as Msg;
  if (jsonrpc !== "2.0" || typeof method !== "string") return err(id ?? null, -32600, "Geçersiz istek");
  if (id === undefined) return null; // notifications/initialized, notifications/cancelled ...
  switch (method) {
    case "initialize": {
      const asked = String(params?.protocolVersion ?? "");
      return ok(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: tools.map(({ name, title, description, inputSchema }) => ({
          name, title, description, inputSchema,
          annotations: { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const tool = tools.find((t) => t.name === params?.name);
      if (!tool) return err(id, -32602, `Bilinmeyen araç: ${String(params?.name)}`);
      const args = params?.arguments;
      if (args != null && (typeof args !== "object" || Array.isArray(args))) return err(id, -32602, "arguments bir nesne olmalı");
      try {
        const data = await tool.run((args ?? {}) as Record<string, unknown>);
        const structured = data && typeof data === "object" && !Array.isArray(data) ? data : { result: data };
        return ok(id, { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: structured, isError: false });
      } catch (e) {
        if (e instanceof ToolError) return ok(id, { content: [{ type: "text", text: e.message }], isError: true });
        throw e;
      }
    }
    default:
      return err(id, -32601, `Desteklenmeyen metot: ${method}`);
  }
}
