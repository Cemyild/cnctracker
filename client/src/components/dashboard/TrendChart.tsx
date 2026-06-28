import {
    Bar,
    CartesianGrid,
    ComposedChart,
    LabelList,
    Line,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface TrendDatum {
    ay: string;
    gelir: number;
    gider: number;
    prevGelir: number; // geçen yıl aynı ay gelir
}

interface TrendChartProps {
    data: TrendDatum[];
    target: number; // aylık hedef (TL) — kesikli mor çizgi
    title?: string;
    description?: string;
}

const AY_DISPLAY: Record<string, string> = {
    ocak: "Oca", subat: "Şub", mart: "Mar", nisan: "Nis", mayis: "May", haziran: "Haz",
    temmuz: "Tem", agustos: "Ağu", eylul: "Eyl", ekim: "Eki", kasim: "Kas", aralik: "Ara",
};

// Renkler design tokens'tan birebir (tema HSL'lerine göre kaymasın diye literal hex)
const C = {
    gelir: "#059669",
    gider: "#e11d48",
    prev: "#64748b",
    target: "#7c3aed",
};

const milyon = (v: number) => (v / 1_000_000).toFixed(1).replace(".", ",");
const yTick = (v: number) => `₺${(v / 1_000_000).toFixed(0)}M`;

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
    return (
        <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            {dashed ? (
                <span className="inline-block w-3.5 border-t-2 border-dashed" style={{ borderColor: color }} />
            ) : (
                <span className="inline-block h-[11px] w-[11px] rounded-[3px]" style={{ backgroundColor: color }} />
            )}
            {label}
        </span>
    );
}

// Bar üstü ₺M etiketi — yalnızca anlamlı değerlerde
function BarValueLabel(fill: string) {
    return (props: any) => {
        const { x, y, width, value } = props;
        if (!value || value < 1) return null;
        return (
            <text
                x={x + width / 2}
                y={y - 4}
                textAnchor="middle"
                fill={fill}
                fontSize={10.5}
                fontWeight={700}
                className="tabular-nums"
            >
                {milyon(value)}
            </text>
        );
    };
}

export function TrendChart({ data, target, title = "Gelir & Gider — Aylık Trend", description }: TrendChartProps) {
    const chartData = data.map((d) => ({ ...d, ayLabel: AY_DISPLAY[d.ay] ?? d.ay }));

    return (
        <Card className="border-border/70 bg-card">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h3 className="text-[15px] font-bold tracking-tight text-foreground">{title}</h3>
                    {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-4">
                    <LegendItem color={C.gelir} label="Gelir" />
                    <LegendItem color={C.gider} label="Gider" />
                    <LegendItem color={C.prev} label="Geçen yıl gelir" dashed />
                    <LegendItem color={C.target} label="Aylık hedef" dashed />
                </div>
            </CardHeader>
            <CardContent>
                <div className="h-[340px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 24, right: 12, bottom: 4, left: 4 }} barGap={3}>
                            <CartesianGrid strokeDasharray="0" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                            <XAxis
                                dataKey="ayLabel"
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={11.5}
                                tickLine={false}
                                axisLine={false}
                                dy={4}
                            />
                            <YAxis
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={yTick}
                                width={48}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "hsl(var(--card))",
                                    borderColor: "hsl(var(--border))",
                                    borderRadius: "8px",
                                    fontSize: "12px",
                                    color: "hsl(var(--foreground))",
                                }}
                                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                                cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }}
                                formatter={(value: number, name: string) => [formatCurrency(value), name]}
                            />
                            <ReferenceLine
                                y={target}
                                stroke={C.target}
                                strokeWidth={1.5}
                                strokeDasharray="6 5"
                                strokeOpacity={0.7}
                                ifOverflow="extendDomain"
                            />
                            <Bar dataKey="gelir" name="Gelir" fill={C.gelir} radius={[3, 3, 0, 0]} maxBarSize={18}>
                                <LabelList dataKey="gelir" content={BarValueLabel("#047857")} />
                            </Bar>
                            <Bar dataKey="gider" name="Gider" fill={C.gider} radius={[3, 3, 0, 0]} maxBarSize={18}>
                                <LabelList dataKey="gider" content={BarValueLabel("#be123c")} />
                            </Bar>
                            <Line
                                type="monotone"
                                dataKey="prevGelir"
                                name="Geçen yıl gelir"
                                stroke={C.prev}
                                strokeWidth={2}
                                strokeDasharray="5 4"
                                dot={{ r: 2.6, fill: "hsl(var(--card))", stroke: C.prev, strokeWidth: 1.5 }}
                                activeDot={{ r: 3.5 }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
