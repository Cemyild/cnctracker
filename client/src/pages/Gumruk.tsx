import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { type Calisan, type Gider, type GumrukVerisi, subeler } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp,
  FileSpreadsheet,
  Users,
  Upload,
  Loader2,
  BarChart3,
  Building2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Bot,
  AlertTriangle,
  Lightbulb,
  TrendingDown,
  Pencil,
  Target,
  History,
  Trash2
} from "lucide-react";
import { GiderEditModal } from "@/components/GiderEditModal";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow, 
  TableFooter 
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ComposedChart,
  Cell
} from "recharts";
import { ExcelUploadModal } from "@/components/ExcelUploadModal";
import { FinancialOverview } from "@/components/FinancialOverview";
import { BackgroundPaths } from "@/components/BackgroundPaths";
import { AdvancedChart } from "@/components/AdvancedChart";
import { AnalysisTab } from "@/components/AnalysisTab";
import { AIChat } from "@/components/AIChat";

        const aylar = [
        {value: "ocak", label: "Ocak", sira: 1 },
        {value: "subat", label: "Şubat", sira: 2 },
        {value: "mart", label: "Mart", sira: 3 },
        {value: "nisan", label: "Nisan", sira: 4 },
        {value: "mayis", label: "Mayıs", sira: 5 },
        {value: "haziran", label: "Haziran", sira: 6 },
        {value: "temmuz", label: "Temmuz", sira: 7 },
        {value: "agustos", label: "Ağustos", sira: 8 },
        {value: "eylul", label: "Eylül", sira: 9 },
        {value: "ekim", label: "Ekim", sira: 10 },
        {value: "kasim", label: "Kasım", sira: 11 },
        {value: "aralik", label: "Aralık", sira: 12 },
        ];

        const currentYear = new Date().getFullYear();
        // Şu anki yıldan 1 yıl ileri ve 3 yıl geriye giden yıllar (örn: 2027, 2026, 2025, 2024, 2023)
        const yillar = Array.from({length: 5 }, (_, i) => currentYear + 1 - i);

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
        {value: "satis", label: "Aylık Satış (KDV Hariç)" },
        {value: "dosya", label: "Dosya Sayısı" },
        {value: "kdv", label: "Toplam KDV" },
        {value: "firma", label: "Firma Bazlı" },
        {value: "eleman", label: "Giriş Elemanı" },
        {value: "gumrukBazli", label: "Gümrük Bazlı" },
        ] as const;

        type ChartMetric = typeof chartMetricOptions[number]["value"];

// Araç kategorileri - bu kategoriler seçildiğinde plaka sorulacak
const ARAC_KATEGORILERI = ["ARAÇ BAKIM", "ARAÇ MUAYENE", "ARAÇ ŞARJ", "ARAÇ KİRA", "ARAÇ ALIM"];

type Arac = {
  id: string;
  plaka: string;
  marka: string | null;
  model: string | null;
};

        export default function Gumruk() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
        const [selectedAy, setSelectedAy] = useState<string>("");
          const [selectedYil, setSelectedYil] = useState<string>(String(currentYear));
            const [chartMetric, setChartMetric] = useState<ChartMetric>("satis");
              const [selectedFirma, setSelectedFirma] = useState<string>("");

                // Giderler States
                const [isGiderUploadModalOpen, setIsGiderUploadModalOpen] = useState(false);
                const [selectedGiderAy, setSelectedGiderAy] = useState<string>("toplam");
                  const [selectedGiderYil, setSelectedGiderYil] = useState<string>(String(currentYear));
                    const [sortConfig, setSortConfig] = useState<{ key: keyof Gider | 'tryTutar' | null; direction: 'asc' | 'desc' }>({key: null, direction: 'asc' });
                    const [editingGider, setEditingGider] = useState<Gider | null>(null);
                    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
                    const { toast } = useToast();

                    const { data: categories } = useQuery<{id: string, name: string}[]>({
                        queryKey: ["/api/categories"],
                    });

                    // Araçlar listesi (plaka dropdown için)
                    const { data: araclar } = useQuery<Arac[]>({
                        queryKey: ["/api/araclar"],
                    });

                    const handleInlineUpdate = async (id: string, field: 'sube' | 'kategori' | 'plaka', value: string | null) => {
                        try {
                            const response = await fetch(`/api/giderler/${id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ [field]: value })
                            });

                            if (!response.ok) throw new Error("Update failed");

                            toast({
                                title: "Başarılı",
                                description: "Kayıt güncellendi",
                                duration: 2000,
                            });
                            
                            refetchGiderler();
                            refetchGiderStats();
                        } catch (error) {
                            toast({
                                title: "Hata",
                                description: "Güncelleme sırasında hata oluştu",
                                variant: "destructive",
                            });
                        }
                    };

                    // Yüklü ayları getir
                    const {data: yukluAylar, refetch: refetchAylar } = useQuery<
    { ay: string; yil: number; kayitSayisi: number }[]
  >({
                      queryKey: ["/api/gumruk/aylar"],
  });

                    // Aylık özet verilerini getir (grafik için)
                    const {data: aylikOzet, isLoading: ozetLoading, refetch: refetchOzet } = useQuery<AylikOzet[]>({
                      queryKey: ["/api/gumruk/ozet", selectedYil],
  });

                    // Firma listesini getir
                    const {data: firmalar } = useQuery<string[]>({
                      queryKey: ["/api/gumruk/firmalar", selectedYil],
                    enabled: chartMetric === "firma",
  });

                    // Firma bazlı özet getir
                    const {data: firmaOzet, isLoading: firmaOzetLoading } = useQuery<
    { ay: string; toplamSatis: number; toplamKdv: number; dosyaSayisi: number }[]
  >({
                      queryKey: ["/api/gumruk/firma-ozet", selectedYil, selectedFirma],
                    enabled: chartMetric === "firma" && !!selectedFirma,
  });

                    // Giriş elemanı bazlı özet getir
                    const {data: elemanOzet, isLoading: elemanOzetLoading } = useQuery<
    { eleman: string; toplamSatis: number; dosyaSayisi: number }[]
  >({
                      queryKey: ["/api/gumruk/eleman-ozet", selectedYil],
                    enabled: chartMetric === "eleman",
  });

                    // Gümrük müdürlüğü bazlı özet getir
                    const {data: gumrukBazliOzet, isLoading: gumrukBazliOzetLoading } = useQuery<
    { gumruk: string; toplamSatis: number; dosyaSayisi: number }[]
  >({
                      queryKey: ["/api/gumruk/gumruk-ozet", selectedYil],
                    enabled: chartMetric === "gumrukBazli",
  });

                    // Seçili ay verilerini getir
                    const {data: veriler, isLoading: verilerLoading, refetch: refetchVeriler } = useQuery<GumrukVerisi[]>({
                      queryKey: ["/api/gumruk", selectedAy, selectedYil],
                    enabled: !!selectedAy && !!selectedYil,
  });


                    // Gider Data Queries
                    const {data: giderler, isLoading: giderlerLoading, isError: giderlerError, refetch: refetchGiderler } = useQuery<Gider[]>({
                      queryKey: ["/api/giderler", selectedGiderAy, selectedGiderYil],
                    queryFn: async () => {
                      const res = await fetch(`/api/giderler?ay=${selectedGiderAy}&yil=${selectedGiderYil}`, { credentials: "include" });
                      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
                      return res.json();
                    },
                    enabled: !!selectedGiderYil && !!selectedGiderAy,
  });

                    const {data: giderStats, isLoading: giderStatsLoading, refetch: refetchGiderStats } = useQuery<{
    toplamCount: number;
                    toplamMalBedeli: number;
                    toplamKdv: number;
                    toplamTryTutar: number;
  }>({
                      queryKey: ["/api/giderler/stats", selectedGiderAy, selectedGiderYil],
                    queryFn: async () => {
                      const res = await fetch(`/api/giderler/stats?ay=${selectedGiderAy}&yil=${selectedGiderYil}`, { credentials: "include" });
                      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
                      return res.json();
                    },
                    enabled: !!selectedGiderYil && !!selectedGiderAy,
  });

                    // Özet Summary Data
                    const {data: ozetSummary, isLoading: ozetSummaryLoading } = useQuery<{
    ay: string;
                    satisKdvHaric: number;
                    satisKdv: number;
                    satisToplam: number;
                    giderKdvHaric: number;
                    giderKdv: number;
                    giderToplam: number;
                    calisanBrut: number;
                    calisanNet: number;
                    calisanIsverenSgk: number;
                    calisanMaliyet: number;
  }[]>({
                      queryKey: [`/api/gumruk/ozet-summary/${selectedYil}`],
  });

                    // Yükleme geçmişi (Upload history)
                    const { data: dosyalar, refetch: refetchDosyalar } = useQuery<{
                      id: string;
                      filename: string;
                      uploadDate: string | null;
                      sizeBytes: number | null;
                      md5Hash: string | null;
                      kayitSayisi: number;
                      yillar: number[];
                      aylar: string[];
                    }[]>({
                      queryKey: ["/api/gumruk/dosyalar", selectedYil],
                      queryFn: async () => {
                        const r = await fetch(`/api/gumruk/dosyalar?yil=${selectedYil}`, { credentials: "include" });
                        if (!r.ok) throw new Error(`${r.status}`);
                        return r.json();
                      },
                    });

  const handleUploadSuccess = () => {
                      refetchAylar();
                    refetchOzet();
                    if (selectedAy && selectedYil) {
                      refetchVeriler();
    }
                    refetchDosyalar();
  };

  const handleGiderUploadSuccess = () => {
                      refetchGiderler();
                    refetchGiderStats();
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
      }, { } as Record<string, number>)
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
      }, { } as Record<string, number>)
                    )
      .sort((a, b) => b[1] - a[1])
                    : [];

                    // Gider ay listesi (Yıllık toplama ek olarak)
                    const giderAylar = [{value: "toplam", label: "Yıllık Toplam" }, ...aylar];

  // Sorting Logic
  const handleSort = (key: keyof Gider | 'tryTutar') => {
                      let direction: 'asc' | 'desc' = 'asc';
                    if (sortConfig.key === key && sortConfig.direction === 'asc') {
                      direction = 'desc';
    }
                    setSortConfig({key, direction});
  };

  const sortedGiderler = useMemo(() => {
    if (!giderler) return [];
                    if (!sortConfig.key) return giderler;

    return [...giderler].sort((a, b) => {
      const aValue = a[sortConfig.key as keyof Gider];
                    const bValue = b[sortConfig.key as keyof Gider];

                    if (sortConfig.key === 'tarih') {
        const parseDate = (d: string) => {
          const parts = d.split('.');
                    return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
        };
                    const dateA = parseDate(String(aValue));
                    const dateB = parseDate(String(bValue));
                    return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
      }

                    if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

                    if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }

                    return 0;
    });
  }, [giderler, sortConfig]);

                    const SortIcon = ({column}: {column: keyof Gider | 'tryTutar' }) => {
    if (sortConfig.key !== column) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
                    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };


                    return (
                    <div className="relative min-h-full">
                      <BackgroundPaths />

                      <div className="relative z-10 p-6 lg:p-8 space-y-6">
                        <Tabs defaultValue="satis" className="w-full">
                          <TabsList className="mb-4">
                            <TabsTrigger value="ozet">Özet</TabsTrigger>
                            <TabsTrigger value="satis">Satışlar</TabsTrigger>
                            <TabsTrigger value="giderler">Giderler</TabsTrigger>
                            <TabsTrigger value="calisanlar">
                              <Users className="w-4 h-4 ml-2" />
                              Çalışanlar
                            </TabsTrigger>
                            <TabsTrigger value="ai-asistan" className="gap-2">
                                <Bot className="w-4 h-4" />
                                AI Asistan
                            </TabsTrigger>
                            <TabsTrigger value="analiz" className="gap-2">
                                <TrendingUp className="w-4 h-4" />
                                Trend Analizi
                            </TabsTrigger>
                            <TabsTrigger value="projeksiyon" className="gap-2">
                                <Target className="w-4 h-4" />
                                Analiz
                            </TabsTrigger>
                          </TabsList>

                          <TabsContent value="ai-asistan" className="space-y-6">
                            <AIChat />
                          </TabsContent>

                          <TabsContent value="analiz" className="space-y-6">
                             <TrendAnalysis />
                          </TabsContent>

                          <TabsContent value="projeksiyon" className="space-y-6">
                             <AnalysisTab />
                          </TabsContent>



                          <TabsContent value="ozet" className="space-y-6">
                            {/* Filter Selectors */}
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <label className="text-sm font-medium">Yıl:</label>
                                <Select value={selectedYil} onValueChange={setSelectedYil}>
                                  <SelectTrigger className="w-[120px]">
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

                              <div className="flex items-center gap-2">
                                <label className="text-sm font-medium">Ay:</label>
                                <Select value={selectedAy} onValueChange={setSelectedAy}>
                                  <SelectTrigger className="w-[140px]">
                                    <SelectValue placeholder="Tüm Yıl" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="tum_yil">Tüm Yıl</SelectItem>
                                    {aylar.map((ay) => (
                                      <SelectItem key={ay.value} value={ay.value}>
                                        {ay.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            {/* Özet Data Sections */}
                            {ozetSummaryLoading ? (
                              <div className="flex items-center justify-center min-h-[400px]">
                                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                              </div>
                            ) : ozetSummary && ozetSummary.length > 0 ? (
                              <>
                                {/* Financial Overview Visualization */}
                                <FinancialOverview
                                  data={ozetSummary}
                                  year={selectedYil}
                                  selectedMonth={selectedAy === "tum_yil" || selectedAy === "" ? undefined : selectedAy}
                                />

                                {/* Satışlar Section */}
                                <Card>
                                  <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                      <TrendingUp className="w-5 h-5" />
                                      Satışlar
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Ay</TableHead>
                                          <TableHead className="text-right">Satış KDV Hariç</TableHead>
                                          <TableHead className="text-right">KDV</TableHead>
                                          <TableHead className="text-right">Toplam Satış</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {ozetSummary.map((item) => (
                                          <TableRow key={item.ay}>
                                            <TableCell className="font-medium">{getAyLabel(item.ay)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(item.satisKdvHaric)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(item.satisKdv)}</TableCell>
                                            <TableCell className="text-right font-bold">{formatCurrency(item.satisToplam)}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                      <TableFooter>
                                        <TableRow>
                                          <TableCell className="font-bold">TOPLAM</TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrency(ozetSummary.reduce((sum, item) => sum + item.satisKdvHaric, 0))}
                                          </TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrency(ozetSummary.reduce((sum, item) => sum + item.satisKdv, 0))}
                                          </TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrency(ozetSummary.reduce((sum, item) => sum + item.satisToplam, 0))}
                                          </TableCell>
                                        </TableRow>
                                      </TableFooter>
                                    </Table>
                                  </CardContent>
                                </Card>

                                {/* Giderler Section */}
                                <Card>
                                  <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                      <FileSpreadsheet className="w-5 h-5" />
                                      Giderler
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Ay</TableHead>
                                          <TableHead className="text-right">Mal Bedeli KDV Hariç</TableHead>
                                          <TableHead className="text-right">KDV</TableHead>
                                          <TableHead className="text-right">Toplam Gider</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {ozetSummary.map((item) => (
                                          <TableRow key={item.ay}>
                                            <TableCell className="font-medium">{getAyLabel(item.ay)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(item.giderKdvHaric)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(item.giderKdv)}</TableCell>
                                            <TableCell className="text-right font-bold">{formatCurrency(item.giderToplam)}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                      <TableFooter>
                                        <TableRow>
                                          <TableCell className="font-bold">TOPLAM</TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrency(ozetSummary.reduce((sum, item) => sum + item.giderKdvHaric, 0))}
                                          </TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrency(ozetSummary.reduce((sum, item) => sum + item.giderKdv, 0))}
                                          </TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrency(ozetSummary.reduce((sum, item) => sum + item.giderToplam, 0))}
                                          </TableCell>
                                        </TableRow>
                                      </TableFooter>
                                    </Table>
                                  </CardContent>
                                </Card>

                                {/* Çalışanlar Section */}
                                <Card>
                                  <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                      <Users className="w-5 h-5" />
                                      Çalışan Masrafları
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Ay</TableHead>
                                          <TableHead className="text-right">Brüt Ücret</TableHead>
                                          <TableHead className="text-right">Net Ücret</TableHead>
                                          <TableHead className="text-right">İşveren SGK</TableHead>
                                          <TableHead className="text-right">Toplam Maliyet</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {ozetSummary.map((item) => (
                                          <TableRow key={item.ay}>
                                            <TableCell className="font-medium">{getAyLabel(item.ay)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(item.calisanBrut)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(item.calisanNet)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(item.calisanIsverenSgk)}</TableCell>
                                            <TableCell className="text-right font-bold">{formatCurrency(item.calisanMaliyet)}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                      <TableFooter>
                                        <TableRow>
                                          <TableCell className="font-bold">TOPLAM</TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrency(ozetSummary.reduce((sum, item) => sum + item.calisanBrut, 0))}
                                          </TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrency(ozetSummary.reduce((sum, item) => sum + item.calisanNet, 0))}
                                          </TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrency(ozetSummary.reduce((sum, item) => sum + item.calisanIsverenSgk, 0))}
                                          </TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrency(ozetSummary.reduce((sum, item) => sum + item.calisanMaliyet, 0))}
                                          </TableCell>
                                        </TableRow>
                                      </TableFooter>
                                    </Table>
                                  </CardContent>
                                </Card>
                              </>
                            ) : (
                              <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground bg-card rounded-lg border border-dashed">
                                <FileSpreadsheet className="w-12 h-12 mb-4 opacity-50" />
                                <p className="text-lg font-medium">{selectedYil} yılına ait veri bulunamadı</p>
                              </div>
                            )}
                          </TabsContent>

                          <TabsContent value="satis" className="space-y-6">
                            {/* Üst Bar - Sadece Excel Yükle butonu */}
                            <div className="flex justify-end">
                              <Button onClick={() => setIsUploadModalOpen(true)} data-testid="button-open-upload">
                                <Upload className="w-4 h-4 mr-2" />
                                Excel Yükle
                              </Button>
                            </div>

                            <ExcelUploadModal
                              open={isUploadModalOpen}
                              onOpenChange={setIsUploadModalOpen}
                              onSuccess={handleUploadSuccess}
                            />


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
                                      <ComposedChart
                                        data={chartData}
                                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                                      >
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
                                          yAxisId="left"
                                          className="text-xs fill-muted-foreground"
                                          tickFormatter={getYAxisFormatter}
                                          tick={{ fontSize: 11 }}
                                          width={70}
                                        />
                                        <YAxis
                                          yAxisId="right"
                                          orientation="right"
                                          className="text-xs fill-muted-foreground"
                                          tick={{ fontSize: 11 }}
                                          width={40}
                                          label={{ value: 'Dosya', angle: -90, position: 'insideRight' }}
                                        />
                                        <Tooltip
                                          formatter={(value: number, name: string) => {
                                            if (name === "dosyaSayisi") return [value, "Dosya Sayısı"];
                                            return getTooltipFormatter(value);
                                          }}
                                          labelStyle={{ color: "var(--foreground)" }}
                                          contentStyle={{
                                            backgroundColor: "hsl(var(--card))",
                                            border: "1px solid hsl(var(--border))",
                                            borderRadius: "var(--radius)"
                                          }}
                                          cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                        />
                                        <Bar dataKey="deger" yAxisId="left" radius={[4, 4, 0, 0]}>
                                          {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={`url(#grad-${index})`} />
                                          ))}
                                        </Bar>
                                        <Line
                                          yAxisId="right"
                                          type="monotone"
                                          dataKey="dosyaSayisi"
                                          stroke="#ff7300"
                                          strokeWidth={3}
                                          dot={{ r: 4, fill: "#ff7300" }}
                                        />
                                      </ComposedChart>
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

                            {/* Yükleme Geçmişi */}
                            <Card>
                              <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                  <History className="w-5 h-5" />
                                  Yükleme Geçmişi
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                {dosyalar?.length === 0 ? (
                                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                    <History className="w-12 h-12 mb-2" />
                                    <p>Henüz yükleme yok</p>
                                  </div>
                                ) : (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Tarih</TableHead>
                                        <TableHead>Dosya Adı</TableHead>
                                        <TableHead>Dönem</TableHead>
                                        <TableHead className="text-right">Boyut</TableHead>
                                        <TableHead className="text-right">Kayıt</TableHead>
                                        <TableHead className="text-right">İşlem</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {dosyalar?.map((d) => {
                                        const tarih = d.uploadDate
                                          ? (() => {
                                              const dt = new Date(d.uploadDate);
                                              const dd = String(dt.getDate()).padStart(2, "0");
                                              const mm = String(dt.getMonth() + 1).padStart(2, "0");
                                              const yyyy = dt.getFullYear();
                                              const hh = String(dt.getHours()).padStart(2, "0");
                                              const mi = String(dt.getMinutes()).padStart(2, "0");
                                              return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
                                            })()
                                          : "-";
                                        const fname = d.filename.length > 50
                                          ? d.filename.slice(0, 50) + "..."
                                          : d.filename;
                                        const tekYil = d.yillar.length === 1 ? d.yillar[0] : null;
                                        const ayLabels = d.aylar.map((a) => getAyLabel(a)).join(", ");
                                        const donem = d.aylar.length === 0
                                          ? "-"
                                          : tekYil
                                            ? `${ayLabels} ${tekYil}`
                                            : "Çoklu";
                                        const boyut = d.sizeBytes == null
                                          ? "-"
                                          : d.sizeBytes < 1024 * 1024
                                            ? `${(d.sizeBytes / 1024).toFixed(0)} KB`
                                            : `${(d.sizeBytes / 1024 / 1024).toFixed(2)} MB`;
                                        const onGeriAl = async () => {
                                          if (!window.confirm(`Bu yükleme silindiğinde ${d.kayitSayisi} satır gümrük kaydı da silinecek. Emin misiniz?`)) {
                                            return;
                                          }
                                          const r = await fetch(`/api/gumruk/dosyalar/${d.id}`, { method: "DELETE", credentials: "include" });
                                          if (!r.ok) {
                                            toast({ title: "Hata", description: "Silinemedi", variant: "destructive" });
                                            return;
                                          }
                                          toast({ title: "Başarılı", description: "Yükleme geri alındı" });
                                          refetchDosyalar();
                                          refetchOzet();
                                          refetchAylar();
                                          queryClient.invalidateQueries({ queryKey: [`/api/gumruk/ozet-summary/${selectedYil}`] });
                                        };
                                        return (
                                          <TableRow key={d.id} data-testid={`row-dosya-${d.id}`}>
                                            <TableCell>{tarih}</TableCell>
                                            <TableCell title={d.filename}>{fname}</TableCell>
                                            <TableCell>{donem}</TableCell>
                                            <TableCell className="text-right">{boyut}</TableCell>
                                            <TableCell className="text-right">{d.kayitSayisi}</TableCell>
                                            <TableCell className="text-right">
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive"
                                                onClick={onGeriAl}
                                                data-testid={`button-geri-al-${d.id}`}
                                              >
                                                <Trash2 className="w-4 h-4 mr-1" />
                                                Geri Al
                                              </Button>
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                )}
                              </CardContent>
                            </Card>
                          </TabsContent>

                          <TabsContent value="giderler" className="space-y-6">
                            <div className="flex flex-col gap-6">

                              {/* Header & Filters */}
                              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="flex items-center gap-4">
                                  <Select value={selectedGiderAy} onValueChange={setSelectedGiderAy}>
                                    <SelectTrigger className="w-[180px]" data-testid="select-gider-ay">
                                      <SelectValue placeholder="Dönem seçin" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {giderAylar.map((ay) => (
                                        <SelectItem key={ay.value} value={ay.value}>
                                          {ay.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  <Select value={selectedGiderYil} onValueChange={setSelectedGiderYil}>
                                    <SelectTrigger className="w-[120px]" data-testid="select-gider-yil">
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

                                <Button onClick={() => setIsGiderUploadModalOpen(true)} variant="secondary" data-testid="button-gider-upload">
                                  <Upload className="w-4 h-4 mr-2" />
                                  Gider Excel Yükle
                                </Button>
                              </div>

                              {/* Stats Cards */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <Card>
                                  <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">Toplam Fatura Adet</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <p className="text-2xl font-bold">
                                      {giderStatsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : giderStats?.toplamCount || 0}
                                    </p>
                                  </CardContent>
                                </Card>
                                <Card>
                                  <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">Toplam Mal Bedeli (KDV Hariç)</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <p className="text-2xl font-bold">
                                      {giderStatsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatCurrency(giderStats?.toplamMalBedeli || 0)}
                                    </p>
                                  </CardContent>
                                </Card>
                                <Card>
                                  <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">Toplam KDV</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <p className="text-2xl font-bold">
                                      {giderStatsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatCurrency(giderStats?.toplamKdv || 0)}
                                    </p>
                                  </CardContent>
                                </Card>
                                <Card>
                                  <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">Toplam Tutar (TRY)</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <p className="text-2xl font-bold">
                                      {giderStatsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatCurrency(giderStats?.toplamTryTutar || 0)}
                                    </p>
                                  </CardContent>
                                </Card>
                              </div>

                              {/* Data Table */}
                              <Card>
                                <CardHeader>
                                  <CardTitle>Gider Listesi</CardTitle>
                                </CardHeader>
                                <CardContent>
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('tarih')}>
                                          <div className="flex items-center">Tarih <SortIcon column="tarih" /></div>
                                        </TableHead>
                                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('firma')}>
                                          <div className="flex items-center">Firma <SortIcon column="firma" /></div>
                                        </TableHead>
                                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('faturaNo')}>
                                          <div className="flex items-center">Fatura No <SortIcon column="faturaNo" /></div>
                                        </TableHead>
                                        <TableHead className="cursor-pointer hover:bg-muted/50 text-right" onClick={() => handleSort('malBedeli')}>
                                          <div className="flex items-center justify-end">Mal Bedeli <SortIcon column="malBedeli" /></div>
                                        </TableHead>
                                        <TableHead className="cursor-pointer hover:bg-muted/50 text-right" onClick={() => handleSort('kdvTutari')}>
                                          <div className="flex items-center justify-end">KDV <SortIcon column="kdvTutari" /></div>
                                        </TableHead>
                                        <TableHead className="cursor-pointer hover:bg-muted/50 text-right" onClick={() => handleSort('toplamTutar')}>
                                          <div className="flex items-center justify-end">Toplam (Orj) <SortIcon column="toplamTutar" /></div>
                                        </TableHead>
                                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('paraBirimi')}>
                                          <div className="flex items-center">Para Birimi <SortIcon column="paraBirimi" /></div>
                                        </TableHead>
                                        <TableHead className="cursor-pointer hover:bg-muted/50 text-right" onClick={() => handleSort('kur')}>
                                          <div className="flex items-center justify-end">Kur <SortIcon column="kur" /></div>
                                        </TableHead>
                                        <TableHead className="cursor-pointer hover:bg-muted/50 text-right" onClick={() => handleSort('tryTutar')}>
                                          <div className="flex items-center justify-end">TRY Tutar <SortIcon column="tryTutar" /></div>
                                        </TableHead>
                                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('sube')}>
                                          <div className="flex items-center">Şube <SortIcon column="sube" /></div>
                                        </TableHead>
                                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('kategori')}>
                                          <div className="flex items-center">Kategori <SortIcon column="kategori" /></div>
                                        </TableHead>
                                        <TableHead>Plaka</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {giderlerLoading ? (
                                        <TableRow>
                                          <TableCell colSpan={13} className="text-center py-8">
                                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                                          </TableCell>
                                        </TableRow>
                                      ) : giderlerError ? (
                                        <TableRow>
                                          <TableCell colSpan={13} className="text-center py-8 text-red-500">
                                            Veriler yüklenirken hata oluştu. <button className="underline" onClick={() => refetchGiderler()}>Tekrar dene</button>
                                          </TableCell>
                                        </TableRow>
                                      ) : sortedGiderler?.length === 0 ? (
                                        <TableRow>
                                          <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                                            Kayıt bulunamadı
                                          </TableCell>
                                        </TableRow>
                                      ) : (
                                        sortedGiderler?.map((gider) => (
                                          <TableRow key={gider.id}>
                                            <TableCell>{gider.tarih}</TableCell>
                                            <TableCell>{gider.firma}</TableCell>
                                            <TableCell>{gider.faturaNo}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(gider.malBedeli)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(gider.kdvTutari)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(gider.toplamTutar)}</TableCell>
                                            <TableCell>{gider.paraBirimi}</TableCell>
                                            <TableCell className="text-right">{Number(gider.kur).toFixed(4)}</TableCell>
                                            <TableCell className="text-right font-bold">{formatCurrency(gider.tryTutar)}</TableCell>
                                            <TableCell className="p-2">
                                              <Select 
                                                defaultValue={gider.sube || ""} 
                                                onValueChange={(val) => handleInlineUpdate(gider.id, 'sube', val)}
                                              >
                                                <SelectTrigger className="h-8 w-[130px]">
                                                  <SelectValue placeholder="Seçiniz" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {subeler.map((s) => (
                                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </TableCell>
                                            <TableCell className="p-2">
                                               <Select
                                                defaultValue={gider.kategori || ""}
                                                onValueChange={(val) => {
                                                  handleInlineUpdate(gider.id, 'kategori', val);
                                                  // Araç kategorisi değilse plakayı temizle
                                                  if (!ARAC_KATEGORILERI.includes(val)) {
                                                    handleInlineUpdate(gider.id, 'plaka', null);
                                                  }
                                                }}
                                              >
                                                <SelectTrigger className="h-8 w-[140px]">
                                                  <SelectValue placeholder="Seçiniz" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {categories?.map((c) => (
                                                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </TableCell>
                                            <TableCell className="p-2">
                                              {ARAC_KATEGORILERI.includes(gider.kategori || "") ? (
                                                <Select
                                                  defaultValue={gider.plaka || ""}
                                                  onValueChange={(val) => handleInlineUpdate(gider.id, 'plaka', val)}
                                                >
                                                  <SelectTrigger className="h-8 w-[120px]">
                                                    <SelectValue placeholder="Plaka seç" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    {araclar?.map((a) => (
                                                      <SelectItem key={a.id} value={a.plaka}>{a.plaka}</SelectItem>
                                                    ))}
                                                  </SelectContent>
                                                </Select>
                                              ) : (
                                                <span className="text-muted-foreground text-xs">-</span>
                                              )}
                                            </TableCell>
                                            <TableCell>
                                              <Button variant="ghost" size="icon" onClick={() => { setEditingGider(gider); setIsEditModalOpen(true); }}>
                                                <Pencil className="w-4 h-4" />
                                              </Button>
                                            </TableCell>
                                          </TableRow>
                                        ))
                                      )}
                                    </TableBody>
                                  </Table>
                                </CardContent>
                              </Card>

                            </div>


                            <ExcelUploadModal
                              open={isGiderUploadModalOpen}
                              onOpenChange={setIsGiderUploadModalOpen}
                              onSuccess={handleGiderUploadSuccess}
                              uploadUrl="/api/giderler/upload"
                              title="Gider Excel Yükle"
                              description="Muhasebe gider kayıtlarını içeren Excel dosyasını yükleyin."
                              hideDateSelectors={true}
                              expectedHeaders={[
                                "Tarih",
                                "Firma Ünvan",
                                "Fatura No",
                                "Fatura Tutarı",
                                "Fatura KDV",
                                "Fatura Toplamı",
                                "Doviz",
                              ]}
                              previewColumns={[
                                { key: "Firma Ünvan", label: "Firma" },
                                { key: "Fatura No", label: "Fatura No" },
                                { key: "Fatura Tutarı", label: "Tutar", isNumeric: true },
                                { key: "Fatura KDV", label: "KDV", isNumeric: true },
                              ]}
                              templateFilename="gider-sablon.xlsx"
                              templateSheetName="Giderler"
                            />

                            <GiderEditModal
                              open={isEditModalOpen}
                              onOpenChange={setIsEditModalOpen}
                              gider={editingGider}
                              onSuccess={() => {
                                refetchGiderler();
                                refetchGiderStats();
                              }}
                            />
                          </TabsContent>

                          <TabsContent value="calisanlar" className="space-y-6">
                            <CalisanlarTabContent currentYear={currentYear} />
                          </TabsContent>
                        </Tabs>
                      </div>

                      <ExcelUploadModal
                        open={isUploadModalOpen}
                        onOpenChange={setIsUploadModalOpen}
                        onSuccess={handleUploadSuccess}
                      />
                    </div>
                    );
}

                    // Sub-component for Calisanlar Tab to keep main component clean
                    function CalisanlarTabContent({currentYear}: {currentYear: number }) {
  const [selectedAy, setSelectedAy] = useState<string>("1"); // Default January
                      const [selectedYil, setSelectedYil] = useState<string>(String(currentYear));

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("tr-TR", {
                          style: "currency",
                        currency: "TRY",
    }).format(value);
  };

                        // Fetch data
                        const {data: calisanlar, isLoading } = useQuery<any[]>({
                          queryKey: [`/api/calisanlar${selectedAy !== 'toplam' ? `?ay=${selectedAy}&yil=${selectedYil}` : `?ay=toplam&yil=${selectedYil}`}`],
  });

  // Aggregation Logic
  const branchStats = useMemo(() => {
    if (!calisanlar) return [];

                        const stats: Record<string, {
                          count: number;
                        brut: number;
                        net: number;
                        isverenPayi: number;
                        toplamMaliyet: number;
                        isciSgk: number;
    }> = { };

    calisanlar.forEach(p => {
      const sube = p.sube || "Merkez";
                        if (!stats[sube]) {
                          stats[sube] = { count: 0, brut: 0, net: 0, isverenPayi: 0, toplamMaliyet: 0, isciSgk: 0 };
      }

                        const brut = parseFloat(p.brutUcret || 0);
                        const net = parseFloat(p.netUcret || 0);
                        const isvSgk = parseFloat(p.isverenSgkPayi || 0);
                        const isvIss = parseFloat(p.isverenIssizlikPayi || 0);
                        const tomIsverenPayi = isvSgk + isvIss;

                        // Calculate total cost: Brüt + İşveren Payı
                        // We ignore the DB value if it's 0 or empty, forcing the calculation
                        const dbMaliyet = parseFloat(p.toplamIsverenMaliyeti || "0");
      const maliyet = dbMaliyet > 0 ? dbMaliyet : (brut + tomIsverenPayi);
                        const sigortaKesintisi = parseFloat(p.sigortaKesintisi || 0);

                        stats[sube].count += 1;
                        stats[sube].brut += brut;
                        stats[sube].net += net;
                        stats[sube].isverenPayi += tomIsverenPayi;
                        stats[sube].toplamMaliyet += maliyet;
                        stats[sube].isciSgk += sigortaKesintisi;
    });

    return Object.entries(stats).map(([name, val]) => ({name, ...val })).sort((a, b) => b.toplamMaliyet - a.toplamMaliyet);
  }, [calisanlar]);

  // Grand Totals
  const totalStats = useMemo(() => {
    return branchStats.reduce((acc, curr) => ({
                          count: acc.count + curr.count,
                        brut: acc.brut + curr.brut,
                        net: acc.net + curr.net,
                        isverenPayi: acc.isverenPayi + curr.isverenPayi,
                        toplamMaliyet: acc.toplamMaliyet + curr.toplamMaliyet,
                        isciSgk: acc.isciSgk + curr.isciSgk,
    }), {count: 0, brut: 0, net: 0, isverenPayi: 0, toplamMaliyet: 0, isciSgk: 0 });
  }, [branchStats]);

                        const aylar = [
                        {value: "1", label: "Ocak" }, {value: "2", label: "Şubat" }, {value: "3", label: "Mart" },
                        {value: "4", label: "Nisan" }, {value: "5", label: "Mayıs" }, {value: "6", label: "Haziran" },
                        {value: "7", label: "Temmuz" }, {value: "8", label: "Ağustos" }, {value: "9", label: "Eylül" },
                        {value: "10", label: "Ekim" }, {value: "11", label: "Kasım" }, {value: "12", label: "Aralık" }
                        ];

                        return (
                        <div className="space-y-6">
                          {/* Filters */}
                          <div className="flex flex-wrap items-center gap-4 bg-background/50 backdrop-blur-sm p-4 rounded-lg border shadow-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-muted-foreground">Dönem:</span>
                              <Select value={selectedAy} onValueChange={setSelectedAy}>
                                <SelectTrigger className="w-[140px] bg-background">
                                  <SelectValue placeholder="Ay Seçin" />
                                </SelectTrigger>
                                <SelectContent>
                                  {aylar.map(ay => (
                                    <SelectItem key={ay.value} value={ay.value}>{ay.label}</SelectItem>
                                  ))}
                                  <SelectItem value="toplam" className="font-bold border-t">Yıllık Toplam</SelectItem>
                                </SelectContent>
                              </Select>

                              <Select value={selectedYil} onValueChange={setSelectedYil}>
                                <SelectTrigger className="w-[100px] bg-background">
                                  <SelectValue placeholder="Yıl" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="2024">2024</SelectItem>
                                  <SelectItem value="2025">2025</SelectItem>
                                  <SelectItem value="2026">2026</SelectItem>
                                  <SelectItem value="2027">2027</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Warnings / Info */}
                          {isLoading && <div className="text-center py-10"><Loader2 className="animate-spin w-8 h-8 mx-auto text-primary" /></div>}

                          {!isLoading && branchStats.length === 0 && (
                            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                              Kayıt bulunamadı.
                            </div>
                          )}

                          {/* Summary Cards */}
                          {!isLoading && branchStats.length > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                              <Card>
                                <CardContent className="pt-6">
                                  <div className="text-xs font-semibold text-muted-foreground uppercase">Personel</div>
                                  <div className="text-2xl font-bold flex items-center gap-2">
                                    <Users className="w-5 h-5 text-primary" /> {totalStats.count}
                                  </div>
                                </CardContent>
                              </Card>
                              <Card>
                                <CardContent className="pt-6">
                                  <div className="text-xs font-semibold text-muted-foreground uppercase">Genel Brüt</div>
                                  <div className="text-lg font-bold text-blue-600">{formatCurrency(totalStats.brut)}</div>
                                </CardContent>
                              </Card>
                              <Card>
                                <CardContent className="pt-6">
                                  <div className="text-xs font-semibold text-muted-foreground uppercase">Genel Net</div>
                                  <div className="text-lg font-bold text-green-600">{formatCurrency(totalStats.net)}</div>
                                </CardContent>
                              </Card>
                              <Card>
                                <CardContent className="pt-6">
                                  <div className="text-xs font-semibold text-muted-foreground uppercase">İşçi SGK</div>
                                  <div className="text-lg font-bold text-orange-600">{formatCurrency(totalStats.isciSgk)}</div>
                                </CardContent>
                              </Card>
                              <Card>
                                <CardContent className="pt-6">
                                  <div className="text-xs font-semibold text-muted-foreground uppercase">İşveren SGK</div>
                                  <div className="text-lg font-bold text-purple-600">{formatCurrency(totalStats.isverenPayi)}</div>
                                </CardContent>
                              </Card>
                              <Card className="bg-primary/5 border-primary/20">
                                <CardContent className="pt-6">
                                  <div className="text-xs font-bold text-primary uppercase">Toplam Maliyet</div>
                                  <div className="text-lg font-black text-primary">{formatCurrency(totalStats.toplamMaliyet)}</div>
                                </CardContent>
                              </Card>
                            </div>
                          )}

                          {/* Branch Table */}
                          {!isLoading && branchStats.length > 0 && (
                            <Card>
                              <CardHeader>
                                <CardTitle>Şube Bazlı Dağılım</CardTitle>
                              </CardHeader>
                              <CardContent className="p-0">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-muted/50">
                                      <TableHead>Şube Adı</TableHead>
                                      <TableHead className="text-center">Personel</TableHead>
                                      <TableHead className="text-right">Brüt Ücret</TableHead>
                                      <TableHead className="text-right text-green-600 font-bold">Net Ücret</TableHead>
                                      <TableHead className="text-right">İşçi SGK Payı</TableHead>
                                      <TableHead className="text-right text-purple-600">İşveren SGK Payı</TableHead>
                                      <TableHead className="text-right text-primary font-black">Toplam Maliyet</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {branchStats.map(stat => (
                                      <TableRow key={stat.name} className="hover:bg-muted/30">
                                        <TableCell className="font-medium flex items-center gap-2">
                                          <Building2 className="w-4 h-4 text-muted-foreground" />
                                          {stat.name}
                                        </TableCell>
                                        <TableCell className="text-center">{stat.count}</TableCell>
                                        <TableCell className="text-right font-medium">{formatCurrency(stat.brut)}</TableCell>
                                        <TableCell className="text-right font-bold text-green-600">{formatCurrency(stat.net)}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(stat.isciSgk)}</TableCell>
                                        <TableCell className="text-right font-medium text-purple-600">{formatCurrency(stat.isverenPayi)}</TableCell>
                                        <TableCell className="text-right font-black text-primary bg-primary/5">{formatCurrency(stat.toplamMaliyet)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                  <TableFooter>
                                    <TableRow className="bg-muted font-bold">
                                      <TableCell>GENEL TOPLAM</TableCell>
                                      <TableCell className="text-center">{totalStats.count}</TableCell>
                                      <TableCell className="text-right">{formatCurrency(totalStats.brut)}</TableCell>
                                      <TableCell className="text-right text-green-700">{formatCurrency(totalStats.net)}</TableCell>
                                      <TableCell className="text-right">{formatCurrency(totalStats.isciSgk)}</TableCell>
                                      <TableCell className="text-right text-purple-700">{formatCurrency(totalStats.isverenPayi)}</TableCell>
                                      <TableCell className="text-right text-primary">{formatCurrency(totalStats.toplamMaliyet)}</TableCell>
                                    </TableRow>
                                  </TableFooter>
                                </Table>
                              </CardContent>
                            </Card>
                          )}
                        </div>
                        );
}

function TrendAnalysis() {
  const [churnMonths, setChurnMonths] = useState("2");
  const { data, isLoading } = useQuery<{ risingTrends: any[], fallingTrends: any[], alerts: any[], currentPeriodLabel: string }>({ 
    queryKey: [`/api/gumruk/analiz?churnMonths=${churnMonths}`] 
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.risingTrends && !data?.fallingTrends && !data?.alerts) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground border-2 border-dashed rounded-lg">
            <TrendingUp className="w-12 h-12 mb-4 opacity-50" />
            <p>Analiz verisi bulunamadı.</p>
        </div>
    )
  }

  const { alerts, risingTrends, fallingTrends, currentPeriodLabel } = data;
  
  // Sort Churn Alerts: Longest inactive time first
  const churnAlerts = alerts
    .filter((a: any) => a.type === 'churn_risk')
    .sort((a: any, b: any) => {
        // Extract month count from message "Son işlem: X ay önce"
        const getMonth = (msg: string) => {
            const match = msg.match(/(\d+)/);
            return match ? parseInt(match[0]) : 0;
        };
        return getMonth(b.message) - getMonth(a.message);
    });

  const newCustomerAlerts = alerts.filter((a: any) => a.type === 'new_customer');

  // Trend Table Component
  const TrendTable = ({ trends = [], isRising, defaultSortField = 'currentVol' }: { trends: any[], isRising: boolean, defaultSortField?: 'currentVol' | 'prevVol' }) => {
    const [sortField, setSortField] = useState<'currentVol' | 'prevVol' | 'growth' | 'absGrowth'>(defaultSortField);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const sortedTrends = [...trends].sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        return sortDirection === 'asc' ? valA - valB : valB - valA;
    });

    const handleSort = (field: 'currentVol' | 'prevVol' | 'growth' | 'absGrowth') => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };
    
    return (
    <Card>
        <CardContent className="p-0">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Firma</TableHead>
                        <TableHead className="text-right cursor-pointer hover:text-primary" onClick={() => handleSort('currentVol')}>
                             <div className="flex items-center justify-end gap-1">
                                Son Dönem Hacim ({currentPeriodLabel})
                                {sortField === 'currentVol' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                             </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:text-primary" onClick={() => handleSort('prevVol')}>
                             <div className="flex items-center justify-end gap-1">
                                Önceki Dönem
                                {sortField === 'prevVol' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                             </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:text-primary" onClick={() => handleSort('growth')}>
                             <div className="flex items-center justify-end gap-1">
                                Büyüme
                                {sortField === 'growth' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                             </div>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:text-primary" onClick={() => handleSort('absGrowth')}>
                             <div className="flex items-center justify-end gap-1">
                                Fark (TL)
                                {sortField === 'absGrowth' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                             </div>
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {!sortedTrends || sortedTrends.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8">Veri yok</TableCell></TableRow>
                    ) : sortedTrends.map((t: any, i: number) => (
                        <TableRow key={i}>
                            <TableCell className="font-medium">{t.company}</TableCell>
                            <TableCell className="text-right font-bold">{new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(t.currentVol)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(t.prevVol)}</TableCell>
                            <TableCell className="text-right">
                                <Badge variant={t.growth > 0 ? "secondary" : "destructive"} className={t.growth > 0 ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}>
                                    {t.growth > 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                                    %{t.growth.toFixed(1)}
                                </Badge>
                            </TableCell>
                            <TableCell className={`text-right font-medium ${t.absGrowth > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {t.absGrowth > 0 ? '+' : ''}{new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(t.absGrowth)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="risks" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="risks" className="gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Riskli Şirketler ({churnAlerts.length})
            </TabsTrigger>
            <TabsTrigger value="new" className="gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-500" />
                Yeni Şirketler ({newCustomerAlerts.length})
            </TabsTrigger>
            <TabsTrigger value="rising" className="gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                Yükselen Şirketler ve Trendler
            </TabsTrigger>
            <TabsTrigger value="falling" className="gap-2">
                <TrendingDown className="w-4 h-4 text-red-500" />
                Düşüşteki Şirketler ve Trendler
            </TabsTrigger>
        </TabsList>
        
        {/* RISKLI SIRKETLER */}
        <TabsContent value="risks" className="space-y-4 mt-6">
            <div className="flex items-center justify-between mb-4 bg-muted/30 p-4 rounded-lg border">
                <div>
                     <h3 className="text-lg font-semibold flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-500" /> 
                        Kaybetme Riski Olan Şirketler
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">Belirlenen süre boyunca işlem yapmayan eski müşteriler.</p>
                </div>
               
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium whitespace-nowrap">Risk Süresi (Ay):</span>
                    <Select value={churnMonths} onValueChange={setChurnMonths}>
                        <SelectTrigger className="w-[80px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="2">2</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                            <SelectItem value="4">4</SelectItem>
                            <SelectItem value="5">5</SelectItem>
                            <SelectItem value="6">6</SelectItem>
                            <SelectItem value="9">9</SelectItem>
                            <SelectItem value="12">12</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {churnAlerts.length === 0 ? (
                <div className="col-span-3 text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
                    <TrendingUp className="w-8 h-8 mb-2 mx-auto opacity-30" />
                    Belirlenen kriterlere uyan riskli şirket bulunamadı.
                </div>
            ) : (
                churnAlerts.map((alert: any, i: number) => (
                <Card key={i} className="border-l-4 border-l-red-500">
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                            <CardTitle className="text-base font-bold">{alert.company}</CardTitle>
                            <Badge variant="destructive">Risk</Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2 text-sm text-red-600 font-medium">
                            <AlertTriangle className="w-4 h-4" />
                            <span>{alert.message}</span>
                        </div>
                    </CardContent>
                </Card>
                ))
            )}
            </div>
        </TabsContent>

        {/* YENI SIRKETLER */}
        <TabsContent value="new" className="space-y-4 mt-6">
             <div className="mb-4 bg-muted/30 p-4 rounded-lg border">
                 <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-yellow-500" /> 
                    Portföye Yeni Katılanlar (Son 3 Ay)
                </h3>
            </div>
             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {newCustomerAlerts.length === 0 ? (
                 <div className="col-span-3 text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
                    Yeni müşteri bulunamadı.
                </div>
            ) : (
                newCustomerAlerts.map((alert: any, i: number) => (
                <Card key={i} className="border-l-4 border-l-green-500">
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                             <CardTitle className="text-base font-bold">{alert.company}</CardTitle>
                             <Badge className="bg-green-500 hover:bg-green-600">Yeni</Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                            <TrendingUp className="w-4 h-4" />
                            <span>{alert.message}</span>
                        </div>
                    </CardContent>
                </Card>
                ))
            )}
            </div>
        </TabsContent>

        {/* YUKSELEN TRENDLER */}
        <TabsContent value="rising" className="space-y-4 mt-6">
            <div className="mb-4 bg-muted/30 p-4 rounded-lg border">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-green-500" /> 
                    Yükselen Şirketler ve Trendler (Son 3 Ay)
                </h3>
                <p className="text-sm text-muted-foreground mt-1">İşlem hacmini en çok artıran şirketler.</p>
            </div>
            <TrendTable trends={risingTrends || []} isRising={true} defaultSortField="currentVol" />
        </TabsContent>

        {/* DUSUSTEKI TRENDLER */}
        <TabsContent value="falling" className="space-y-4 mt-6">
             <div className="mb-4 bg-muted/30 p-4 rounded-lg border">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-red-500" /> 
                    Düşüşteki Şirketler ve Trendler (Son 3 Ay)
                </h3>
                <p className="text-sm text-muted-foreground mt-1">İşlem hacmi en çok azalan şirketler.</p>
            </div>
            <TrendTable trends={fallingTrends || []} isRising={false} defaultSortField="prevVol" />
        </TabsContent>

      </Tabs>
    </div>
  );
}
