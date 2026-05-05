import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Settings, Download as DownloadIcon, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { RiskEsikleriModal } from "./RiskEsikleriModal";
import { MusteriDrillDown } from "./MusteriDrillDown";

const PATTERN_LABEL: Record<string, string> = {
  SAGLIKLI: "Sağlıklı", VIP_AKTIF_RISK: "VIP Aktif", TAKIP_GEREKEN: "Takip", YAVAS_ODEYICI: "Yavaş", DONUK_KAYIP: "Donuk",
};
const PATTERN_BG: Record<string, string> = {
  SAGLIKLI: "bg-green-500", VIP_AKTIF_RISK: "bg-blue-600", TAKIP_GEREKEN: "bg-yellow-500", YAVAS_ODEYICI: "bg-orange-500", DONUK_KAYIP: "bg-red-600",
};

export function MusteriListesi({ mizanId }: { mizanId?: string }) {
  const [sortField, setSortField] = useState<string>("netBakiye");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [patternFilter, setPatternFilter] = useState<string>("HEPSI");
  const [sektorFilter, setSektorFilter] = useState<string>("HEPSI");
  const [search, setSearch] = useState("");
  const [esikOpen, setEsikOpen] = useState(false);
  const [drillId, setDrillId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/tahsilat/dashboard", mizanId],
    queryFn: async () => {
      const r = await fetch(`/api/tahsilat/dashboard${mizanId ? `?mizanId=${mizanId}` : ""}`);
      return r.json();
    },
  });

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  const filtered = useMemo(() => {
    if (!data?.musteriler) return [];
    let arr = data.musteriler as any[];
    if (patternFilter !== "HEPSI") arr = arr.filter((m) => m.pattern === patternFilter);
    if (sektorFilter !== "HEPSI") arr = arr.filter((m) => m.sektor === sektorFilter);
    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter((m) => m.ad.toLowerCase().includes(s) || m.hesapKodu.includes(s));
    }
    return [...arr].sort((a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      if (typeof av === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv), "tr") : String(bv).localeCompare(String(av), "tr");
    });
  }, [data, patternFilter, sektorFilter, search, sortField, sortDir]);

  const sektorler = useMemo(() => {
    if (!data?.musteriler) return [];
    return Array.from(new Set((data.musteriler as any[]).map((m) => m.sektor).filter(Boolean))).sort();
  }, [data]);

  const handleSort = (f: string) => {
    if (sortField === f) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };
  const SortIcon = ({ f }: { f: string }) => sortField === f ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />) : <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-30" />;

  const exportCsv = () => {
    const escape = (v: any) => { const s = String(v ?? ""); return s.includes(";") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = filtered.map((m) => [m.hesapKodu, m.ad, m.sektor || "", m.netBakiye.toFixed(2), m.gecikme, m.isAktivitesiAcigi, m.bakiyeFaturaAcikYuzde.toFixed(1), PATTERN_LABEL[m.pattern]]);
    const csv = "﻿" + [["Hesap Kodu", "Ad", "Sektör", "Net Bakiye", "Gecikme", "İş Akt. Açığı", "Bakiye-Fatura %", "Risk"], ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `tahsilat-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (!data?.mizan) return <div className="text-center text-muted-foreground py-12">Henüz mizan yüklenmemiş. Üstten "Mizan Yükle" ile başla.</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 p-4 rounded-lg border bg-muted/20">
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Risk</label>
            <Select value={patternFilter} onValueChange={setPatternFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HEPSI">Hepsi</SelectItem>
                <SelectItem value="SAGLIKLI">Sağlıklı</SelectItem>
                <SelectItem value="VIP_AKTIF_RISK">VIP Aktif</SelectItem>
                <SelectItem value="TAKIP_GEREKEN">Takip</SelectItem>
                <SelectItem value="YAVAS_ODEYICI">Yavaş Ödeyici</SelectItem>
                <SelectItem value="DONUK_KAYIP">Donuk</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Sektör</label>
            <Select value={sektorFilter} onValueChange={setSektorFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HEPSI">Hepsi</SelectItem>
                {sektorler.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Ara</label>
            <Input placeholder="Müşteri / hesap kodu" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[200px]" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <DownloadIcon className="w-3.5 h-3.5 mr-1.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEsikOpen(true)}>
            <Settings className="w-3.5 h-3.5 mr-1.5" /> Risk Eşikleri
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-y-auto">
            <Table className="text-sm">
              <TableHeader className="sticky top-0 bg-muted z-10">
                <TableRow>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Sektör</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("netBakiye")}>Net Bakiye <SortIcon f="netBakiye" /></TableHead>
                  <TableHead>Son Borç</TableHead>
                  <TableHead>Son Ödeme</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("gecikme")}>Gecikme <SortIcon f="gecikme" /></TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("isAktivitesiAcigi")}>İş Akt. <SortIcon f="isAktivitesiAcigi" /></TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("bakiyeFaturaAcikYuzde")}>Bakiye-Fatura % <SortIcon f="bakiyeFaturaAcikYuzde" /></TableHead>
                  <TableHead>Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!filtered.length ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Filtreye uyan müşteri yok</TableCell></TableRow>
                ) : filtered.map((m) => (
                  <TableRow key={m.musteriId} className="cursor-pointer hover:bg-accent/40" onClick={() => setDrillId(m.musteriId)}>
                    <TableCell>
                      <div className="font-medium">{m.ad}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">{m.hesapKodu}</div>
                    </TableCell>
                    <TableCell className="text-xs">{m.sektor || "-"}</TableCell>
                    <TableCell className={`text-right tabular-nums whitespace-nowrap font-semibold ${m.netBakiye < 0 ? "text-blue-600" : "text-orange-700"}`}>{fmtTry(m.netBakiye)}</TableCell>
                    <TableCell className="text-xs tabular-nums">{m.sonBorcTarihi || "-"}</TableCell>
                    <TableCell className="text-xs tabular-nums">{m.sonAlacakTarihi || "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.gecikme >= 9999 ? "—" : `${m.gecikme}g`}</TableCell>
                    <TableCell className={`text-right tabular-nums ${m.isAktivitesiAcigi > 0 ? "text-red-600" : ""}`}>{m.isAktivitesiAcigi}g</TableCell>
                    <TableCell className={`text-right tabular-nums ${m.bakiyeFaturaAcikYuzde > 20 ? "text-red-600 font-semibold" : ""}`}>{m.bakiyeFaturaAcikYuzde >= 999 ? "—" : `${m.bakiyeFaturaAcikYuzde.toFixed(0)}%`}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge className={PATTERN_BG[m.pattern]}>{PATTERN_LABEL[m.pattern]}</Badge>
                        {m.vipRozeti && <span title="VIP">🌟</span>}
                        {m.yuksekBakiyeRozeti && <span title="Yüksek Bakiye">💰</span>}
                        {m.eksiPozisyonRozeti && <span title="Eksi Pozisyon">⚡</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <RiskEsikleriModal open={esikOpen} onClose={() => setEsikOpen(false)} />
      <MusteriDrillDown musteriId={drillId} onClose={() => setDrillId(null)} />
    </div>
  );
}
