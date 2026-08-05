import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, LabelList,
} from "recharts";
import { Loader2, BarChart3, Truck, Building2, Calendar, Bell, Info } from "lucide-react";
import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { aylar, type Arac } from "@shared/schema";
import { cn, formatCurrencyFull, formatCurrencyShort } from "@/lib/utils";

// Donut + grafik renk paleti (referansla birebir)
const PALETTE = ["#0ea5e9", "#7c3aed", "#10b981", "#f59e0b", "#e11d48"];
const RANK_BG = ["#dcfce7", "#f1f5f9", "#f1f5f9", "#f1f5f9", "#f1f5f9"];
const RANK_FG = ["#15803d", "#64748b", "#64748b", "#64748b", "#64748b"];

export default function Raporlar() {
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
    const [selectedVehicle, setSelectedVehicle] = useState<string>("");
    const [tab, setTab] = useState<string>("sube");

    // 1. Branch Profitability Query
    const { data: branchData, isLoading: branchLoading } = useQuery<any[]>({
        queryKey: ["/api/reports/branch-profitability", selectedYear, selectedMonth],
        queryFn: async () => {
            const res = await fetch(`/api/reports/branch-profitability?yil=${selectedYear}&ay=${selectedMonth}`);
            if (!res.ok) throw new Error("Şube verileri yüklenemedi");
            return res.json();
        }
    });

    // 2. reminders Query
    const { data: reminders, isLoading: remindersLoading } = useQuery<any[]>({
        queryKey: ["/api/reports/reminders"],
        queryFn: async () => {
            const res = await fetch("/api/reports/reminders");
            if (!res.ok) throw new Error("Hatırlatıcılar yüklenemedi");
            return res.json();
        }
    });

    // 3. Vehicles List
    const { data: araclar } = useQuery<Arac[]>({
        queryKey: ["/api/araclar"],
    });

    // 4. Vehicle Expenses Query
    const { data: vehicleExpenses, isLoading: vehicleLoading } = useQuery<any[]>({
        queryKey: ["/api/reports/vehicle-expenses", selectedVehicle],
        enabled: !!selectedVehicle,
        queryFn: async () => {
            const res = await fetch(`/api/reports/vehicle-expenses/${selectedVehicle}`);
            if (!res.ok) throw new Error("Araç harcamaları yüklenemedi");
            return res.json();
        }
    });

    // Tam rakam (₺..) — KPI/tablo/grafik tooltip; grafik ekseni kısaltılmış formatCurrencyShort kullanır
    const formatCur = (val: number) =>
        new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(val || 0);
    const pct = (v: number) => `%${(v * 100).toFixed(1).replace(".", ",")}`;

    // Toplamlar (preserved)
    const branchTotals = useMemo(() => {
        if (!branchData) return null;
        return branchData.reduce((acc, row) => ({
            gelir: acc.gelir + (row.gelir || 0),
            giderPersonel: acc.giderPersonel + (row.giderPersonel || 0),
            giderGumruk: acc.giderGumruk + (row.giderGumruk || 0),
            giderArac: acc.giderArac + (row.giderArac || 0),
            toplamGider: acc.toplamGider + (row.toplamGider || 0),
            kar: acc.kar + (row.kar || 0),
        }), { gelir: 0, giderPersonel: 0, giderGumruk: 0, giderArac: 0, toplamGider: 0, kar: 0 });
    }, [branchData]);

    // En kârlı şube + kâra göre sıralı (ranking)
    const ranked = useMemo(() => {
        if (!branchData) return [];
        return [...branchData]
            .map((b) => ({ ...b, marj: b.gelir ? (b.kar || 0) / b.gelir : 0 }))
            .sort((a, b) => (b.kar || 0) - (a.kar || 0));
    }, [branchData]);

    const periodLabel = `${selectedYear} · ${selectedMonth === "ALL" ? "Tüm Yıl" : selectedMonth}`;

    // Araç gider sekmesi: toplam ve tür kırılımı
    const vehicleToplam = useMemo(
        () => (vehicleExpenses ?? []).reduce((acc, v) => acc + (Number(v.tutar) || 0), 0),
        [vehicleExpenses]
    );

    const vehicleTurToplam = useMemo(() => {
        const m: Record<string, number> = {};
        for (const v of vehicleExpenses ?? []) {
            m[v.tur] = (m[v.tur] || 0) + (Number(v.tutar) || 0);
        }
        return m;
    }, [vehicleExpenses]);

    const vehicleTurListesi = useMemo(
        () => Object.entries(vehicleTurToplam).sort((a, b) => b[1] - a[1]),
        [vehicleTurToplam]
    );

    // Depoda tarih YYYY-MM-DD; ekranda dd/mm/yyyy — new Date() kullanılmaz,
    // timezone kayması geçmişte off-by-one hatalara yol açtı.
    const formatTarihTR = (t: string) => {
        const p = String(t || "").split("-");
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : (t || "—");
    };

    // KPI'lar
    const kpis = branchTotals ? [
        { label: "Toplam Ciro", value: formatCurrencyFull(branchTotals.gelir), sub: `${branchData?.length || 0} şube · mal bedeli`, color: "#0ea5e9" },
        { label: "Toplam Gider", value: formatCurrencyFull(branchTotals.toplamGider), sub: "personel · gümrük · araç", color: "#f97316" },
        { label: "Net Kâr", value: formatCurrencyFull(branchTotals.kar), sub: "konsolide", color: "#10b981" },
        { label: "Kâr Marjı", value: branchTotals.gelir ? pct(branchTotals.kar / branchTotals.gelir) : "—", sub: "ortalama", color: "#7c3aed" },
        { label: "En Kârlı Şube", value: ranked[0]?.sube || "—", sub: ranked[0] ? formatCurrencyFull(ranked[0].kar) : "", color: "#16a34a" },
    ] : [];

    // Donut: ciro payı
    const donut = useMemo(() => {
        if (!branchData) return [];
        const tot = branchData.reduce((a, b) => a + (b.gelir || 0), 0) || 1;
        return branchData.map((b, i) => ({
            sube: b.sube, gelir: b.gelir || 0, color: PALETTE[i % PALETTE.length], pct: pct((b.gelir || 0) / tot),
        }));
    }, [branchData]);

    // Sekme tanımları
    const TABS = [
        { id: "sube", label: "Şube Kârlılığı", color: "#0ea5e9", Icon: Building2, badge: 0 },
        { id: "arac", label: "Araç Giderleri", color: "#10b981", Icon: Truck, badge: 0 },
        { id: "vade", label: "Vade Takip", color: "#e11d48", Icon: Calendar, badge: reminders?.length || 0 },
    ];

    // Özel XAxis tick: şube adı + net kâr
    const BranchTick = (props: any) => {
        const { x, y, payload } = props;
        const row = branchData?.find((b) => b.sube === payload.value);
        const kar = row?.kar ?? 0;
        return (
            <g transform={`translate(${x},${y})`}>
                <text x={0} y={0} dy={14} textAnchor="middle" fontSize={12} fontWeight={700} fill="#1e293b">{payload.value}</text>
                <text x={0} y={0} dy={30} textAnchor="middle" fontSize={11} fontWeight={700} fill={kar >= 0 ? "#16a34a" : "#dc2626"}>
                    Kâr {formatCurrencyShort(kar)}
                </text>
            </g>
        );
    };

    // Stacked gider toplamı etiketi (üst segmentin üstüne)
    const GiderTotalLabel = (props: any) => {
        const { x, y, width, index } = props;
        const total = branchData?.[index]?.toplamGider ?? 0;
        return (
            <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={10.5} fontWeight={800} fill="#64748b">
                {formatCurrencyShort(total)}
            </text>
        );
    };

    return (
        <div className="min-h-full bg-slate-50 dark:bg-background">
            <div className="px-6 pb-12 lg:px-8">
                <Tabs value={tab} onValueChange={setTab} className="w-full">
                    {/* ===== STICKY HEADER ===== */}
                    <div className="sticky top-0 z-30 border-b border-border/70 bg-slate-50/90 pt-5 backdrop-blur dark:bg-background/90">
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sky-500 text-white">
                                    <BarChart3 className="h-[22px] w-[22px]" strokeWidth={2.2} />
                                </div>
                                <div>
                                    <h1 className="text-[22px] font-black tracking-tight">Raporlar ve Analizler</h1>
                                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">Şirketinizin finansal ve operasyonel performansını tek ekranda takip edin</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 rounded-[11px] border bg-card p-1.5 shadow-sm">
                                <Select value={selectedYear} onValueChange={setSelectedYear}>
                                    <SelectTrigger className="h-[34px] w-[100px]"><SelectValue placeholder="Yıl" /></SelectTrigger>
                                    <SelectContent>{[2024, 2025, 2026].map((y) => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                                </Select>
                                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                    <SelectTrigger className="h-[34px] w-[130px]"><SelectValue placeholder="Ay" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">Tüm Yıl</SelectItem>
                                        {aylar.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        {/* Tab barı */}
                        <div className="mt-3.5 flex gap-1">
                            {TABS.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setTab(t.id)}
                                    className={cn(
                                        "inline-flex items-center gap-2 rounded-t-lg px-3.5 py-2.5 text-[13.5px] transition-colors",
                                        tab === t.id ? "font-bold text-foreground" : "font-semibold text-muted-foreground hover:text-foreground"
                                    )}
                                    style={tab === t.id ? { boxShadow: `inset 0 -2px 0 ${t.color}` } : undefined}
                                >
                                    <span className="h-2 w-2 rounded-full" style={{ background: tab === t.id ? t.color : "#cbd5e1" }} />
                                    {t.label}
                                    {t.badge > 0 && (
                                        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10.5px] font-extrabold text-white">
                                            {t.badge}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ===================== ŞUBE KÂRLILIĞI ===================== */}
                    <TabsContent value="sube" className="mt-5 space-y-4">
                        {branchLoading ? (
                            <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin w-10 h-10 text-sky-500" /></div>
                        ) : (
                            <>
                                {/* KPI STRIP */}
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
                                    {kpis.map((k) => (
                                        <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
                                            <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
                                            <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground leading-tight pl-2">{k.label}</div>
                                            <div className="mt-2 text-[20px] font-extrabold tracking-tight tabular-nums pl-2">{k.value}</div>
                                            <div className="mt-0.5 text-[11.5px] text-muted-foreground pl-2">{k.sub}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* CHART ROW */}
                                <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-4">
                                    {/* GROUPED/STACKED BAR */}
                                    <div className="rounded-[16px] border bg-card p-5">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <h3 className="text-[15px] font-extrabold">Şube Bazlı Gelir–Gider Dengesi</h3>
                                                <p className="mt-1 text-xs text-muted-foreground">{periodLabel} · gelir ile gider kalemlerinin şube kırılımı</p>
                                            </div>
                                            <div className="flex flex-wrap gap-3.5">
                                                {[["Gelir", "#0ea5e9"], ["Personel", "#f97316"], ["Gümrük", "#7c3aed"], ["Araç", "#10b981"]].map(([l, c]) => (
                                                    <span key={l} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-600">
                                                        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} />{l}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="mt-4 h-[320px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={branchData} margin={{ top: 24, right: 8, left: 0, bottom: 8 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="sube" tick={<BranchTick />} height={48} interval={0} axisLine={false} tickLine={false} />
                                                    <YAxis tickFormatter={(v) => formatCurrencyShort(v)} tick={{ fontSize: 10.5, fill: "#cbd5e1", fontWeight: 600 }} axisLine={false} tickLine={false} width={56} />
                                                    <Tooltip
                                                        formatter={(value: any, name: any) => [formatCur(value), name]}
                                                        contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                                                    />
                                                    <Bar dataKey="gelir" name="Gelir" fill="#0ea5e9" radius={[6, 6, 0, 0]} maxBarSize={42}>
                                                        <LabelList dataKey="gelir" position="top" formatter={(v: any) => formatCurrencyShort(v)} style={{ fontSize: 10.5, fontWeight: 800, fill: "#0284c7" }} />
                                                    </Bar>
                                                    <Bar dataKey="giderPersonel" name="Personel" stackId="gider" fill="#f97316" maxBarSize={42} />
                                                    <Bar dataKey="giderGumruk" name="Gümrük" stackId="gider" fill="#7c3aed" maxBarSize={42} />
                                                    <Bar dataKey="giderArac" name="Araç" stackId="gider" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={42}>
                                                        <LabelList dataKey="giderArac" position="top" content={<GiderTotalLabel />} />
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* DONUT */}
                                    <div className="rounded-[16px] border bg-card p-5">
                                        <h3 className="text-[15px] font-extrabold">Gelir Dağılımı</h3>
                                        <p className="mt-1 text-xs text-muted-foreground">Şubelerin toplam cirodaki payı</p>
                                        <div className="relative mx-auto my-3.5 h-[180px] w-[180px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={donut} cx="50%" cy="50%" innerRadius={58} outerRadius={84} paddingAngle={2} dataKey="gelir" nameKey="sube" stroke="none">
                                                        {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                                                    </Pie>
                                                    <Tooltip formatter={(value: any) => formatCur(value)} contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px" }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Toplam Ciro</span>
                                                <span className="text-[20px] font-black tabular-nums">{formatCurrencyShort(branchTotals?.gelir || 0)}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2.5">
                                            {donut.map((d) => (
                                                <div key={d.sube} className="flex items-center gap-2.5">
                                                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px]" style={{ background: d.color }} />
                                                    <span className="flex-1 truncate text-[12.5px] font-semibold text-slate-700">{d.sube}</span>
                                                    <span className="text-[12.5px] font-extrabold tabular-nums">{d.pct}</span>
                                                </div>
                                            ))}
                                            {donut.length === 0 && <div className="py-4 text-center text-sm text-muted-foreground">Veri yok</div>}
                                        </div>
                                    </div>
                                </div>

                                {/* KÂRLILIK SIRALAMASI */}
                                <div className="rounded-[16px] border bg-card p-5">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <h3 className="text-[15px] font-extrabold">Şube Kârlılık Sıralaması</h3>
                                        <p className="text-xs text-muted-foreground">Net kâra göre sıralı · marj % ile</p>
                                    </div>
                                    <div className="mt-4 flex flex-col gap-3.5">
                                        {ranked.length === 0 && <div className="py-4 text-center text-sm text-muted-foreground">Veri yok</div>}
                                        {(() => {
                                            const maxKar = Math.max(...ranked.map((b) => b.kar || 0), 1);
                                            return ranked.map((b, i) => {
                                                const origIdx = branchData?.findIndex((x) => x.sube === b.sube) ?? i;
                                                const color = PALETTE[origIdx % PALETTE.length];
                                                const w = Math.max(0, ((b.kar || 0) / maxKar) * 100);
                                                return (
                                                    <div key={b.sube} className="flex items-center gap-3.5">
                                                        <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[7px] text-xs font-extrabold" style={{ background: RANK_BG[i] || "#f1f5f9", color: RANK_FG[i] || "#64748b" }}>{i + 1}</span>
                                                        <span className="w-[96px] flex-shrink-0 text-[13.5px] font-bold text-slate-800">{b.sube}</span>
                                                        <span className="relative h-6 flex-1 overflow-hidden rounded-[7px] bg-slate-100">
                                                            <span className="block h-full rounded-[7px]" style={{ width: `${w}%`, background: `linear-gradient(90deg, ${color}22, ${color})` }} />
                                                        </span>
                                                        <span className="w-[150px] flex-shrink-0 text-right text-[13.5px] font-extrabold tabular-nums">{formatCur(b.kar)}</span>
                                                        <span className="w-[64px] flex-shrink-0 rounded-md py-1 text-center text-[12px] font-extrabold tabular-nums" style={{ color, background: `${color}14` }}>{pct(b.marj)}</span>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>

                                {/* DETAY TABLOSU */}
                                <div className="overflow-hidden rounded-[16px] border bg-card">
                                    <div className="flex items-baseline justify-between border-b px-5 py-4">
                                        <h3 className="text-[15px] font-extrabold">Şube Bazlı Detay Tablosu</h3>
                                        <span className="text-xs text-muted-foreground">{periodLabel}</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Şube</TableHead>
                                                    <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Gelir</TableHead>
                                                    <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Personel</TableHead>
                                                    <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Gümrük</TableHead>
                                                    <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Araç</TableHead>
                                                    <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Toplam Gider</TableHead>
                                                    <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Net Kâr</TableHead>
                                                    <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Marj</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {branchData?.map((row, idx) => {
                                                    const marj = row.gelir ? (row.kar || 0) / row.gelir : 0;
                                                    const karColor = (row.kar || 0) >= 0 ? "#16a34a" : "#dc2626";
                                                    return (
                                                        <TableRow key={idx}>
                                                            <TableCell>
                                                                <span className="flex items-center gap-2.5">
                                                                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: PALETTE[idx % PALETTE.length] }} />
                                                                    <span className="text-[13px] font-bold text-slate-800">{row.sube}</span>
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="text-right font-semibold tabular-nums" style={{ color: "#0284c7" }}>{formatCur(row.gelir)}</TableCell>
                                                            <TableCell className="text-right tabular-nums text-slate-600">{formatCur(row.giderPersonel)}</TableCell>
                                                            <TableCell className="text-right tabular-nums text-slate-600">{formatCur(row.giderGumruk)}</TableCell>
                                                            <TableCell className="text-right tabular-nums text-slate-600">{formatCur(row.giderArac)}</TableCell>
                                                            <TableCell className="text-right tabular-nums text-slate-500">{formatCur(row.toplamGider)}</TableCell>
                                                            <TableCell className="text-right font-extrabold tabular-nums" style={{ color: karColor }}>{formatCur(row.kar)}</TableCell>
                                                            <TableCell className="text-right font-extrabold tabular-nums" style={{ color: karColor }}>{pct(marj)}</TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                            {branchTotals && (
                                                <TableFooter>
                                                    <TableRow className="bg-slate-50">
                                                        <TableCell className="font-black">TOPLAM</TableCell>
                                                        <TableCell className="text-right font-extrabold tabular-nums" style={{ color: "#0284c7" }}>{formatCur(branchTotals.gelir)}</TableCell>
                                                        <TableCell className="text-right font-bold tabular-nums text-slate-700">{formatCur(branchTotals.giderPersonel)}</TableCell>
                                                        <TableCell className="text-right font-bold tabular-nums text-slate-700">{formatCur(branchTotals.giderGumruk)}</TableCell>
                                                        <TableCell className="text-right font-bold tabular-nums text-slate-700">{formatCur(branchTotals.giderArac)}</TableCell>
                                                        <TableCell className="text-right font-extrabold tabular-nums text-slate-600">{formatCur(branchTotals.toplamGider)}</TableCell>
                                                        <TableCell className="text-right font-black tabular-nums" style={{ color: branchTotals.kar >= 0 ? "#16a34a" : "#dc2626" }}>{formatCur(branchTotals.kar)}</TableCell>
                                                        <TableCell className="text-right font-black tabular-nums" style={{ color: branchTotals.kar >= 0 ? "#16a34a" : "#dc2626" }}>{branchTotals.gelir ? pct(branchTotals.kar / branchTotals.gelir) : "—"}</TableCell>
                                                    </TableRow>
                                                </TableFooter>
                                            )}
                                        </Table>
                                    </div>
                                </div>
                            </>
                        )}
                    </TabsContent>

                    {/* ===================== ARAÇ GİDERLERİ ===================== */}
                    <TabsContent value="arac" className="mt-5">
                        <div className="rounded-[16px] border bg-card p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-[15px] font-extrabold">Plaka Bazlı Harcama Analizi</h3>
                                    <p className="mt-1 text-xs text-muted-foreground">Seçilen aracın yakıt, sigorta ve faturalı giderleri · KDV hariç</p>
                                </div>
                                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                                    <SelectTrigger className="h-[38px] w-[200px]"><SelectValue placeholder="Plaka Seçiniz" /></SelectTrigger>
                                    <SelectContent>
                                        {araclar?.map((a) => <SelectItem key={a.id} value={a.plaka}>{a.plaka}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            {!selectedVehicle ? (
                                <div className="my-2 mt-6 flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-20 text-muted-foreground">
                                    <Truck className="mb-2 h-12 w-12 opacity-20" />
                                    <p>Analiz için bir plaka seçiniz.</p>
                                </div>
                            ) : vehicleLoading ? (
                                <div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
                            ) : (
                                <div className="mt-5 space-y-5">
                                    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-4">
                                        {[
                                            { label: "Toplam Masraf", value: formatCur(vehicleToplam) },
                                            { label: "Yakıt", value: formatCur(vehicleTurToplam["Yakıt"] || 0) },
                                            { label: "Sigorta", value: formatCur((vehicleTurToplam["Trafik Sigortası"] || 0) + (vehicleTurToplam["Kasko"] || 0)) },
                                            { label: "Kayıt", value: `${vehicleExpenses?.length || 0} adet` },
                                        ].map((k) => (
                                            <div key={k.label} className="rounded-[13px] border border-sky-100 bg-sky-50 p-4 dark:border-sky-950/40 dark:bg-sky-950/20">
                                                <div className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "#0369a1" }}>{k.label}</div>
                                                <div className="mt-1.5 text-[22px] font-extrabold tabular-nums">{k.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Tür kırılımı: hangi kalem ne kadar tutuyor */}
                                    {vehicleTurListesi.length > 0 && (
                                        <div className="rounded-[13px] border bg-card p-4">
                                            <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Gider Türüne Göre</div>
                                            <div className="mt-3 flex flex-col gap-2">
                                                {vehicleTurListesi.map(([tur, tutar], i) => (
                                                    <div key={tur} className="flex items-center gap-3">
                                                        <span className="w-[130px] flex-shrink-0 text-[12.5px] font-semibold text-slate-700 dark:text-slate-300">{tur}</span>
                                                        <span className="relative h-5 flex-1 overflow-hidden rounded-[6px] bg-slate-100 dark:bg-slate-800">
                                                            <span className="block h-full rounded-[6px]" style={{ width: `${vehicleToplam ? (tutar / vehicleToplam) * 100 : 0}%`, background: PALETTE[i % PALETTE.length] }} />
                                                        </span>
                                                        <span className="w-[120px] flex-shrink-0 text-right text-[12.5px] font-extrabold tabular-nums">{formatCur(tutar)}</span>
                                                        <span className="w-[52px] flex-shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">{pct(vehicleToplam ? tutar / vehicleToplam : 0)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="overflow-hidden rounded-[13px] border">
                                        <div className="max-h-[440px] overflow-y-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Tarih</TableHead>
                                                    <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Tür</TableHead>
                                                    <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Açıklama</TableHead>
                                                    <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Kaynak</TableHead>
                                                    <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Tutar</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {vehicleExpenses?.map((v, i) => {
                                                    const isSigorta = v.tur === "Kasko" || v.tur === "Trafik Sigortası";
                                                    return (
                                                        <TableRow key={i}>
                                                            <TableCell className="whitespace-nowrap text-slate-600 tabular-nums">{formatTarihTR(v.tarih)}</TableCell>
                                                            <TableCell>
                                                                <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={isSigorta ? { background: "#ede9fe", color: "#6d28d9" } : { background: "#e0f2fe", color: "#0369a1" }}>
                                                                    {v.tur}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="max-w-[320px] truncate text-slate-700 dark:text-slate-300" title={v.aciklama}>{v.aciklama || "—"}</TableCell>
                                                            <TableCell className="text-[12px] text-muted-foreground">{v.kaynak}</TableCell>
                                                            <TableCell className="text-right font-extrabold tabular-nums">{formatCur(v.tutar)}</TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                                {vehicleExpenses?.length === 0 && (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Bu araca ait gider kaydı bulunamadı.</TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    {/* ===================== VADE TAKİP ===================== */}
                    <TabsContent value="vade" className="mt-5 space-y-4">
                        {remindersLoading ? (
                            <div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-sky-500" /></div>
                        ) : reminders?.length ? (
                            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
                                {reminders.map((rem, i) => {
                                    let kalan: number | null = null;
                                    try {
                                        const today = new Date(); today.setHours(0, 0, 0, 0);
                                        kalan = Math.ceil((parseISO(rem.tarih).getTime() - today.getTime()) / 86400000);
                                    } catch { /* tarih parse edilemezse kalan boş kalır */ }
                                    const crit = kalan !== null && kalan <= 30;
                                    const accent = crit ? "#e11d48" : "#d97706";
                                    const isKasko = String(rem.tip || "").toLocaleLowerCase("tr").includes("kasko");
                                    return (
                                        <div key={i} className="rounded-[13px] border bg-card p-4 transition-shadow hover:shadow-md" style={{ borderLeft: `4px solid ${accent}` }}>
                                            <div className="flex items-start justify-between">
                                                <span className="rounded-full px-2.5 py-1 text-[11px] font-extrabold" style={isKasko ? { background: "#ede9fe", color: "#6d28d9" } : { background: "#e0f2fe", color: "#0369a1" }}>{rem.tip}</span>
                                                {kalan !== null && <span className="text-[11px] font-extrabold tabular-nums" style={{ color: accent }}>{kalan} gün kaldı</span>}
                                            </div>
                                            <h4 className="mt-3 text-[14px] font-bold text-slate-800">{rem.baslik}</h4>
                                            <div className="mt-2 flex items-center gap-2 text-[18px] font-black tabular-nums" style={{ color: accent }}>
                                                <Calendar className="h-[17px] w-[17px]" />
                                                {format(parseISO(rem.tarih), "d MMM yyyy", { locale: tr })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 py-20 text-muted-foreground">
                                <Bell className="mb-2 h-12 w-12 text-emerald-400 opacity-60" />
                                <p className="font-bold text-emerald-700">Tüm poliçeler güncel!</p>
                                <p className="text-sm">Yaklaşan vadesi olan bir poliçe bulunamadı.</p>
                            </div>
                        )}

                        <div className="flex gap-3 rounded-[13px] border border-blue-200 bg-blue-50 p-4">
                            <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
                            <div className="text-[12.5px] leading-relaxed text-blue-900">
                                <strong className="mb-0.5 block font-extrabold">Uyarı Sistemi Hakkında</strong>
                                Sistem, bitiş tarihine <strong>60 günden az</strong> kalan tüm araç sigorta ve kasko poliçelerini otomatik olarak buraya getirir. Kırmızı renk vadenin kritik (≤30 gün), amber yaklaşan vadeyi gösterir.
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
