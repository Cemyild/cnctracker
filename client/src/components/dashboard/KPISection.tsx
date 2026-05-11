import { TrendingUp, TrendingDown, Minus, DollarSign, Wallet, ArrowDownToLine, Percent } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatCurrencyShort, cn } from "@/lib/utils";

interface KPISectionProps {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
    // Önceki yıl karşılaştırması — sadece yıl-üstü trend gösterimi için
    previousYear?: {
        totalRevenue: number;
        totalExpenses: number;
        netProfit: number;
        profitMargin: number;
    } | null;
    selectedYear: number;
    isLoading?: boolean;
}

function pctDelta(curr: number, prev: number): number | null {
    if (prev === 0) return null;
    return ((curr - prev) / Math.abs(prev)) * 100;
}

function TrendBadge({ delta, invertColor = false }: { delta: number | null; invertColor?: boolean }) {
    if (delta === null) {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Minus className="h-3 w-3" /> önceki yıl yok
            </span>
        );
    }
    const positive = delta >= 0;
    const goodWhenPositive = !invertColor;
    const isGood = (positive && goodWhenPositive) || (!positive && !goodWhenPositive);
    const colorClass = isGood ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
    const Icon = positive ? TrendingUp : TrendingDown;
    return (
        <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium tabular-nums", colorClass)}>
            <Icon className="h-3 w-3" />
            {positive ? "+" : ""}{delta.toFixed(1)}%
            <span className="font-normal text-muted-foreground">geçen yıla göre</span>
        </span>
    );
}

interface KPIItem {
    label: string;
    value: string;
    delta: number | null;
    invertColor?: boolean;
    icon: typeof DollarSign;
    accent: string;
}

export function KPISection({
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin,
    previousYear,
    selectedYear,
    isLoading,
}: KPISectionProps) {
    const items: KPIItem[] = [
        {
            label: "Toplam Gelir",
            value: formatCurrency(totalRevenue),
            delta: previousYear ? pctDelta(totalRevenue, previousYear.totalRevenue) : null,
            icon: DollarSign,
            accent: "text-emerald-600 dark:text-emerald-400",
        },
        {
            label: "Toplam Gider",
            value: formatCurrency(totalExpenses),
            delta: previousYear ? pctDelta(totalExpenses, previousYear.totalExpenses) : null,
            invertColor: true, // gider artması iyi değil
            icon: Wallet,
            accent: "text-rose-600 dark:text-rose-400",
        },
        {
            label: "Net Kar",
            value: formatCurrency(netProfit),
            delta: previousYear ? pctDelta(netProfit, previousYear.netProfit) : null,
            icon: ArrowDownToLine,
            accent: netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
        },
        {
            label: "Kar Marjı",
            value: `%${profitMargin.toFixed(1)}`,
            delta: previousYear && previousYear.profitMargin !== 0 ? profitMargin - previousYear.profitMargin : null,
            icon: Percent,
            accent: "text-violet-600 dark:text-violet-400",
        },
    ];

    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {items.map((it, idx) => (
                <Card key={idx} className="overflow-hidden border-border/70 bg-card">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                {it.label}
                            </p>
                            <it.icon className={cn("h-4 w-4", it.accent)} />
                        </div>
                        {isLoading ? (
                            <div className="mt-3 h-9 w-40 animate-pulse rounded bg-muted" />
                        ) : (
                            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-foreground">
                                {it.value}
                            </p>
                        )}
                        <div className="mt-3 flex items-center justify-between">
                            {isLoading ? (
                                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                            ) : it.label === "Kar Marjı" && it.delta !== null ? (
                                <span className={cn(
                                    "inline-flex items-center gap-1 text-[11px] font-medium tabular-nums",
                                    it.delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                )}>
                                    {it.delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                    {it.delta >= 0 ? "+" : ""}{it.delta.toFixed(1)} pp
                                    <span className="font-normal text-muted-foreground">geçen yıla göre</span>
                                </span>
                            ) : (
                                <TrendBadge delta={it.delta} invertColor={it.invertColor} />
                            )}
                            <span className="text-[10px] text-muted-foreground tabular-nums">{selectedYear}</span>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

// Caller'a yardımcı — short formatter da export edilsin diye
export { formatCurrencyShort };
