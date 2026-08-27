import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ComposedChart,
    Line,
    Area,
    PieChart,
    Pie,
    Cell,
    Legend
} from "recharts";
import { formatCurrencyFull, formatCurrencyShort } from "@/lib/utils";

type OzetRow = {
    ay: string;
    satisKdvHaric: number;
    satisKdv: number;
    giderKdvHaric: number;
    giderKdv: number;
    calisanMaliyet: number;
    yonetimNetUcret?: number;
};

type FinancialOverviewProps = {
    data: OzetRow[];
    /** Geçen yıl ozet-summary — KPI YoY delta'ları için (opsiyonel) */
    prevData?: OzetRow[];
    year: string;
    selectedMonth?: string;
};

// Tek yıl için KPI agregatları — Gümrük Özet (kanonik) mantığı, KDV hariç.
function computeStats(rows: OzetRow[], excludeManagement: boolean) {
    const totalRevenue = rows.reduce((sum, item) => sum + item.satisKdvHaric, 0);
    const totalExpenses = rows.reduce((sum, item) => sum + item.giderKdvHaric, 0);
    let totalLabor = rows.reduce((sum, item) => sum + item.calisanMaliyet, 0);
    if (excludeManagement) {
        // Yalnız yönetimin NET ücreti düşülür; SGK/vergi maliyet olarak kalır.
        totalLabor -= rows.reduce((sum, item) => sum + (item.yonetimNetUcret || 0), 0);
    }
    const totalCosts = totalExpenses + totalLabor;
    const netProfit = totalRevenue - totalCosts;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const salesVAT = rows.reduce((sum, item) => sum + item.satisKdv, 0);
    const purchaseVAT = rows.reduce((sum, item) => sum + item.giderKdv, 0);
    const netVAT = salesVAT - purchaseVAT;
    return { totalRevenue, totalExpenses, totalLabor, totalCosts, netProfit, profitMargin, salesVAT, purchaseVAT, netVAT };
}

function pctDelta(curr: number, prev: number): number | null {
    if (!prev) return null;
    return ((curr - prev) / Math.abs(prev)) * 100;
}

const AY_SIRASI = ["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"];

// Personel maliyeti — yönetim hariç tutma seçeneğiyle
function laborOf(row: OzetRow, excludeManagement: boolean) {
    return row.calisanMaliyet - (excludeManagement ? (row.yonetimNetUcret || 0) : 0);
}

// Henüz veri girilmemiş ay: kümülatif çizgi buradan itibaren kesilmeli,
// aksi halde grafik "kâr durdu" gibi yanıltıcı bir düz çizgi çizer.
function isEmptyMonth(row?: OzetRow): boolean {
    if (!row) return true;
    return row.satisKdvHaric === 0 && row.giderKdvHaric === 0 && row.calisanMaliyet === 0;
}

function fmtPct(value: number, digits = 1) {
    return `%${value.toFixed(digits).replace(".", ",")}`;
}

// Accent-bar KPI kartı — Dashboard görsel sistemiyle aynı
function KpiCard({
    label,
    value,
    accent,
    valueColor,
    deltaPct,
    deltaSub,
    invert = false,
    neutralDelta,
}: {
    label: string;
    value: string;
    accent: string;
    valueColor?: string;
    deltaPct?: number | null;
    deltaSub?: string;
    invert?: boolean;
    neutralDelta?: string;
}) {
    const hasPct = typeof deltaPct === "number" && Number.isFinite(deltaPct);
    const positive = hasPct && (deltaPct as number) >= 0;
    const good = invert ? !positive : positive;
    const deltaColor = neutralDelta ? "#64748b" : !hasPct ? "#94a3b8" : good ? "#059669" : "#e11d48";
    const icon = neutralDelta || !hasPct ? "" : positive ? "▲" : "▼";
    const deltaText = neutralDelta
        ?? (hasPct ? `${positive ? "+" : ""}${(deltaPct as number).toFixed(1).replace(".", ",")}%` : "geçen yıl yok");
    return (
        <div className="relative overflow-hidden rounded-[14px] border border-border/70 bg-card p-5">
            <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: accent }} aria-hidden="true" />
            <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                <span className="text-sm" style={{ color: accent }}>▮</span>
            </div>
            <p className="mt-2.5 text-[27px] font-extrabold leading-none tracking-tight tabular-nums" style={valueColor ? { color: valueColor } : undefined}>
                {value}
            </p>
            <p className="mt-2.5 text-[11px] font-semibold tabular-nums" style={{ color: deltaColor }}>
                {icon} {deltaText} {deltaSub && <span className="font-normal text-muted-foreground">{deltaSub}</span>}
            </p>
        </div>
    );
}

export function FinancialOverview({ data, prevData, year, selectedMonth }: FinancialOverviewProps) {
    const [excludeManagement, setExcludeManagement] = useState(false);

    const stats = useMemo(() => {
        const activeData = selectedMonth ? data.filter(d => d.ay === selectedMonth) : data;
        const base = computeStats(activeData, excludeManagement);
        const costDistribution = [
            { name: "Mal/Hizmet Gideri", value: base.totalExpenses, color: "#e11d48" }, // rose
            { name: "Personel Maliyeti", value: base.totalLabor, color: "#7c3aed" }, // violet
            { name: "Net Kâr", value: Math.max(0, base.netProfit), color: "#059669" }, // emerald
        ].filter(item => item.value > 0);
        return { ...base, costDistribution };
    }, [data, selectedMonth, excludeManagement]);

    // YoY — geçen yılı cari ay filtresiyle HİZALA (ay seçiliyse o ay vs geçen yılın aynı ayı; değilse yıl vs yıl)
    const prevStats = useMemo(() => {
        if (!prevData || prevData.length === 0) return null;
        const prevActive = selectedMonth ? prevData.filter(d => d.ay === selectedMonth) : prevData;
        if (prevActive.length === 0) return null;
        return computeStats(prevActive, excludeManagement);
    }, [prevData, selectedMonth, excludeManagement]);

    const monthLabels = {
        "ocak": "Oca", "subat": "Şub", "mart": "Mar", "nisan": "Nis",
        "mayis": "May", "haziran": "Haz", "temmuz": "Tem", "agustos": "Ağu",
        "eylul": "Eyl", "ekim": "Eki", "kasim": "Kas", "aralik": "Ara"
    };

    const chartData = useMemo(() => {
        return data.map(item => {
            let itemLabor = item.calisanMaliyet;
            if (excludeManagement) {
                itemLabor -= (item.yonetimNetUcret || 0);
            }
            
            return {
                name: monthLabels[item.ay as keyof typeof monthLabels] || item.ay,
                gelir: item.satisKdvHaric,
                gider: item.giderKdvHaric + itemLabor,
                kar: item.satisKdvHaric - (item.giderKdvHaric + itemLabor),
                kdvOdenecek: item.satisKdv,
                kdvIndirilecek: item.giderKdv
            };
        });
    }, [data, excludeManagement]);

    // ── 1) Kümülatif Kâr Yolculuğu — bu yıl vs geçen yıl ───────────────────────
    // prevData zaten KPI delta'ları için geliyordu; burada görselleştiriliyor.
    const cumulative = useMemo(() => {
        const prevMap = new Map((prevData || []).map(r => [r.ay, r]));
        const curMap = new Map(data.map(r => [r.ay, r]));
        let curSum = 0;
        let prevSum = 0;
        let lastFilled = -1;

        const rows = AY_SIRASI.map((ay, i) => {
            const c = curMap.get(ay);
            const p = prevMap.get(ay);

            let buYil: number | null = null;
            if (c && !isEmptyMonth(c)) {
                curSum += c.satisKdvHaric - (c.giderKdvHaric + laborOf(c, excludeManagement));
                buYil = curSum;
                lastFilled = i;
            }

            let gecenYil: number | null = null;
            if (p && !isEmptyMonth(p)) {
                prevSum += p.satisKdvHaric - (p.giderKdvHaric + laborOf(p, excludeManagement));
                gecenYil = prevSum;
            }

            return { name: monthLabels[ay as keyof typeof monthLabels], buYil, gecenYil };
        });

        // Rozet: son veri girilen ayın kümülatifi vs geçen yılın AYNI ayının kümülatifi
        const son = lastFilled >= 0 ? rows[lastFilled] : null;
        const karsilastirma =
            son && son.buYil !== null && son.gecenYil !== null && son.gecenYil !== 0
                ? { ay: son.name, bu: son.buYil, gecen: son.gecenYil, fark: pctDelta(son.buYil, son.gecenYil) }
                : null;

        return { rows, karsilastirma, hasPrev: rows.some(r => r.gecenYil !== null) };
    }, [data, prevData, excludeManagement]);

    // ── 2) Maliyet Yapısı Trendi — %100 yığılmış + kâr marjı ──────────────────
    const structure = useMemo(() => {
        return data
            .filter(r => !isEmptyMonth(r))
            .map(r => {
                const labor = laborOf(r, excludeManagement);
                const ciro = r.satisKdvHaric;
                const gider = r.giderKdvHaric;
                const kar = ciro - gider - labor;
                // Zarar eden ayda maliyet ciroyu aşar; payda maliyet olur, yığın %100'ü aşmaz.
                const payda = Math.max(ciro, gider + labor) || 1;
                return {
                    name: monthLabels[r.ay as keyof typeof monthLabels] || r.ay,
                    giderPct: (gider / payda) * 100,
                    personelPct: (labor / payda) * 100,
                    karPct: (Math.max(0, kar) / payda) * 100,
                    marj: ciro > 0 ? (kar / ciro) * 100 : 0,
                    giderTl: gider,
                    personelTl: labor,
                    karTl: kar,
                };
            });
    }, [data, excludeManagement]);

    // ── 3) Başabaş (Break-even) Analizi ───────────────────────────────────────
    const breakEven = useMemo(() => {
        const rows = data
            .filter(r => !isEmptyMonth(r))
            .map(r => {
                const labor = laborOf(r, excludeManagement);
                const maliyet = r.giderKdvHaric + labor;
                const ciro = r.satisKdvHaric;
                return {
                    name: monthLabels[r.ay as keyof typeof monthLabels] || r.ay,
                    ciro,
                    maliyet,
                    karli: ciro >= maliyet,
                    guvenlikPct: maliyet > 0 ? ((ciro - maliyet) / maliyet) * 100 : 0,
                };
            });
        const zararAySayisi = rows.filter(r => !r.karli).length;
        const ortMaliyet = rows.length ? rows.reduce((s, r) => s + r.maliyet, 0) / rows.length : 0;
        const ortGuvenlik = rows.length ? rows.reduce((s, r) => s + r.guvenlikPct, 0) / rows.length : 0;
        return { rows, zararAySayisi, ortMaliyet, ortGuvenlik };
    }, [data, excludeManagement]);

    return (
        <div className="space-y-6 mb-8">
            <div className="flex justify-end items-center space-x-2">
                <Checkbox 
                    id="excludeManagement" 
                    checked={excludeManagement}
                    onCheckedChange={(checked) => setExcludeManagement(checked as boolean)}
                />
                <Label 
                    htmlFor="excludeManagement" 
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                    Yönetim Maaşlarını Hariç Tut (Net Ücret)
                </Label>
            </div>

            {/* Top Level Key Metrics — accent bar + YoY delta (Dashboard ile aynı sistem) */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                    label={selectedMonth ? `${monthLabels[selectedMonth as keyof typeof monthLabels] || selectedMonth} Net Kâr / Zarar` : "Yıllık Net Kâr / Zarar"}
                    value={formatCurrencyFull(stats.netProfit)}
                    valueColor={stats.netProfit >= 0 ? "#047857" : "#e11d48"}
                    accent={stats.netProfit >= 0 ? "#059669" : "#e11d48"}
                    deltaPct={prevStats ? pctDelta(stats.netProfit, prevStats.netProfit) : null}
                    deltaSub={`· %${stats.profitMargin.toFixed(1).replace(".", ",")} marj`}
                />
                <KpiCard
                    label={selectedMonth ? "Aylık Ciro" : "Toplam Ciro"}
                    value={formatCurrencyFull(stats.totalRevenue)}
                    accent="#0ea5e9"
                    deltaPct={prevStats ? pctDelta(stats.totalRevenue, prevStats.totalRevenue) : null}
                    deltaSub="· KDV hariç"
                />
                <KpiCard
                    label={selectedMonth ? "Aylık Maliyet" : "Toplam Maliyet"}
                    value={formatCurrencyFull(stats.totalCosts)}
                    accent="#d97706"
                    deltaPct={prevStats ? pctDelta(stats.totalCosts, prevStats.totalCosts) : null}
                    deltaSub="· personel + gider"
                    invert
                />
                <KpiCard
                    label={selectedMonth ? "Aylık KDV Durumu" : "KDV Durumu"}
                    value={formatCurrencyFull(stats.netVAT)}
                    accent="#7c3aed"
                    neutralDelta={stats.netVAT >= 0 ? "Ödenecek KDV" : "Devreden KDV"}
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Profitability Trend */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Karlılık Analizi ({year})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        className="text-xs"
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        className="text-xs"
                                        tickFormatter={(value) => formatCurrencyShort(value)}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        formatter={(value: number) => formatCurrencyFull(value)}
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                                    />
                                    <Legend />
                                    <Bar dataKey="gelir" name="Gelir" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    <Bar dataKey="gider" name="Gider" fill="#e11d48" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    <Line type="monotone" dataKey="kar" name="Net Kâr" stroke="#0284c7" strokeWidth={3} dot={{ r: 4 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Cost Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle>Gelir - Gider Dağılımı</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px] relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.costDistribution}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {stats.costDistribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: number) => formatCurrencyFull(value)}
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                                    />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>

                            {/* Centered Profit Margin Info */}
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[60%] text-center pointer-events-none">
                                <div className="text-xs font-medium text-muted-foreground">
                                    Kar Marjı
                                </div>
                                <div className="text-2xl font-extrabold tabular-nums" style={{ color: "#059669" }}>
                                    %{stats.profitMargin.toFixed(1).replace(".", ",")}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ── SEÇENEK 1 — Kümülatif Kâr Yolculuğu (bu yıl vs geçen yıl) ──────── */}
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Seçenek 1</p>
                            <CardTitle>Kümülatif Kâr Yolculuğu ({year} vs {Number(year) - 1})</CardTitle>
                        </div>
                        {cumulative.karsilastirma && typeof cumulative.karsilastirma.fark === "number" && (
                            <div
                                className="rounded-full px-3 py-1.5 text-[12px] font-bold tabular-nums"
                                style={{
                                    background: cumulative.karsilastirma.fark >= 0 ? "rgba(5,150,105,0.12)" : "rgba(225,29,72,0.12)",
                                    color: cumulative.karsilastirma.fark >= 0 ? "#047857" : "#e11d48",
                                }}
                            >
                                {cumulative.karsilastirma.fark >= 0 ? "▲" : "▼"} {cumulative.karsilastirma.ay} sonu itibarıyla geçen yılın{" "}
                                {fmtPct(Math.abs(cumulative.karsilastirma.fark))} {cumulative.karsilastirma.fark >= 0 ? "önünde" : "gerisinde"}
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={cumulative.rows} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                                <defs>
                                    <linearGradient id="kumulatifKar" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                                        <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                                <XAxis dataKey="name" className="text-xs" tickLine={false} axisLine={false} />
                                <YAxis className="text-xs" tickFormatter={formatCurrencyShort} tickLine={false} axisLine={false} />
                                <Tooltip
                                    formatter={(value: number) => formatCurrencyFull(value)}
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                                />
                                <Legend />
                                <Area
                                    type="monotone"
                                    dataKey="buYil"
                                    name={`${year} Kümülatif`}
                                    stroke="#059669"
                                    strokeWidth={3}
                                    fill="url(#kumulatifKar)"
                                    dot={{ r: 3, fill: "#059669" }}
                                    connectNulls={false}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="gecenYil"
                                    name={`${Number(year) - 1} Kümülatif`}
                                    stroke="#94a3b8"
                                    strokeWidth={2}
                                    strokeDasharray="6 4"
                                    dot={false}
                                    connectNulls={false}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                    {!cumulative.hasPrev && (
                        <p className="mt-2 text-[12px] text-muted-foreground">
                            {Number(year) - 1} yılına ait veri bulunmadığı için karşılaştırma çizgisi çizilemedi.
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* ── SEÇENEK 2 — Maliyet Yapısı Trendi ──────────────────────────────── */}
            <Card>
                <CardHeader>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Seçenek 2</p>
                    <CardTitle>Maliyet Yapısı Trendi &amp; Kâr Marjı</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={structure} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                                <XAxis dataKey="name" className="text-xs" tickLine={false} axisLine={false} />
                                <YAxis
                                    yAxisId="pay"
                                    className="text-xs"
                                    domain={[0, 100]}
                                    tickFormatter={(v: number) => `%${v}`}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    yAxisId="marj"
                                    orientation="right"
                                    className="text-xs"
                                    tickFormatter={(v: number) => `%${v.toFixed(0)}`}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                                    formatter={(value: number, name: string, item: any) => {
                                        const p = item?.payload || {};
                                        if (name === "Kâr Marjı") return [fmtPct(value), name];
                                        const tl =
                                            name === "Mal/Hizmet Gideri" ? p.giderTl :
                                            name === "Personel Maliyeti" ? p.personelTl : p.karTl;
                                        return [`${fmtPct(value)} · ${formatCurrencyFull(tl || 0)}`, name];
                                    }}
                                />
                                <Legend />
                                <Bar yAxisId="pay" dataKey="giderPct" name="Mal/Hizmet Gideri" stackId="yapi" fill="#e11d48" maxBarSize={44} />
                                <Bar yAxisId="pay" dataKey="personelPct" name="Personel Maliyeti" stackId="yapi" fill="#7c3aed" maxBarSize={44} />
                                <Bar yAxisId="pay" dataKey="karPct" name="Net Kâr" stackId="yapi" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={44} />
                                <Line yAxisId="marj" type="monotone" dataKey="marj" name="Kâr Marjı" stroke="#0284c7" strokeWidth={3} dot={{ r: 4 }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="mt-2 text-[12px] text-muted-foreground">
                        Barlar her ayın cirosunun nasıl dağıldığını gösterir; çizgi (sağ eksen) o ayın net kâr marjıdır.
                        Zarar edilen ayda maliyet %100'ü doldurur ve marj çizgisi eksiye düşer.
                    </p>
                </CardContent>
            </Card>

            {/* ── SEÇENEK 3 — Başabaş (Break-even) Analizi ───────────────────────── */}
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Seçenek 3</p>
                            <CardTitle>Başabaş Analizi — Ciro vs Maliyet Eşiği</CardTitle>
                        </div>
                        <div className="flex items-center gap-4 text-[12px] font-semibold tabular-nums">
                            <span className="text-muted-foreground">
                                Ort. başabaş cirosu: <span className="text-foreground">{formatCurrencyFull(breakEven.ortMaliyet)}</span>
                            </span>
                            <span style={{ color: breakEven.ortGuvenlik >= 0 ? "#047857" : "#e11d48" }}>
                                Ort. güvenlik payı: {fmtPct(breakEven.ortGuvenlik)}
                            </span>
                            {breakEven.zararAySayisi > 0 && (
                                <span className="rounded-full px-2.5 py-1" style={{ background: "rgba(225,29,72,0.12)", color: "#e11d48" }}>
                                    {breakEven.zararAySayisi} zarar ayı
                                </span>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={breakEven.rows} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                                <XAxis dataKey="name" className="text-xs" tickLine={false} axisLine={false} />
                                <YAxis className="text-xs" tickFormatter={formatCurrencyShort} tickLine={false} axisLine={false} />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                                    formatter={(value: number, name: string, item: any) => {
                                        if (name === "Ciro") {
                                            const g = item?.payload?.guvenlikPct ?? 0;
                                            return [`${formatCurrencyFull(value)} · güvenlik payı ${fmtPct(g)}`, name];
                                        }
                                        return [formatCurrencyFull(value), name];
                                    }}
                                />
                                <Legend />
                                <Bar dataKey="ciro" name="Ciro" radius={[4, 4, 0, 0]} maxBarSize={46}>
                                    {breakEven.rows.map((row, i) => (
                                        <Cell key={`be-${i}`} fill={row.karli ? "#059669" : "#e11d48"} />
                                    ))}
                                </Bar>
                                <Line
                                    type="stepAfter"
                                    dataKey="maliyet"
                                    name="Maliyet Eşiği (gider + personel)"
                                    stroke="#d97706"
                                    strokeWidth={3}
                                    strokeDasharray="5 3"
                                    dot={false}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="mt-2 text-[12px] text-muted-foreground">
                        Barın turuncu eşiği aştığı kadarı o ayın güvenlik payıdır. Eşiğin altında kalan aylar kırmızı gösterilir.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
