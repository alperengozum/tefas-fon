// CSV dışa aktarma: Türkçe Excel'in doğrudan açabileceği biçim (UTF-8 BOM, ";" ayırıcı, ondalık virgül).
export type Cell = string | number | null | undefined;

const cell = (v: Cell) => {
  if (v == null || (typeof v === "number" && !isFinite(v))) return "";
  const s = typeof v === "number" ? String(Math.round(v * 1e6) / 1e6).replace(".", ",") : v;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (headers: string[], rows: Cell[][]) =>
  "﻿" + [headers, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";

// Tarayıcıda dosya olarak indir
export function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const today = () => new Date().toISOString().slice(0, 10);
