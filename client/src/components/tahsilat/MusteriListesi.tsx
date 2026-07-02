import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Settings, Download as DownloadIcon, ArrowUp, ArrowDown, ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { RiskEsikleriModal } from "./RiskEsikleriModal";
import { MusteriDrillDown } from "./MusteriDrillDown";

const PATTERN_LABEL: Record<string, string> = {
  SAGLIKLI: "Sağlıklı", VIP_AKTIF_RISK: "VIP Aktif", TAKIP_GEREKEN: "Takip", YAVAS_ODEYICI: "Yavaş", DONUK_KAYIP: "Donuk",
};
// Soft zemin + koyu metin pill (palette hizası): DONUK rose, YAVAS amber, VIP sky, TAKIP sarı, SAGLIKLI emerald
const PATTERN_BG: Record<string, string> = {
  SAGLIKLI: "bg-emerald-50 text-emerald-700",
  VIP_AKTIF_RISK: "bg-sky-50 text-sky-700",
  TAKIP_GEREKEN: "bg-yellow-50 text-yellow-700",
  YAVAS_ODEYICI: "bg-amber-50 text-amber-700",
  DONUK_KAYIP: "bg-rose-50 text-rose-700",
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

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-sky-500" /></div>;
  if (!data?.mizan) return <div className="text-center text-muted-foreground py-12">Henüz mizan yüklenmemiş. Üstten "Mizan Yükle" ile başla.</div>;

  return (
    <div className="space-y-4">
      {/* Filtre çubuğu */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-[14px] border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Risk</label>
            <Select value={patternFilter} onValueChange={setPatternFilter}>
              <SelectTrigger className="mt-1 h-[38px] w-[150px]"><SelectValue /></SelectTrigger>
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
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sektör</label>
            <Select value={sektorFilter} onValueChange={setSektorFilter}>
              <SelectTrigger className="mt-1 h-[38px] w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HEPSI">Hepsi</SelectItem>
                {sektorler.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ara</label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Müşteri / hesap kodu" value={search} onChange={(e) => setSearch(e.target.value)} className="h-[38px] w-[220px] pl-9" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-1 text-[12.5px] tabular-nums text-muted-foreground">{filtered.length} müşteri</span>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length} className="h-[38px] rounded-[9px]">
            <DownloadIcon className="w-3.5 h-3.5 mr-1.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEsikOpen(true)} className="h-[38px] rounded-[9px]">
            <Settings className="w-3.5 h-3.5 mr-1.5" /> Risk Eşikleri
          </Button>
        </div>
      </div>

      {/* Müşteri tablosu */}
      <div className="rounded-[14px] border bg-card overflow-hidden">
        <div className="max-h-[600px] overflow-auto">
          <Table className="text-sm">
            <TableHeader className="sticky top-0 z-10 bg-slate-50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Müşteri</TableHead>
                <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Sektör</TableHead>
                <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500 cursor-pointer" onClick={() => handleSort("netBakiye")}>Net Bakiye <SortIcon f="netBakiye" /></TableHead>
                <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Son Borç</TableHead>
                <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Son Ödeme</TableHead>
                <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500 cursor-pointer" onClick={() => handleSort("gecikme")}>Gecikme <SortIcon f="gecikme" /></TableHead>
                <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500 cursor-pointer" onClick={() => handleSort("isAktivitesiAcigi")}>İş Akt. <SortIcon f="isAktivitesiAcigi" /></TableHead>
                <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500 cursor-pointer" onClick={() => handleSort("bakiyeFaturaAcikYuzde")}>Bakiye-Fatura % <SortIcon f="bakiyeFaturaAcikYuzde" /></TableHead>
                <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Risk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!filtered.length ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Filtreye uyan müşteri yok</TableCell></TableRow>
              ) : filtered.map((m) => (
                <TableRow key={m.musteriId} className="cursor-pointer hover:bg-slate-50" onClick={() => setDrillId(m.musteriId)}>
                  <TableCell>
                    <div className="font-medium">{m.ad}</div>
                    <div className="text-[10px] font-mono text-muted-foreground tabular-nums">{m.hesapKodu}</div>
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
                      <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[10.5px] font-bold", PATTERN_BG[m.pattern])}>{PATTERN_LABEL[m.pattern]}</span>
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
      </div>

      <RiskEsikleriModal open={esikOpen} onClose={() => setEsikOpen(false)} />
      <MusteriDrillDown musteriId={drillId} onClose={() => setDrillId(null)} />
    </div>
  );
}
