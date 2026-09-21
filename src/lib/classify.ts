// TEFAS API kurucu/tür alanı vermiyor; fon adından türetiyoruz.
const norm = (s: string) =>
  s.toUpperCase().replace(/İ/g, "I").replace(/Ö/g, "O").replace(/Ü/g, "U").replace(/Ş/g, "S").replace(/Ç/g, "C").replace(/Ğ/g, "G");

// I/İ/ı/i aynı sayılır (TEFAS adlarında tutarsız): arama ve kurucu birleştirme için.
export const fold = (s: string) => s.toLocaleLowerCase("tr").replace(/ı/g, "i");

const TYPES: [string, RegExp][] = [
  ["Para Piyasası", /PARA PIYASASI/], ["Fon Sepeti", /FON SEPETI/], ["Hisse Senedi", /HISSE SENEDI/],
  ["Kıymetli Maden", /\bALTIN\b|KIYMETLI MADEN|GUMUS/], ["Eurobond / Dış Borç.", /EUROBOND|DIS BORCLANMA/],
  ["Borçlanma Araçları", /BORCLANMA ARACLARI/], ["Kira Sertifikası", /KIRA SERTIFIKALARI/],
  ["Değişken", /DEGISKEN/], ["Serbest", /SERBEST/], ["Karma", /KARMA/], ["Endeks", /ENDEKS/],
  ["Gayrimenkul", /GAYRIMENKUL/], ["Girişim Sermayesi", /GIRISIM/], ["Standart", /STANDART/], ["BYF", /BORSA YATIRIM|\bBYF\b/],
];

export function classify(name: string, kind: string) {
  const n = norm(name);
  const founder =
    kind === "EMK" ? name.match(/^(.+?A\.Ş\.)/)?.[1] : name.match(/^(.+?)\s+PORTF[ÖO]Y/i)?.[0];
  return {
    founder: founder ?? name.split(" ")[0],
    type: TYPES.find(([, re]) => re.test(n))?.[0] ?? "Diğer",
    fx: /DOVIZ/.test(n),
    islamic: /KATILIM|KIRA SERTIFIKALARI/.test(n),
    qualified: /OZEL/.test(n),
    stockFocus: /HISSE SENEDI YOGUN/.test(n),
    oks: /\bOKS\b/.test(n),
  };
}

// Yıllık volatilite (%) -> 1..7 risk değeri (SRRI eşikleri). ponytail: 1Y günlük veriden tahmin, resmi değer 5Y haftalık.
export const riskOf = (vol: number | null) =>
  vol == null ? null : [0.5, 2, 5, 10, 15, 25].filter((t) => vol >= t).length + 1;
