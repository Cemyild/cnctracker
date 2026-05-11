import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency, formatCurrencyShort } from "@/lib/utils";

interface TrendChartProps {
    data: Array<{
        ay: string;
        satisToplam: number;
        giderToplam: number; // gider + personel maliyeti birleştirilmiş geliyor
    }>;
    title?: string;
    description?: string;
}

const AY_DISPLAY: Record<string, string> = {
    ocak: "Oca", subat: "Şub", mart: "Mar", nisan: "Nis", mayis: "May", haziran: "Haz",
    temmuz: "Tem", agustos: "Ağu", eylul: "Eyl", ekim: "Eki", kasim: "Kas", aralik: "Ara",
};

export function TrendChart({ data, title = "Gelir & Gider — Aylık Trend", description }: TrendChartProps) {
    return (
        <Card className="border-border/70 bg-card">
            <CardHeader>
                <CardTitle className="text-base font-semibold">{title}</CardTitle>
                {description && <CardDescription className="text-xs">{description}</CardDescription>}
            </CardHeader>
            <CardContent>
                <div className="h-[320px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                            <defs>
                                <linearGradient id="trendRevenue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="hsl(160 84% 39%)" stopOpacity={0.35} />
                                    <stop offset="100%" stopColor="hsl(160 84% 39%)" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="trendExpense" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="hsl(0 84% 60%)" stopOpacity={0.28} />
                                    <stop offset="100%" stopColor="hsl(0 84% 60%)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis
                                dataKey="ay"
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => AY_DISPLAY[value] ?? value}
                            />
                            <YAxis
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => formatCurrencyShort(value)}
                                width={70}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "hsl(var(--card))",
                                    borderColor: "hsl(var(--border))",
                                    borderRadius: "8px",
                                    fontSize: "12px",
                                    color: "hsl(var(--foreground))",
                                }}
                                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600, textTransform: "capitalize" }}
                                itemStyle={{ color: "hsl(var(--foreground))" }}
                                cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                                formatter={(value: number) => formatCurrency(value)}
                                labelFormatter={(label: string) => label.charAt(0).toUpperCase() + label.slice(1)}
                            />
                            <Legend
                                wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                                iconType="circle"
                                iconSize={8}
                            />
                            <Area
                                type="monotone"
                                dataKey="satisToplam"
                                name="Gelir"
                                stroke="hsl(160 84% 39%)"
                                strokeWidth={2}
                                fill="url(#trendRevenue)"
                            />
                            <Area
                                type="monotone"
                                dataKey="giderToplam"
                                name="Gider (genel + personel)"
                                stroke="hsl(0 84% 60%)"
                                strokeWidth={2}
                                fill="url(#trendExpense)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
