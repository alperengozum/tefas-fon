import { type Cell, download, toCsv } from "../lib/csv";
import { Button } from "./ui/button";

// Astro sayfalarındaki tablolar için: veriyi prop olarak alır, tıklanınca CSV indirir
export default function CsvButton({ filename, headers, rows, label = "CSV indir" }: { filename: string; headers: string[]; rows: Cell[][]; label?: string }) {
  return <Button type="button" size="sm" variant="outline" onClick={() => download(filename, toCsv(headers, rows))}>{label}</Button>;
}
