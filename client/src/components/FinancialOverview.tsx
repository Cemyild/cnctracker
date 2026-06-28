import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ComposedChart,
    Line,
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

            {/* VAT Detailed Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>KDV Dengesi (Hesaplanan vs İndirilecek)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                                <XAxis dataKey="name" className="text-xs" tickLine={false} axisLine={false} />
                                <YAxis className="text-xs" tickFormatter={formatCurrencyShort} tickLine={false} axisLine={false} />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    formatter={(value: number) => formatCurrencyFull(value)}
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                                />
                                <Legend />
                                <Bar dataKey="kdvOdenecek" name="Hesaplanan KDV (Satış)" fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                <Bar dataKey="kdvIndirilecek" name="İndirilecek KDV (Gider)" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={50} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
