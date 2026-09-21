export const pct = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

export const tl = (v: number | null | undefined) => {
  if (v == null || !isFinite(v)) return "–";
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)} mr` : a >= 1e6 ? `${(a / 1e6).toFixed(1)} mn` : a >= 1e3 ? `${(a / 1e3).toFixed(0)} B` : a.toFixed(0);
  return `${v < 0 ? "-" : ""}${s} ₺`;
};

export const tone = (v: number | null | undefined) =>
  v == null ? "" : v > 0 ? "text-emerald-600 dark:text-emerald-400" : v < 0 ? "text-red-600 dark:text-red-400" : "";

// TEFAS varlık dağılımı alan kodları -> Türkçe
export const LABELS: Record<string, string> = {
  hs: "Hisse Senedi", dt: "Devlet Tahvili", hb: "Hazine Bonosu", fb: "Finansman Bonosu", ost: "Özel Sektör Tahvili",
  bb: "Banka Bonosu", vdm: "Varlığa Dayalı Menkul K.", eut: "Eurobond", kibd: "Kamu Dış Borçlanma", osdb: "Özel Sektör Dış Borç.",
  kba: "Kamu Döviz İç Borç.", dot: "Döviz Ödemeli Bono", db: "Döviz Ödemeli Tahvil", tpp: "Takasbank Para Piyasası",
  bpp: "BIST Para Piyasası", btaa: "BIST Taahhütlü Alım", btas: "BIST Taahhütlü Satım", r: "Repo", tr: "Ters Repo",
  vm: "Vadeli Mevduat", vmtl: "Mevduat (TL)", vmd: "Mevduat (Döviz)", vmau: "Mevduat (Altın)", kh: "Katılım Hesabı",
  khtl: "Katılım Hesabı (TL)", khd: "Katılım Hesabı (Döviz)", khau: "Katılım Hesabı (Altın)", kks: "Kamu Kira Sertifikası",
  kkstl: "Kamu Kira Sert. (TL)", kksd: "Kamu Kira Sert. (Döviz)", kksyd: "Kamu Yurtdışı Kira Sert.", osks: "Özel Sektör Kira Sert.",
  oksyd: "Özel Yurtdışı Kira Sert.", km: "Kıymetli Madenler", kmbyf: "Kıymetli Maden BYF", kmkba: "Kıymetli Maden Kamu Borç.",
  kmkks: "Kıymetli Maden Kira Sert.", ymk: "Yabancı Menkul Kıymet", yba: "Yabancı Borçlanma Aracı", ybkb: "Yabancı Kamu Borç.",
  ybosb: "Yabancı Özel Sektör Borç.", yhs: "Yabancı Hisse", ybyf: "Yabancı BYF", fkb: "Fon Katılma Belgesi",
  yyf: "Yatırım Fonu", byf: "BYF", gykb: "GYF Katılma Belgesi", gyy: "Gayrimenkul Yatırımı", gsykb: "GSYF Katılma Belgesi",
  gsyy: "Girişim Sermayesi Yatırımı", t: "Türev", vint: "Vadeli İşlem Nakit Teminat", gas: "Gayrimenkul Sertifikası", d: "Diğer",
};
export const label = (k: string | null) => (k ? (LABELS[k] ?? k) : "–");
