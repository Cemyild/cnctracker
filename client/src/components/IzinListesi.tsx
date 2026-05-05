import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Edit2, Trash2, Download as DownloadIcon, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface IzinRow {
  id: string;
  tcNo: string;
  baslangicTarihi: string;
  bitisTarihi: string;
  tur: string;
  gunSayisi: number;
  aciklama: string | null;
  parayaCevrildi: boolean;
  parayaCevrilenTutar: string | null;
}

interface IzinListesiProps {
  onYeniEkle: () => void;
  onDuzenle: (izin: IzinRow) => void;
}

export function IzinListesi({ onYeniEkle, onDuzenle }: IzinListesiProps) {
  const [yil, setYil] = useState<string>(String(new Date().getFullYear()));
  const [tcNoFilter, setTcNoFilter] = useState<string>("");
  const [turFilter, setTurFilter] = useState<string>("HEPSI");
  const [sortField, setSortField] = useState<keyof IzinRow>("baslangicTarihi");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: calisanlar } = useQuery<any[]>({ queryKey: ["/api/calisanlar"] });
  const adMap = useMemo(() => {
    const m = new Map<string, string>();
    calisanlar?.forEach((c) => m.set(c.tcNo, c.adSoyad));
    return m;
  }, [calisanlar]);

  const queryUrl = `/api/izinler?yil=${yil}${tcNoFilter ? `&tcNo=${tcNoFilter}` : ""}${turFilter !== "HEPSI" ? `&tur=${turFilter}` : ""}`;
  const { data: izinler, isLoading } = useQuery<IzinRow[]>({ queryKey: [queryUrl] });

  const sorted = useMemo(() => {
    if (!izinler) return [];
    return [...izinler].sort((a, b) => {
      const av = (a as any)[sortField] ?? "";
      const bv = (b as any)[sortField] ?? "";
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv), "tr") : String(bv).localeCompare(String(av), "tr");
    });
  }, [izinler, sortField, sortDir]);

  const handleSort = (f: keyof IzinRow) => {
    if (sortField === f) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu izin kaydı silinsin mi?")) return;
    const r = await fetch(`/api/izinler/${id}`, { method: "DELETE" });
    if (!r.ok) { toast({ variant: "destructive", title: "Silinemedi" }); return; }
    toast({ title: "Silindi" });
    qc.invalidateQueries({ queryKey: [queryUrl] });
    qc.invalidateQueries({ queryKey: ["/api/izinler/bakiye"] });
    qc.invalidateQueries({ queryKey: ["/api/izinler"] });
  };

  const exportCsv = () => {
    const escape = (v: any) => { const s = String(v ?? ""); return s.includes(";") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = sorted.map((r) => [adMap.get(r.tcNo) ?? r.tcNo, r.tur, r.baslangicTarihi, r.bitisTarihi, r.gunSayisi, r.aciklama ?? "", r.parayaCevrildi ? "Evet" : "Hayır", r.parayaCevrilenTutar ?? ""]);
    const csv = "﻿" + [["Çalışan", "Tür", "Başlangıç", "Bitiş", "Gün", "Açıklama", "Paraya Çevrildi", "Tutar"], ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `izinler-${yil}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const SortIcon = ({ f }: { f: keyof IzinRow }) => sortField === f ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />) : <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-30" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 p-4 rounded-lg border bg-muted/20">
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Yıl</label>
            <Select value={yil} onValueChange={setYil}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026, 2027].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Çalışan</label>
            <Select value={tcNoFilter || "HEPSI"} onValueChange={(v) => setTcNoFilter(v === "HEPSI" ? "" : v)}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Hepsi" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HEPSI">Hepsi</SelectItem>
                {Array.from(adMap.entries())
                  .filter(([tc]) => tc && tc.trim().length > 0)
                  .map(([tc, ad]) => <SelectItem key={tc} value={tc}>{ad}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tür</label>
            <Select value={turFilter} onValueChange={setTurFilter}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HEPSI">Hepsi</SelectItem>
                <SelectItem value="YILLIK">Yıllık</SelectItem>
                <SelectItem value="MAZERET">Mazeret</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!sorted.length}>
            <DownloadIcon className="w-3.5 h-3.5 mr-1.5" /> CSV
          </Button>
          <Button onClick={onYeniEkle} className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-1.5" /> Yeni İzin Ekle
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-md overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              <Table className="text-sm">
                <TableHeader className="sticky top-0 bg-muted z-10">
                  <TableRow>
                    <TableHead className="cursor-pointer" onClick={() => handleSort("tcNo")}>Çalışan <SortIcon f="tcNo" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort("tur")}>Tür <SortIcon f="tur" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort("baslangicTarihi")}>Başlangıç <SortIcon f="baslangicTarihi" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort("bitisTarihi")}>Bitiş <SortIcon f="bitisTarihi" /></TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => handleSort("gunSayisi")}>Gün <SortIcon f="gunSayisi" /></TableHead>
                    <TableHead>Açıklama</TableHead>
                    <TableHead>Paraya Çevr.</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                    <TableHead className="w-[80px]">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : !sorted.length ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Kayıt yok</TableCell></TableRow>
                  ) : sorted.map((r) => (
                    <TableRow key={r.id} className="hover:bg-accent/40">
                      <TableCell className="font-medium">{adMap.get(r.tcNo) ?? r.tcNo}</TableCell>
                      <TableCell>
                        <Badge variant={r.tur === "YILLIK" ? "default" : "outline"} className={r.tur === "YILLIK" ? "bg-blue-600 hover:bg-blue-700" : "border-orange-400 text-orange-700"}>
                          {r.tur === "YILLIK" ? "Yıllık" : "Mazeret"}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{r.baslangicTarihi}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{r.bitisTarihi}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{r.gunSayisi}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={r.aciklama ?? ""}>{r.aciklama}</TableCell>
                      <TableCell>{r.parayaCevrildi && <Badge className="bg-green-600">💰</Badge>}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{r.parayaCevrilenTutar ? new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(r.parayaCevrilenTutar)) : "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDuzenle(r)}><Edit2 className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => handleDelete(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
