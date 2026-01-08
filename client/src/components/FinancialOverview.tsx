import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    TrendingUp,
    TrendingDown,
    Wallet,
    Banknote,
    Scale
} from "lucide-react";
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
import { formatCurrency, formatCurrencyShort } from "@/lib/utils";

type FinancialOverviewProps = {
    data: {
        ay: string;
        satisKdvHaric: number;
        satisKdv: number;
        giderKdvHaric: number;
        giderKdv: number;
        calisanMaliyet: number;
    }[];
    year: string;
    selectedMonth?: string;
};

export function FinancialOverview({ data, year, selectedMonth }: FinancialOverviewProps) {
    const stats = useMemo(() => {
        // Filter data if a month is selected
        const activeData = selectedMonth
            ? data.filter(d => d.ay === selectedMonth)
            : data;

        const totalRevenue = activeData.reduce((sum, item) => sum + item.satisKdvHaric, 0);
        const totalExpenses = activeData.reduce((sum, item) => sum + item.giderKdvHaric, 0);
        const totalLabor = activeData.reduce((sum, item) => sum + item.calisanMaliyet, 0);

        // Total Costs (Expenses + Labor)
        const totalCosts = totalExpenses + totalLabor;

        // Net Profit (Revenue - Costs)
        const netProfit = totalRevenue - totalCosts;

        // Profit Margin
        const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

        // VAT Data
        const salesVAT = activeData.reduce((sum, item) => sum + item.satisKdv, 0);
        const purchaseVAT = activeData.reduce((sum, item) => sum + item.giderKdv, 0);
        const netVAT = salesVAT - purchaseVAT;

        // Distribution for Donut Chart (Always positive for pie chart)
        const costDistribution = [
            { name: "Mal/Hizmet Giderleri", value: totalExpenses, color: "#ef4444" }, // Red-500
            { name: "Personel Maliyeti", value: totalLabor, color: "#f97316" }, // Orange-500
            { name: "Net Kar", value: Math.max(0, netProfit), color: "#10b981" }, // Emerald-500
        ].filter(item => item.value > 0);

        return {
            totalRevenue,
            totalCosts,
            netProfit,
            profitMargin,
            salesVAT,
            purchaseVAT,
            netVAT,
            costDistribution
        };
    }, [data, selectedMonth]);

    const monthLabels = {
        "ocak": "Oca", "subat": "Şub", "mart": "Mar", "nisan": "Nis",
        "mayis": "May", "haziran": "Haz", "temmuz": "Tem", "agustos": "Ağu",
        "eylul": "Eyl", "ekim": "Eki", "kasim": "Kas", "aralik": "Ara"
    };

    const chartData = useMemo(() => {
        return data.map(item => ({
            name: monthLabels[item.ay as keyof typeof monthLabels] || item.ay,
            gelir: item.satisKdvHaric,
            gider: item.giderKdvHaric + item.calisanMaliyet,
            kar: item.satisKdvHaric - (item.giderKdvHaric + item.calisanMaliyet),
            kdvOdenecek: item.satisKdv,
            kdvIndirilecek: item.giderKdv
        }));
    }, [data]);

    return (
        <div className="space-y-6 mb-8">
            {/* Top Level Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Net Profit Card */}
                <Card className={stats.netProfit >= 0 ? "border-l-4 border-l-emerald-500" : "border-l-4 border-l-red-500"}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            {selectedMonth ? `${monthLabels[selectedMonth as keyof typeof monthLabels] || selectedMonth} Net Kar / Zarar` : "Yıllık Net Kar / Zarar"}
                        </CardTitle>
                        {stats.netProfit >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${stats.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {formatCurrency(stats.netProfit)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            %{(stats.profitMargin).toFixed(1)} Kar Marjı
                        </p>
                    </CardContent>
                </Card>

                {/* Total Revenue */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            {selectedMonth ? "Aylık Ciro" : "Toplam Ciro"}
                        </CardTitle>
                        <Wallet className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            KDV Hariç
                        </p>
                    </CardContent>
                </Card>

                {/* Total Costs */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            {selectedMonth ? "Aylık Maliyet" : "Toplam Maliyet"}
                        </CardTitle>
                        <Scale className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(stats.totalCosts)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Personel + Giderler
                        </p>
                    </CardContent>
                </Card>

                {/* VAT Position */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            {selectedMonth ? "Aylık KDV Durumu" : "KDV Durumu"}
                        </CardTitle>
                        <Banknote className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(stats.netVAT)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {stats.netVAT > 0 ? "Ödenecek KDV" : "Devreden KDV"}
                        </p>
                    </CardContent>
                </Card>
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
                                        formatter={(value: number) => formatCurrency(value)}
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                                    />
                                    <Legend />
                                    <Bar dataKey="gelir" name="Gelir" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    <Bar dataKey="gider" name="Gider" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    <Line type="monotone" dataKey="kar" name="Net Kar" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
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
                                        formatter={(value: number) => formatCurrency(value)}
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
                                <div className={`text-xl font-bold ${stats.profitMargin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                    %{stats.profitMargin.toFixed(1)}
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
                                    formatter={(value: number) => formatCurrency(value)}
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                                />
                                <Legend />
                                <Bar dataKey="kdvOdenecek" name="Hesaplanan KDV (Satış)" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                <Bar dataKey="kdvIndirilecek" name="İndirilecek KDV (Gider)" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={50} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
