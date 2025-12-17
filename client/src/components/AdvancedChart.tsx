import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { BarChart3, Loader2, Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
    Legend,
    ComposedChart,
    Cell,
} from "recharts";
import { Switch } from "@/components/ui/switch";

type GroupBy = "month" | "employee" | "company" | "customs" | "issuer";
type ChartType = "bar" | "line";

// Available metrics to display
const metricOptions = [
    { id: "malBedeli", label: "Mal Bedeli (KDV Hariç)", color: "hsl(var(--chart-1))" },
    { id: "topKdvTutar", label: "KDV Tutarı", color: "hsl(var(--chart-2))" },
    { id: "topFaturaTutar", label: "Toplam Fatura (KDV Dahil)", color: "hsl(var(--chart-3))" },
    { id: "topIskonto", label: "Toplam İskonto", color: "hsl(var(--chart-4))" },
    { id: "dosyaSayisi", label: "Dosya Sayısı (Sağ Eksen)", color: "#ff0000", isCount: true },
];

const groupByOptions = [
    { value: "month", label: "Aya Göre" },
    { value: "employee", label: "Giriş Elemanına Göre" },
    { value: "company", label: "Firmaya Göre" },
    { value: "customs", label: "Gümrük Müdürlüğüne Göre" },
    { value: "issuer", label: "Faturayı Kesene Göre" },
];

const monthsList = [
    "ocak", "subat", "mart", "nisan", "mayis", "haziran",
    "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"
];

// Standard chart colors for dynamic lines in trend mode
const chartColors = [
    "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))",
    "#2563eb", "#db2777", "#ea580c", "#65a30d", "#7c3aed"
];

const chartTypeOptions = [
    { value: "bar", label: "Çubuk Grafik" },
    { value: "line", label: "Çizgi Grafik" },
];

interface AdvancedChartProps {
    selectedYil: string;
}

export function AdvancedChart({ selectedYil }: AdvancedChartProps) {
    const [groupBy, setGroupBy] = useState<GroupBy>("month");
    const [chartType, setChartType] = useState<ChartType>("bar");
    const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["malBedeli", "topKdvTutar"]);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [openCombobox, setOpenCombobox] = useState(false);
    const [isTrendMode, setIsTrendMode] = useState(false);

    // Reset selected items when grouping changes
    useEffect(() => {
        setSelectedItems([]);
        // Disable trend mode if switching to 'month' as it doesn't make sense
        if (groupBy === "month") setIsTrendMode(false);
    }, [groupBy]);

    // Fetch the list of available items for the selected category
    const { data: availableItems } = useQuery<string[]>({
        queryKey: ["/api/gumruk/list", groupBy, selectedYil],
        queryFn: async () => {
            if (groupBy === "month") return monthsList;

            let url = "";
            switch (groupBy) {
                case "employee": url = `/api/gumruk/giris-elemanlari/${selectedYil}`; break;
                case "company": url = `/api/gumruk/firmalar/${selectedYil}`; break;
                case "customs": url = `/api/gumruk/gumrukler-listesi/${selectedYil}`; break;
                case "issuer": url = `/api/gumruk/fatura-kesenler/${selectedYil}`; break;
                default: return [];
            }
            if (!url) return [];

            const response = await fetch(url);
            if (!response.ok) throw new Error("List fetch failed");
            return response.json();
        },
        enabled: !!selectedYil,
    });

    // Fetch data for the chart (Standard or Trend)
    const { data: rawChartData, isLoading } = useQuery<any[]>({
        queryKey: [isTrendMode ? "/api/gumruk/advanced-chart-trend" : "/api/gumruk/advanced-chart", selectedYil, groupBy, selectedItems.sort().join(','), isTrendMode],
        queryFn: async () => {
            let baseUrl = isTrendMode
                ? `/api/gumruk/advanced-chart-trend/${selectedYil}`
                : `/api/gumruk/advanced-chart/${selectedYil}`;

            let url = `${baseUrl}?groupBy=${groupBy}`;
            if (selectedItems.length > 0) {
                url += `&names=${encodeURIComponent(selectedItems.join(','))}`;
            }
            const response = await fetch(url);
            if (!response.ok) throw new Error("Failed to fetch chart data");
            return response.json();
        },
        enabled: !!selectedYil,
    });

    // Process data for rendering
    const processedData = useMemo(() => {
        if (!rawChartData) return [];

        if (isTrendMode) {
            // Trend Mode: Pivot data so each entity can have multiple metric values
            const pivotMap = new Map<string, any>();
            // Initialize all months
            monthsList.forEach(m => pivotMap.set(m, { name: m }));

            rawChartData.forEach((item: any) => {
                if (pivotMap.has(item.month)) {
                    const entry = pivotMap.get(item.month);
                    // Store each selected metric for the entity
                    // Key format: "EntityName_MetricId"
                    selectedMetrics.forEach(metricId => {
                        // Ensure we don't crash if metric value is missing
                        entry[`${item.entity}_${metricId}`] = item[metricId];
                    });
                }
            });
            return Array.from(pivotMap.values());
        } else {
            return rawChartData;
        }
    }, [rawChartData, isTrendMode, selectedMetrics]);

    // Extract unique entities for Trend Mode
    const trendEntities = useMemo(() => {
        if (!isTrendMode || !rawChartData) return [];
        const entities = new Set<string>();
        rawChartData.forEach((item: any) => entities.add(item.entity));
        return Array.from(entities);
    }, [rawChartData, isTrendMode]);

    const toggleMetric = (metricId: string) => {
        setSelectedMetrics((prev) =>
            prev.includes(metricId)
                ? prev.filter((id) => id !== metricId)
                : [...prev, metricId]
        );
    };

    const toggleItemSelection = (item: string) => {
        setSelectedItems((prev) =>
            prev.includes(item)
                ? prev.filter((i) => i !== item)
                : [...prev, item]
        );
    };

    const formatCurrency = (value: number): string => {
        if (value >= 1000000) return `₺${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `₺${(value / 1000).toFixed(0)}K`;
        return `₺${value.toFixed(0)}`;
    };

    const formatValue = (value: number, key: string) => {
        if (isTrendMode) {
            // Key is "Entity_MetricId"
            const parts = key.split('_');
            const metricId = parts.length > 1 ? parts[parts.length - 1] : key;
            const metric = metricOptions.find((m) => m.id === metricId);
            if (metric?.isCount) return value.toString();
            return formatCurrency(value);
        }

        const metric = metricOptions.find((m) => m.id === key);
        if (metric?.isCount) return value.toString();
        return formatCurrency(value);
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-4">
                    <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5" />
                            Gelişmiş Grafik Analizi
                        </div>

                        {groupBy !== "month" && (
                            <div className="flex items-center gap-2">
                                <Label htmlFor="trend-mode" className="text-sm cursor-pointer">Aylık Trend</Label>
                                <Switch
                                    id="trend-mode"
                                    checked={isTrendMode}
                                    onCheckedChange={setIsTrendMode}
                                />
                            </div>
                        )}
                    </CardTitle>

                    <div className="flex flex-wrap items-end gap-4">
                        <div className="flex flex-col gap-2">
                            <Label className="text-sm">Kategori:</Label>
                            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {groupByOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {(groupBy !== "month" || !isTrendMode) && (
                            <div className="flex flex-col gap-2">
                                <Label className="text-sm">Özel Karşılaştırma Seç (Opsiyonel):</Label>
                                <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openCombobox}
                                            className="w-[300px] justify-between"
                                        >
                                            {selectedItems.length > 0
                                                ? `${selectedItems.length} seçim yapıldı`
                                                : "Karşılaştırmak için seç..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Ara..." />
                                            <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>
                                            <CommandGroup className="max-h-[300px] overflow-y-auto">
                                                {availableItems?.map((item) => (
                                                    <CommandItem
                                                        key={item}
                                                        value={item}
                                                        onSelect={() => toggleItemSelection(item)}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                selectedItems.includes(item)
                                                                    ? "opacity-100"
                                                                    : "opacity-0"
                                                            )}
                                                        />
                                                        {item}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        )}

                        {!isTrendMode && (
                            <div className="flex flex-col gap-2">
                                <Label className="text-sm">Grafik Tipi:</Label>
                                <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
                                    <SelectTrigger className="w-[140px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {chartTypeOptions.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    {selectedItems.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                            <span className="text-sm text-muted-foreground self-center mr-2">Seçilenler:</span>
                            {selectedItems.map(item => (
                                <Badge key={item} variant="secondary" className="flex items-center gap-1">
                                    {item}
                                    <button
                                        onClick={() => toggleItemSelection(item)}
                                        className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                    >
                                        <X className="w-3 h-3" />
                                        <span className="sr-only">Remove</span>
                                    </button>
                                </Badge>
                            ))}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => setSelectedItems([])}
                            >
                                Temizle
                            </Button>
                        </div>
                    )}

                    <div className="border rounded-lg p-4 bg-muted/50 mt-2">
                        <Label className="text-sm font-medium mb-3 block">
                            {isTrendMode ? "Analiz Edilecek Metrikler (İlk Seçim: Bar, Diğerleri: Line):" : "Karşılaştırılacak Metrikler:"}
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {metricOptions.map((metric) => (
                                <div key={metric.id} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={metric.id}
                                        checked={selectedMetrics.includes(metric.id)}
                                        onCheckedChange={() => toggleMetric(metric.id)}
                                    />
                                    <label
                                        htmlFor={metric.id}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                                    >
                                        <div
                                            className="w-3 h-3 rounded-sm"
                                            style={{ backgroundColor: metric.color }}
                                        />
                                        {metric.label}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </CardHeader>

            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center h-[400px]">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                ) : !processedData.length ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                        <BarChart3 className="w-12 h-12 mb-2" />
                        <p>{selectedYil} yılına ait veri bulunamadı</p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={400}>
                        {isTrendMode ? (
                            // TREND MODE COMPOSITE CHART (Bar + Line for multiple metrics)
                            <ComposedChart
                                data={processedData}
                                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis
                                    dataKey="name"
                                    angle={-45}
                                    textAnchor="end"
                                    height={100}
                                    interval={0}
                                    tick={{ fontSize: 11 }}
                                />
                                <YAxis
                                    yAxisId="left"
                                    orientation="left"
                                    tick={{ fontSize: 11 }}
                                    tickFormatter={(value) => formatCurrency(value)}
                                />
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    tick={{ fontSize: 11 }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "hsl(var(--card))",
                                        border: "1px solid hsl(var(--border))",
                                        borderRadius: "var(--radius)",
                                    }}
                                    formatter={(value: number, name: string, item: any) => {
                                        // Attempt to determine if this is a count metric
                                        let isCount = false;

                                        // Check via Name (Label)
                                        if (name && (name.includes("Dosya Sayısı") || name.includes("Count"))) {
                                            isCount = true;
                                        }

                                        // Check via DataKey if accessible (item.dataKey might vary based on recharts version/types)
                                        // But Name check should be robust enough for "Dosya Sayısı"

                                        const formattedValue = isCount ? value.toString() : formatCurrency(value);
                                        return [formattedValue, name];
                                    }}
                                />
                                <Legend />
                                {trendEntities.map((entityName, index) => {
                                    // Use high contrast palette
                                    const distinctColors = [
                                        "#2563eb", // Blue
                                        "#dc2626", // Red
                                        "#16a34a", // Green
                                        "#d97706", // Amber
                                        "#9333ea", // Purple
                                        "#0891b2", // Cyan
                                        "#be185d", // Pink
                                        "#4b5563", // Gray
                                    ];
                                    const entityColor = distinctColors[index % distinctColors.length];

                                    // Iterate through selected metrics to generate series
                                    return selectedMetrics.map((metricId, mIndex) => {
                                        const uniqueKey = `${entityName}_${metricId}`;
                                        const isCount = metricId === "dosyaSayisi";
                                        const axisId = isCount ? "right" : "left";

                                        // First metric is Bar, others are Line
                                        if (mIndex === 0) {
                                            return (
                                                <Bar
                                                    key={uniqueKey}
                                                    dataKey={uniqueKey}
                                                    fill={entityColor}
                                                    name={`${entityName} (${metricOptions.find(m => m.id === metricId)?.label})`}
                                                    radius={[4, 4, 0, 0]}
                                                    yAxisId={axisId}
                                                />
                                            );
                                        } else {
                                            return (
                                                <Line
                                                    key={uniqueKey}
                                                    type="monotone"
                                                    dataKey={uniqueKey}
                                                    stroke={entityColor}
                                                    strokeWidth={2}
                                                    name={`${entityName} (${metricOptions.find(m => m.id === metricId)?.label})`}
                                                    dot={{ fill: entityColor, r: 4 }}
                                                    activeDot={{ r: 6 }}
                                                    yAxisId={axisId}
                                                />
                                            );
                                        }
                                    });
                                })}
                            </ComposedChart>
                        ) : (
                            // STANDARD MODE CHART (Composed Bar/Line)
                            <ComposedChart
                                data={processedData}
                                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                            >
                                <defs>
                                    {selectedMetrics.map(metricId => {
                                        // Skip line-only metrics (e.g. dosyaSayisi) from gradient generation if we want optimisation,
                                        // but logic below handles 'Bar' rendering. We generate gradients for all just in case.

                                        const values = processedData.map((d: any) => Number(d[metricId]) || 0);
                                        const maxVal = Math.max(...values);
                                        const minVal = Math.min(...values);

                                        return processedData.map((entry: any, index: number) => {
                                            let color = "hsl(var(--primary))";
                                            if (maxVal === minVal) {
                                                color = "hsl(120, 80%, 45%)";
                                            } else {
                                                const val = Number(entry[metricId]) || 0;
                                                const ratio = (val - minVal) / (maxVal - minVal);
                                                const hue = ratio * 120;
                                                color = `hsl(${hue}, 80%, 45%)`;
                                            }

                                            return (
                                                <linearGradient key={`grad-${metricId}-${index}`} id={`grad-${metricId}-${index}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor={color} stopOpacity={1} />
                                                    <stop offset="100%" stopColor={color} stopOpacity={0.3} />
                                                </linearGradient>
                                            );
                                        });
                                    })}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis
                                    dataKey="name"
                                    angle={-45}
                                    textAnchor="end"
                                    height={100}
                                    interval={0}
                                    tick={{ fontSize: 11 }}
                                />
                                <YAxis
                                    yAxisId="left"
                                    tick={{ fontSize: 11 }}
                                    tickFormatter={(value) => formatCurrency(value)}
                                    orientation="left"
                                />
                                {selectedMetrics.includes("dosyaSayisi") && (
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        tick={{ fontSize: 11 }}
                                    />
                                )}
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "hsl(var(--card))",
                                        border: "1px solid hsl(var(--border))",
                                        borderRadius: "var(--radius)",
                                    }}
                                    formatter={(value: number, name: string) => [
                                        formatValue(value, name),
                                        metricOptions.find((m) => m.id === name)?.label || name,
                                    ]}
                                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                />
                                <Legend
                                    formatter={(value) =>
                                        metricOptions.find((m) => m.id === value)?.label || value
                                    }
                                />
                                {selectedMetrics.map((metricId) => {
                                    const metric = metricOptions.find((m) => m.id === metricId);

                                    if (metricId === "dosyaSayisi") {
                                        return (
                                            <Line
                                                key={metricId}
                                                type="monotone"
                                                dataKey={metricId}
                                                stroke={metric?.color}
                                                strokeWidth={3}
                                                yAxisId="right"
                                                dot={{ fill: metric?.color, r: 4 }}
                                                activeDot={{ r: 6 }}
                                            />
                                        );
                                    }

                                    if (chartType === "line") {
                                        return (
                                            <Line
                                                key={metricId}
                                                type="monotone"
                                                dataKey={metricId}
                                                stroke={metric?.color}
                                                strokeWidth={2}
                                                yAxisId="left"
                                                dot={{ fill: metric?.color, r: 4 }}
                                                activeDot={{ r: 6 }}
                                            />
                                        );
                                    } else {
                                        return (
                                            <Bar
                                                key={metricId}
                                                dataKey={metricId}
                                                radius={[4, 4, 0, 0]}
                                                yAxisId="left"
                                            >
                                                {processedData.map((entry: any, index: number) => (
                                                    <Cell key={`cell-${metricId}-${index}`} fill={`url(#grad-${metricId}-${index})`} />
                                                ))}
                                            </Bar>
                                        );
                                    }
                                })}
                            </ComposedChart>
                        )}
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
