// TEFAS JSON API istemcisi (ingest.mjs ve holdings.mjs ortak kullanır)
const BASE = "https://www.tefas.gov.tr/api/funds/";
export const HDR = {
  Accept: "*/*", "Content-Type": "application/json", Origin: "https://www.tefas.gov.tr",
  Referer: "https://www.tefas.gov.tr/tr/fon-verileri",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0.0.0 Safari/537.36",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const ymd = (d) => d.toISOString().slice(0, 10);

// ponytail: sabit 11sn aralık (TEFAS: dk'da 6 istek), hatada 65sn bekle. İstek başı max ~1 ay.
let last = 0;
export async function post(endpoint, kind, start, end) {
  const body = {
    fonTipi: kind, fonKodu: null, aramaMetni: null, fonTurKod: null, fonGrubu: null, sfonTurKod: null,
    fonTurAciklama: null, kurucuKod: null, basTarih: ymd(start).replaceAll("-", ""), bitTarih: ymd(end).replaceAll("-", ""),
    basSira: 1, bitSira: 100000, dil: "TR", sFonTurKod: "", fonKod: "", fonGrup: "", fonUnvanTip: "",
  };
  for (let i = 0; i < 5; i++) {
    await sleep(Math.max(0, 11000 - (Date.now() - last)));
    last = Date.now();
    try {
      const res = await fetch(BASE + endpoint, { method: "POST", headers: HDR, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
      const d = await res.json();
      const msg = (d.errorMessage ?? "").toLowerCase();
      if (msg && !msg.includes("out of bounds") && !msg.includes("bulunamad")) throw new Error(msg);
      return d.resultList ?? [];
    } catch (e) {
      console.log("  hata, tekrar:", e.message);
      await sleep(65000);
    }
  }
  throw new Error("TEFAS yanıt vermiyor");
}

// dagilimSiraliGetirT satırı -> {alan: yüzde} (sıfır olmayan sayısal alanlar)
export const allocData = (r) => Object.fromEntries(Object.entries(r).filter(([k, v]) => typeof v === "number" && v && k !== "rn"));
