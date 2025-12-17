import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BackgroundPaths } from "@/components/BackgroundPaths";
import { ExcelUploadModal } from "@/components/ExcelUploadModal";
import { AdvancedChart } from "@/components/AdvancedChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileSpreadsheet, TrendingUp, Users, Building2, Loader2, BarChart3 } from "lucide-react";
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
  Cell,
} from "recharts";
import type { GumrukVerisi } from "@shared/schema";

type ChartMetric = "satis" | "dosya" | "kdv" | "firma" | "eleman" | "gumrukBazli";

const aylar = [
  { value: "ocak", label: "Ocak", sira: 1 },
  { value: "subat", label: "Şubat", sira: 2 },
  { value: "mart", label: "Mart", sira: 3 },
  { value: "nisan", label: "Nisan", sira: 4 },
  { value: "mayis", label: "Mayıs", sira: 5 },
  { value: "haziran", label: "Haziran", sira: 6 },
  { value: "temmuz", label: "Temmuz", sira: 7 },
  { value: "agustos", label: "Ağustos", sira: 8 },
  { value: "eylul", label: "Eylül", sira: 9 },
  { value: "ekim", label: "Ekim", sira: 10 },
  { value: "kasim", label: "Kasım", sira: 11 },
  { value: "aralik", label: "Aralık", sira: 12 },
];

const currentYear = new Date().getFullYear();
const yillar = Array.from({ length: 5 }, (_, i) => currentYear - i);

function formatCurrency(value: string | number | null): string {
  if (value === null || value === undefined) return "₺0,00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
  }).format(num);
}

function formatCurrencyShort(value: number): string {
  if (value >= 1000000) {
    return `₺${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `₺${(value / 1000).toFixed(0)}K`;
  }
  return `₺${value.toFixed(0)}`;
}

function getAyLabel(value: string): string {
  return aylar.find((a) => a.value === value)?.label || value;
}

function getAySira(value: string): number {
  return aylar.find((a) => a.value === value)?.sira || 0;
}

type AylikOzet = {
  ay: string;
  yil: number;
  toplamSatis: number;
  toplamKdv: number;
  dosyaSayisi: number;
};

const chartMetricOptions = [
  { value: "satis", label: "Aylık Satış (KDV Hariç)" },
  { value: "dosya", label: "Dosya Sayısı" },
  { value: "kdv", label: "Toplam KDV" },
  { value: "firma", label: "Firma Bazlı" },
  { value: "eleman", label: "Giriş Elemanı" },
  { value: "gumrukBazli", label: "Gümrük Bazlı" },
] as const;

export default function Gumruk() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedAy, setSelectedAy] = useState<string>("");
  const [selectedYil, setSelectedYil] = useState<string>(String(currentYear));
  const [chartMetric, setChartMetric] = useState<ChartMetric>("satis");
  const [selectedFirma, setSelectedFirma] = useState<string>("");

  // Yüklü ayları getir
  const { data: yukluAylar, refetch: refetchAylar } = useQuery<
    { ay: string; yil: number; kayitSayisi: number }[]
  >({
    queryKey: ["/api/gumruk/aylar"],
  });

  // Aylık özet verilerini getir (grafik için)
  const { data: aylikOzet, isLoading: ozetLoading, refetch: refetchOzet } = useQuery<AylikOzet[]>({
    queryKey: ["/api/gumruk/ozet", selectedYil],
  });

  // Firma listesini getir
  const { data: firmalar } = useQuery<string[]>({
    queryKey: ["/api/gumruk/firmalar", selectedYil],
    enabled: chartMetric === "firma",
  });

  // Firma bazlı özet getir
  const { data: firmaOzet, isLoading: firmaOzetLoading } = useQuery<
    { ay: string; toplamSatis: number; toplamKdv: number; dosyaSayisi: number }[]
  >({
    queryKey: ["/api/gumruk/firma-ozet", selectedYil, selectedFirma],
    enabled: chartMetric === "firma" && !!selectedFirma,
  });

  // Giriş elemanı bazlı özet getir
  const { data: elemanOzet, isLoading: elemanOzetLoading } = useQuery<
    { eleman: string; toplamSatis: number; dosyaSayisi: number }[]
  >({
    queryKey: ["/api/gumruk/eleman-ozet", selectedYil],
    enabled: chartMetric === "eleman",
  });

  // Gümrük müdürlüğü bazlı özet getir
  const { data: gumrukBazliOzet, isLoading: gumrukBazliOzetLoading } = useQuery<
    { gumruk: string; toplamSatis: number; dosyaSayisi: number }[]
  >({
    queryKey: ["/api/gumruk/gumruk-ozet", selectedYil],
    enabled: chartMetric === "gumrukBazli",
  });

  // Seçili ay verilerini getir
  const { data: veriler, isLoading: verilerLoading, refetch: refetchVeriler } = useQuery<GumrukVerisi[]>({
    queryKey: ["/api/gumruk", selectedAy, selectedYil],
    enabled: !!selectedAy && !!selectedYil,
  });

  const handleUploadSuccess = () => {
    refetchAylar();
    refetchOzet();
    if (selectedAy && selectedYil) {
      refetchVeriler();
    }
  };

  // Grafik verisini hazırla (aylara göre sıralı veya kategori bazlı)
  const chartData = useMemo(() => {
    if (chartMetric === "eleman" && elemanOzet) {
      return elemanOzet.map((item) => ({
        isim: item.eleman,
        deger: item.toplamSatis,
        dosyaSayisi: item.dosyaSayisi,
      }));
    }

    if (chartMetric === "gumrukBazli" && gumrukBazliOzet) {
      return gumrukBazliOzet.map((item) => ({
        isim: item.gumruk,
        deger: item.toplamSatis,
        dosyaSayisi: item.dosyaSayisi,
      }));
    }

    if (chartMetric === "firma" && firmaOzet) {
      return firmaOzet
        .map((item) => ({
          ay: getAyLabel(item.ay),
          sira: getAySira(item.ay),
          deger: item.toplamSatis,
          dosyaSayisi: item.dosyaSayisi,
          toplamKdv: item.toplamKdv,
        }))
        .sort((a, b) => a.sira - b.sira);
    }

    if (!aylikOzet) return [];

    return aylikOzet
      .map((item) => ({
        ay: getAyLabel(item.ay),
        sira: getAySira(item.ay),
        deger: chartMetric === "satis" ? item.toplamSatis :
          chartMetric === "kdv" ? item.toplamKdv :
            item.dosyaSayisi,
        dosyaSayisi: item.dosyaSayisi,
        toplamSatis: item.toplamSatis,
        toplamKdv: item.toplamKdv,
      }))
      .sort((a, b) => a.sira - b.sira);
  }, [aylikOzet, firmaOzet, elemanOzet, gumrukBazliOzet, chartMetric]);

  const getChartTitle = () => {
    const metric = chartMetricOptions.find(m => m.value === chartMetric);
    if (chartMetric === "firma" && selectedFirma) {
      return `${selectedFirma.substring(0, 30)}${selectedFirma.length > 30 ? '...' : ''} - Aylık Satış`;
    }
    if (chartMetric === "eleman") {
      return `Giriş Elemanı Performansı (${selectedYil}) - KDV Hariç`;
    }
    if (chartMetric === "gumrukBazli") {
      return `Gümrük Müdürlüğü Performansı (${selectedYil}) - KDV Hariç`;
    }
    return metric?.label || "Aylık Satış";
  };

  const getYAxisFormatter = (value: number) => {
    if (chartMetric === "dosya") {
      return String(value);
    }
    return formatCurrencyShort(value);
  };

  const getTooltipFormatter = (value: number) => {
    if (chartMetric === "dosya") {
      return [value, "Dosya Sayısı"];
    }
    if (chartMetric === "kdv") {
      return [formatCurrency(value), "KDV"];
    }
    if (chartMetric === "eleman") {
      return [formatCurrency(value), "Toplam Satış"];
    }
    return [formatCurrency(value), "Satış"];
  };

  const isChartLoading = chartMetric === "firma" ? firmaOzetLoading :
    chartMetric === "eleman" ? elemanOzetLoading :
      chartMetric === "gumrukBazli" ? gumrukBazliOzetLoading : ozetLoading;

  // Genel istatistikleri hesapla (tüm yıl için)
  const genelStats = aylikOzet
    ? {
      toplamSatis: aylikOzet.reduce((sum, v) => sum + v.toplamSatis, 0),
      toplamKdv: aylikOzet.reduce((sum, v) => sum + v.toplamKdv, 0),
      toplamDosya: aylikOzet.reduce((sum, v) => sum + v.dosyaSayisi, 0),
      aylikOrtalama: aylikOzet.length > 0
        ? aylikOzet.reduce((sum, v) => sum + v.toplamSatis, 0) / aylikOzet.length
        : 0,
    }
    : null;

  // Seçili ay istatistikleri
  const ayStats = veriler
    ? {
      toplamFatura: veriler.reduce(
        (sum, v) => sum + parseFloat(v.topFaturaTutar || "0"),
        0
      ),
      toplamKdv: veriler.reduce(
        (sum, v) => sum + parseFloat(v.topKdvTutar || "0"),
        0
      ),
      dosyaSayisi: veriler.length,
      musteriSayisi: new Set(veriler.map((v) => v.firmaUnvan)).size,
    }
    : null;

  // En çok ciro yapan müşteriler (seçili ay için)
  const musteriCirolari = veriler
    ? Object.entries(
      veriler.reduce((acc, v) => {
        const firma = v.firmaUnvan || "Bilinmeyen";
        acc[firma] = (acc[firma] || 0) + parseFloat(v.topFaturaTutar || "0");
        return acc;
      }, {} as Record<string, number>)
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    : [];

  // Çalışan bazında dosya sayıları (seçili ay için)
  const calisanDosyalari = veriler
    ? Object.entries(
      veriler.reduce((acc, v) => {
        const calisan = v.girisElemani || "Bilinmeyen";
        acc[calisan] = (acc[calisan] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    )
      .sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="relative min-h-full">
      <BackgroundPaths />

      <div className="relative z-10 p-6 lg:p-8 space-y-6">
        {/* Üst Bar - Sadece Excel Yükle butonu */}
        <div className="flex justify-end">
          <Button onClick={() => setIsUploadModalOpen(true)} data-testid="button-open-upload">
            <Upload className="w-4 h-4 mr-2" />
            Excel Yükle
          </Button>
        </div>

        {/* Genel İstatistik Kartları */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                {selectedYil} Toplam Satış
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold" data-testid="text-yillik-satis">
                {ozetLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatCurrency(genelStats?.toplamSatis || 0)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                {selectedYil} Toplam KDV
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold" data-testid="text-yillik-kdv">
                {ozetLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatCurrency(genelStats?.toplamKdv || 0)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                {selectedYil} Toplam Dosya
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold" data-testid="text-yillik-dosya">
                {ozetLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : genelStats?.toplamDosya || 0}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Aylık Ortalama
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold" data-testid="text-aylik-ortalama">
                {ozetLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatCurrency(genelStats?.aylikOrtalama || 0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Dinamik Grafik */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              {getChartTitle()}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={chartMetric} onValueChange={(v) => {
                setChartMetric(v as ChartMetric);
                if (v !== "firma") setSelectedFirma("");
              }}>
                <SelectTrigger className="w-[180px]" data-testid="select-chart-metric">
                  <SelectValue placeholder="Metrik seçin" />
                </SelectTrigger>
                <SelectContent>
                  {chartMetricOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {chartMetric === "firma" && (
                <Select value={selectedFirma} onValueChange={setSelectedFirma}>
                  <SelectTrigger className="w-[250px]" data-testid="select-firma">
                    <SelectValue placeholder="Firma seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {firmalar?.map((firma) => (
                      <SelectItem key={firma} value={firma}>
                        {firma.length > 35 ? `${firma.substring(0, 35)}...` : firma}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={selectedYil} onValueChange={setSelectedYil}>
                <SelectTrigger className="w-[100px]" data-testid="select-grafik-yil">
                  <SelectValue placeholder="Yıl" />
                </SelectTrigger>
                <SelectContent>
                  {yillar.map((yil) => (
                    <SelectItem key={yil} value={String(yil)}>
                      {yil}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isChartLoading ? (
              <div className="flex items-center justify-center h-[300px]">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : chartMetric === "firma" && !selectedFirma ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <Building2 className="w-12 h-12 mb-2" />
                <p>Grafik görüntülemek için firma seçin</p>
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={(chartMetric === "eleman" || chartMetric === "gumrukBazli") ? 400 : 300}>
                {chartMetric === "dosya" ? (
                  <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="ay"
                      className="text-xs fill-muted-foreground"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      className="text-xs fill-muted-foreground"
                      tickFormatter={getYAxisFormatter}
                      tick={{ fontSize: 11 }}
                      width={50}
                    />
                    <Tooltip
                      formatter={(value: number) => getTooltipFormatter(value)}
                      labelStyle={{ color: "var(--foreground)" }}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)"
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="deger"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </LineChart>
                ) : chartMetric === "eleman" || chartMetric === "gumrukBazli" ? (
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 10, right: 30, left: 120, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      type="number"
                      className="text-xs fill-muted-foreground"
                      tickFormatter={getYAxisFormatter}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="isim"
                      className="text-xs fill-muted-foreground"
                      tick={{ fontSize: 11 }}
                      width={115}
                    />
                    <Tooltip
                      formatter={(value: number) => getTooltipFormatter(value)}
                      labelStyle={{ color: "var(--foreground)" }}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)"
                      }}
                    />
                    <Bar
                      dataKey="deger"
                      fill={chartMetric === "gumrukBazli" ? "hsl(var(--chart-4))" : "hsl(var(--chart-3))"}
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      {chartData.map((entry, index) => {
                        const values = chartData.map(d => d.deger);
                        const maxVal = Math.max(...values);
                        const minVal = Math.min(...values);

                        let color = "hsl(var(--primary))";

                        if (chartMetric === "satis" || chartMetric === "kdv") {
                          if (maxVal === minVal) {
                            color = "hsl(120, 80%, 45%)";
                          } else {
                            const ratio = (entry.deger - minVal) / (maxVal - minVal);
                            const hue = ratio * 120;
                            color = `hsl(${hue}, 80%, 45%)`;
                          }
                        }

                        return (
                          <linearGradient key={`grad-${index}`} id={`grad-${index}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={1} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.3} />
                          </linearGradient>
                        );
                      })}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="ay"
                      className="text-xs fill-muted-foreground"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      className="text-xs fill-muted-foreground"
                      tickFormatter={getYAxisFormatter}
                      tick={{ fontSize: 11 }}
                      width={70}
                    />
                    <Tooltip
                      formatter={(value: number) => getTooltipFormatter(value)}
                      labelStyle={{ color: "var(--foreground)" }}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)"
                      }}
                      cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    />
                    <Bar dataKey="deger" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={`url(#grad-${index})`} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <BarChart3 className="w-12 h-12 mb-2" />
                <p>{selectedYil} yılına ait veri bulunamadı</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gelişmiş Grafik Analizi */}
        <AdvancedChart selectedYil={selectedYil} />

        {/* Ay Bazlı Detay Bölümü */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Ay Bazlı Detay
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Select value={selectedAy} onValueChange={setSelectedAy}>
                <SelectTrigger className="w-[140px]" data-testid="select-filter-ay">
                  <SelectValue placeholder="Ay seçin" />
                </SelectTrigger>
                <SelectContent>
                  {aylar.map((ay) => (
                    <SelectItem key={ay.value} value={ay.value}>
                      {ay.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedYil} onValueChange={setSelectedYil}>
                <SelectTrigger className="w-[100px]" data-testid="select-filter-yil">
                  <SelectValue placeholder="Yıl" />
                </SelectTrigger>
                <SelectContent>
                  {yillar.map((yil) => (
                    <SelectItem key={yil} value={String(yil)}>
                      {yil}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedAy && yukluAylar && (
                <span className="text-sm text-muted-foreground">
                  {yukluAylar.find(a => a.ay === selectedAy && a.yil === parseInt(selectedYil))
                    ? `${yukluAylar.find(a => a.ay === selectedAy && a.yil === parseInt(selectedYil))?.kayitSayisi} kayıt`
                    : "Veri yok"}
                </span>
              )}
            </div>

            {!selectedAy ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <FileSpreadsheet className="w-12 h-12 mb-2" />
                <p>Detay görüntülemek için ay seçin</p>
              </div>
            ) : verilerLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : veriler && veriler.length > 0 ? (
              <>
                {/* Ay İstatistik Kartları */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Toplam Fatura
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-bold" data-testid="text-toplam-fatura">
                        {formatCurrency(ayStats?.toplamFatura || 0)}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Toplam KDV
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-bold" data-testid="text-toplam-kdv">
                        {formatCurrency(ayStats?.toplamKdv || 0)}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Dosya Sayısı
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-bold" data-testid="text-dosya-sayisi">
                        {ayStats?.dosyaSayisi || 0}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Müşteri Sayısı
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-bold" data-testid="text-musteri-sayisi">
                        {ayStats?.musteriSayisi || 0}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Alt Kartlar */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                  {/* En Çok Ciro Yapan Müşteriler */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Building2 className="w-4 h-4" />
                        En Çok Ciro Yapan Müşteriler
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Müşteri</TableHead>
                            <TableHead className="text-right">Ciro</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {musteriCirolari.map(([musteri, ciro], index) => (
                            <TableRow key={musteri} data-testid={`row-musteri-${index}`}>
                              <TableCell className="font-medium">{musteri}</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(ciro)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Çalışan Bazında Dosya Sayıları */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="w-4 h-4" />
                        Çalışan Bazında Dosya Sayıları
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Çalışan</TableHead>
                            <TableHead className="text-right">Dosya Sayısı</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {calisanDosyalari.map(([calisan, sayi], index) => (
                            <TableRow key={calisan} data-testid={`row-calisan-${index}`}>
                              <TableCell className="font-medium">{calisan}</TableCell>
                              <TableCell className="text-right">{sayi}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <FileSpreadsheet className="w-12 h-12 mb-2" />
                <p>{getAyLabel(selectedAy)} {selectedYil} için kayıtlı veri bulunmuyor</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ExcelUploadModal
        open={isUploadModalOpen}
        onOpenChange={setIsUploadModalOpen}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}
