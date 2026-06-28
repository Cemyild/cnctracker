import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { type Calisan, type Gider, type GumrukVerisi, subeler } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatCurrencyFull, formatCurrencyShort, cn } from "@/lib/utils";
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
  Trash2,
  Calculator
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Download as DownloadIcon, X as XIcon } from "lucide-react";
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
  Cell,
  LabelList
} from "recharts";
import { ExcelUploadModal } from "@/components/ExcelUploadModal";
import { FinancialOverview } from "@/components/FinancialOverview";
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

        function getAyLabel(value: string): string {
  return aylar.find((a) => a.value === value)?.label || value;
}

// Tarihi dd/mm/yyyy formatına getirir. new Date(...) KULLANMAZ — timezone bug riskini önler.
// Kabul ettiği girdiler: "dd.mm.yyyy", "dd/mm/yyyy", "dd-mm-yyyy", "yyyy-mm-dd"
function formatTarihDisplay(value: string | null | undefined): string {
  if (!value) return "-";
  const s = String(value).trim();
  if (!s) return "-";
  const parts = s.split(/[.\/\-]/).map((p) => p.trim());
  if (parts.length !== 3) return s;
  const [a, b, c] = parts;
  const pad = (x: string) => (x.length === 1 ? `0${x}` : x);
  if (a.length === 4) {
    // yyyy-mm-dd
    return `${pad(c)}/${pad(b)}/${a}`;
  }
  // dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy
  return `${pad(a)}/${pad(b)}/${c}`;
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

        type OzetSummaryRow = {
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
        yonetimNetUcret?: number;
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
        const [selectedAy, setSelectedAy] = useState<string>(""); // Satışlar "Ay Bazlı Detay" filtresi
          const [selectedOzetAy, setSelectedOzetAy] = useState<string>("tum_yil"); // Özet tab ay filtresi (ayrı — Satışlar'a sızmasın)
          const [selectedYil, setSelectedYil] = useState<string>(String(currentYear));
            const [chartMetric, setChartMetric] = useState<ChartMetric>("satis");
              const [selectedFirma, setSelectedFirma] = useState<string>("");

                // Giderler States
                const [isGiderUploadModalOpen, setIsGiderUploadModalOpen] = useState(false);
                const [selectedGiderAy, setSelectedGiderAy] = useState<string>("toplam");
                  const [selectedGiderYil, setSelectedGiderYil] = useState<string>(String(currentYear));
                    const [sortConfig, setSortConfig] = useState<{ key: keyof Gider | 'tryTutar' | null; direction: 'asc' | 'desc' }>({key: 'tarih', direction: 'desc' });
                    const [editingGider, setEditingGider] = useState<Gider | null>(null);
                    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
                    const [clearMonthOpen, setClearMonthOpen] = useState(false);
                    const [undoTarget, setUndoTarget] = useState<{ id: string; filename: string; kayitSayisi: number } | null>(null);
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
                    const {data: ozetSummary, isLoading: ozetSummaryLoading } = useQuery<OzetSummaryRow[]>({
                      queryKey: [`/api/gumruk/ozet-summary/${selectedYil}`],
  });

                    // Geçen yıl ozet-summary — Özet KPI YoY delta'ları için
                    const {data: prevOzetSummary } = useQuery<OzetSummaryRow[]>({
                      queryKey: [`/api/gumruk/ozet-summary/${Number(selectedYil) - 1}`],
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

                    // Gider yükleme geçmişi (Upload history)
                    const { data: giderDosyalar, refetch: refetchGiderDosyalar } = useQuery<{
                      id: string;
                      filename: string;
                      uploadDate: string | null;
                      sizeBytes: number | null;
                      md5Hash: string | null;
                      kayitSayisi: number;
                      yillar: number[];
                      aylar: string[];
                    }[]>({
                      queryKey: ["/api/giderler/dosyalar", selectedGiderYil],
                      queryFn: async () => {
                        const r = await fetch(`/api/giderler/dosyalar?yil=${selectedGiderYil}`, { credentials: "include" });
                        if (!r.ok) throw new Error(`${r.status}`);
                        return r.json();
                      },
                      enabled: !!selectedGiderYil,
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
                    refetchGiderDosyalar();
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

                    // Çalışan (giriş elemanı) bazında kesilen fatura tutarı (seçili ay için)
                    // veriler zaten girisElemani + topFaturaTutar içeriyor → ekstra backend sorgusuna gerek yok.
                    const calisanFaturalari = veriler
                    ? Object.entries(
      veriler.reduce((acc, v) => {
        const calisan = v.girisElemani || "Bilinmeyen";
                    acc[calisan] = (acc[calisan] || 0) + parseFloat(v.topFaturaTutar || "0");
                    return acc;
      }, { } as Record<string, number>)
                    )
      .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
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

    const parseDate = (d: unknown): number => {
      if (d == null) return Number.NEGATIVE_INFINITY;
      const s = String(d).trim();
      if (!s) return Number.NEGATIVE_INFINITY;
      const parts = s.split(/[.\/\-]/).map((p) => p.trim());
      if (parts.length !== 3) return Number.NEGATIVE_INFINITY;
      let d1: number, m: number, y: number;
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        y = Number(parts[0]); m = Number(parts[1]); d1 = Number(parts[2]);
      } else {
        // dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy
        d1 = Number(parts[0]); m = Number(parts[1]); y = Number(parts[2]);
      }
      if (!y || !m || !d1) return Number.NEGATIVE_INFINITY;
      return new Date(y, m - 1, d1).getTime();
    };

    return [...giderler].sort((a, b) => {
      const aValue = a[sortConfig.key as keyof Gider];
      const bValue = b[sortConfig.key as keyof Gider];

      if (sortConfig.key === 'tarih') {
        const dateA = parseDate(aValue);
        const dateB = parseDate(bValue);
        return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
      }

      // Sayısal sütunlar (string olarak gelse de Number'a çevrilir)
      const NUMERIC_KEYS = new Set(['malBedeli', 'kdvTutari', 'toplamTutar', 'tryTutar']);
      if (NUMERIC_KEYS.has(String(sortConfig.key))) {
        const na = Number(aValue ?? 0);
        const nb = Number(bValue ?? 0);
        const sa = Number.isNaN(na) ? 0 : na;
        const sb = Number.isNaN(nb) ? 0 : nb;
        return sortConfig.direction === 'asc' ? sa - sb : sb - sa;
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      const sa = (aValue ?? '') as string | number;
      const sb = (bValue ?? '') as string | number;
      return sortConfig.direction === 'asc'
        ? String(sa).localeCompare(String(sb), 'tr', { numeric: true, sensitivity: 'base' })
        : String(sb).localeCompare(String(sa), 'tr', { numeric: true, sensitivity: 'base' });
    });
  }, [giderler, sortConfig]);

                    const SortIcon = ({column}: {column: keyof Gider | 'tryTutar' }) => {
    if (sortConfig.key !== column) return <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 opacity-40" />;
                    return sortConfig.direction === 'asc'
      ? <ArrowUp className="ml-1.5 h-3.5 w-3.5 text-primary" />
      : <ArrowDown className="ml-1.5 h-3.5 w-3.5 text-primary" />;
  };


                    return (
                    <div className="min-h-full bg-slate-50 dark:bg-background">
                      <div className="p-6 lg:p-8 space-y-6">
                        <Tabs defaultValue="ozet" className="w-full">
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
                            {/* Sticky filtre barı */}
                            <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-2 border-b border-border/70 bg-slate-50/85 px-6 py-4 backdrop-blur dark:bg-background/85 lg:-mx-8 lg:px-8">
                              <div className="flex flex-wrap items-end justify-between gap-4">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Gümrük · Özet · {selectedYil}</p>
                                  <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Finansal Özet</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-muted-foreground">Yıl</span>
                                    <Select value={selectedYil} onValueChange={setSelectedYil}>
                                      <SelectTrigger className="w-[110px]"><SelectValue placeholder="Yıl" /></SelectTrigger>
                                      <SelectContent>
                                        {yillar.map((yil) => (<SelectItem key={yil} value={String(yil)}>{yil}</SelectItem>))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-muted-foreground">Ay</span>
                                    <Select value={selectedOzetAy} onValueChange={setSelectedOzetAy}>
                                      <SelectTrigger className="w-[130px]"><SelectValue placeholder="Tüm Yıl" /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="tum_yil">Tüm Yıl</SelectItem>
                                        {aylar.map((ay) => (<SelectItem key={ay.value} value={ay.value}>{ay.label}</SelectItem>))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
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
                                  prevData={prevOzetSummary}
                                  year={selectedYil}
                                  selectedMonth={selectedOzetAy === "tum_yil" || selectedOzetAy === "" ? undefined : selectedOzetAy}
                                />

                                {/* Satışlar Section */}
                                <Card>
                                  <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
                                      <span className="h-2 w-2 rounded-[2px]" style={{ background: "#059669" }} />
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
                                            <TableCell className="text-right">{formatCurrencyFull(item.satisKdvHaric)}</TableCell>
                                            <TableCell className="text-right">{formatCurrencyFull(item.satisKdv)}</TableCell>
                                            <TableCell className="text-right font-bold">{formatCurrencyFull(item.satisToplam)}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                      <TableFooter>
                                        <TableRow>
                                          <TableCell className="font-bold">TOPLAM</TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrencyFull(ozetSummary.reduce((sum, item) => sum + item.satisKdvHaric, 0))}
                                          </TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrencyFull(ozetSummary.reduce((sum, item) => sum + item.satisKdv, 0))}
                                          </TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrencyFull(ozetSummary.reduce((sum, item) => sum + item.satisToplam, 0))}
                                          </TableCell>
                                        </TableRow>
                                      </TableFooter>
                                    </Table>
                                  </CardContent>
                                </Card>

                                {/* Giderler Section */}
                                <Card>
                                  <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
                                      <span className="h-2 w-2 rounded-[2px]" style={{ background: "#e11d48" }} />
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
                                            <TableCell className="text-right">{formatCurrencyFull(item.giderKdvHaric)}</TableCell>
                                            <TableCell className="text-right">{formatCurrencyFull(item.giderKdv)}</TableCell>
                                            <TableCell className="text-right font-bold">{formatCurrencyFull(item.giderToplam)}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                      <TableFooter>
                                        <TableRow>
                                          <TableCell className="font-bold">TOPLAM</TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrencyFull(ozetSummary.reduce((sum, item) => sum + item.giderKdvHaric, 0))}
                                          </TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrencyFull(ozetSummary.reduce((sum, item) => sum + item.giderKdv, 0))}
                                          </TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrencyFull(ozetSummary.reduce((sum, item) => sum + item.giderToplam, 0))}
                                          </TableCell>
                                        </TableRow>
                                      </TableFooter>
                                    </Table>
                                  </CardContent>
                                </Card>

                                {/* Çalışanlar Section */}
                                <Card>
                                  <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
                                      <span className="h-2 w-2 rounded-[2px]" style={{ background: "#7c3aed" }} />
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
                                            <TableCell className="text-right">{formatCurrencyFull(item.calisanBrut)}</TableCell>
                                            <TableCell className="text-right">{formatCurrencyFull(item.calisanNet)}</TableCell>
                                            <TableCell className="text-right">{formatCurrencyFull(item.calisanIsverenSgk)}</TableCell>
                                            <TableCell className="text-right font-bold">{formatCurrencyFull(item.calisanMaliyet)}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                      <TableFooter>
                                        <TableRow>
                                          <TableCell className="font-bold">TOPLAM</TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrencyFull(ozetSummary.reduce((sum, item) => sum + item.calisanBrut, 0))}
                                          </TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrencyFull(ozetSummary.reduce((sum, item) => sum + item.calisanNet, 0))}
                                          </TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrencyFull(ozetSummary.reduce((sum, item) => sum + item.calisanIsverenSgk, 0))}
                                          </TableCell>
                                          <TableCell className="text-right font-bold">
                                            {formatCurrencyFull(ozetSummary.reduce((sum, item) => sum + item.calisanMaliyet, 0))}
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
                            <ExcelUploadModal
                              open={isUploadModalOpen}
                              onOpenChange={setIsUploadModalOpen}
                              onSuccess={handleUploadSuccess}
                            />

                            {/* Sticky Filtre Barı */}
                            <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-2 border-b border-border/70 bg-slate-50/85 px-6 py-4 backdrop-blur dark:bg-background/85 lg:-mx-8 lg:px-8">
                              <div className="flex flex-wrap items-end justify-between gap-4">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Gümrük · Satışlar · {selectedYil}
                                  </p>
                                  <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Satış Performansı</h2>
                                </div>
                                <div className="flex items-center gap-2.5">
                                  <Select value={selectedYil} onValueChange={setSelectedYil}>
                                    <SelectTrigger className="w-[110px]" data-testid="select-satis-yil">
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
                                  <button
                                    type="button"
                                    onClick={() => setIsUploadModalOpen(true)}
                                    className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                                    data-testid="button-open-upload"
                                  >
                                    <Upload className="h-4 w-4" />
                                    Excel Yükle
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* KPI Bar */}
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                              {[
                                { label: "Yıllık Toplam Satış", accent: "#0ea5e9", value: formatCurrencyFull(genelStats?.toplamSatis ?? 0), hint: "KDV dahil", testid: "text-yillik-satis" },
                                { label: "Yıllık Toplam KDV", accent: "#d97706", value: formatCurrencyFull(genelStats?.toplamKdv ?? 0), hint: "indirilecek", testid: "text-yillik-kdv" },
                                { label: "Toplam Dosya", accent: "#7c3aed", value: (genelStats?.toplamDosya ?? 0).toLocaleString("tr-TR"), hint: "işlem adedi", testid: "text-yillik-dosya" },
                                { label: "Aylık Ortalama", accent: "#059669", value: formatCurrencyFull(genelStats?.aylikOrtalama ?? 0), hint: "satış", testid: "text-aylik-ortalama" },
                              ].map((kpi) => (
                                <div
                                  key={kpi.label}
                                  className="relative overflow-hidden rounded-[14px] border bg-card p-5"
                                >
                                  <div
                                    className="absolute left-0 top-0 h-full w-[3px]"
                                    style={{ background: kpi.accent }}
                                  />
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {kpi.label}
                                  </p>
                                  <p className="mt-2.5 text-[26px] font-extrabold tabular-nums leading-tight" data-testid={kpi.testid}>
                                    {ozetLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : kpi.value}
                                  </p>
                                  <p className="mt-2 text-[11px] font-medium text-muted-foreground">{kpi.hint}</p>
                                </div>
                              ))}
                            </div>

                            {/* Dinamik Grafik */}
                            <div className="rounded-[14px] border bg-card p-5">
                              <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <h3 className="text-[15px] font-bold">
                                    {chartMetric === "satis"
                                      ? "Aylık Satış (KDV Hariç)"
                                      : chartMetric === "kdv"
                                        ? "Aylık Toplam KDV"
                                        : "Aylık Dosya Sayısı"}
                                  </h3>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {selectedYil} · {chartMetric === "dosya" ? "işlem adedi" : "değerler ₺M"}
                                  </p>
                                </div>
                                {/* Segmented control */}
                                <div className="inline-flex rounded-lg bg-muted p-1">
                                  {[
                                    { key: "satis", label: "Satış" },
                                    { key: "kdv", label: "KDV" },
                                    { key: "dosya", label: "Dosya" },
                                  ].map((m) => (
                                    <button
                                      key={m.key}
                                      type="button"
                                      onClick={() => {
                                        setChartMetric(m.key as ChartMetric);
                                        setSelectedFirma("");
                                      }}
                                      className={cn(
                                        "rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                                        chartMetric === m.key
                                          ? "bg-white text-foreground shadow-sm dark:bg-background"
                                          : "text-muted-foreground hover:text-foreground"
                                      )}
                                      data-testid={`button-metric-${m.key}`}
                                    >
                                      {m.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {ozetLoading ? (
                                <div className="flex h-[300px] items-center justify-center">
                                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                              ) : chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={320}>
                                  <BarChart data={chartData} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                                    <XAxis
                                      dataKey="ay"
                                      tickFormatter={(v: string) => String(v).slice(0, 3)}
                                      className="fill-muted-foreground text-xs"
                                      tick={{ fontSize: 11 }}
                                      tickLine={false}
                                      axisLine={false}
                                    />
                                    <YAxis
                                      tickFormatter={(v: number) =>
                                        chartMetric === "dosya" ? String(v) : formatCurrencyShort(v)
                                      }
                                      className="fill-muted-foreground text-xs"
                                      tick={{ fontSize: 11 }}
                                      width={56}
                                      tickLine={false}
                                      axisLine={false}
                                    />
                                    <Tooltip
                                      formatter={(value: number) =>
                                        chartMetric === "dosya"
                                          ? [value, "Dosya"]
                                          : [formatCurrencyFull(value), chartMetric === "kdv" ? "KDV" : "Satış"]
                                      }
                                      labelStyle={{ color: "var(--foreground)" }}
                                      contentStyle={{
                                        backgroundColor: "hsl(var(--card))",
                                        border: "1px solid hsl(var(--border))",
                                        borderRadius: "var(--radius)",
                                      }}
                                      cursor={{ fill: "rgba(0,0,0,0.05)" }}
                                    />
                                    <Bar dataKey="deger" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={28}>
                                      <LabelList
                                        dataKey="deger"
                                        position="top"
                                        formatter={(value: number) =>
                                          chartMetric === "dosya" ? String(value) : formatCurrencyShort(value)
                                        }
                                        style={{ fontSize: 10.5, fontWeight: 700, fill: "#0369a1" }}
                                      />
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                              ) : (
                                <div className="flex h-[300px] flex-col items-center justify-center text-muted-foreground">
                                  <BarChart3 className="mb-2 h-12 w-12" />
                                  <p>{selectedYil} yılına ait veri bulunamadı</p>
                                </div>
                              )}
                            </div>

                            {/* Gelişmiş Grafik Analizi (mevcut AdvancedChart — README kart #4: çok-serili, çift eksenli) */}
                            <AdvancedChart selectedYil={selectedYil} />

                            {/* Ay Bazlı Detay */}
                            <div className="rounded-[14px] border bg-card p-5">
                              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <h3 className="text-[15px] font-bold">Ay Bazlı Detay</h3>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-muted-foreground">Ay</span>
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
                                </div>
                              </div>

                              {!ayStats ? (
                                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                                  <FileSpreadsheet className="mb-2 h-12 w-12" />
                                  <p>Detay için ay seçin</p>
                                </div>
                              ) : (
                                <>
                                  {/* 4 mini-stat */}
                                  <div className="mb-5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
                                    {[
                                      { label: "Toplam Fatura", value: formatCurrencyFull(ayStats?.toplamFatura ?? 0), testid: "text-toplam-fatura" },
                                      { label: "Toplam KDV", value: formatCurrencyFull(ayStats?.toplamKdv ?? 0), testid: "text-toplam-kdv" },
                                      { label: "Dosya Sayısı", value: (ayStats?.dosyaSayisi ?? 0).toLocaleString("tr-TR"), testid: "text-dosya-sayisi" },
                                      { label: "Müşteri Sayısı", value: (ayStats?.musteriSayisi ?? 0).toLocaleString("tr-TR"), testid: "text-musteri-sayisi" },
                                    ].map((s) => (
                                      <div key={s.label} className="rounded-xl border bg-slate-50 p-3.5 dark:bg-muted/40">
                                        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                                          {s.label}
                                        </p>
                                        <p className="mt-1.5 text-xl font-extrabold tabular-nums" data-testid={s.testid}>
                                          {s.value}
                                        </p>
                                      </div>
                                    ))}
                                  </div>

                                  {/* 3 bar-listesi */}
                                  <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                                    {/* En Çok Ciro Yapan Müşteriler */}
                                    <div>
                                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        En Çok Ciro Yapan Müşteriler
                                      </p>
                                      <div className="flex flex-col gap-2.5">
                                        {musteriCirolari.length === 0 ? (
                                          <p className="text-xs text-muted-foreground">Veri yok</p>
                                        ) : (
                                          (() => {
                                            const maxV = Math.max(...musteriCirolari.map(([, v]) => v), 1);
                                            return musteriCirolari.map(([ad, tutar], i) => (
                                              <div key={`${ad}-${i}`} className="flex items-center gap-2.5">
                                                <span className="w-24 flex-none truncate text-[12.5px] font-semibold text-slate-700 dark:text-foreground" title={ad}>
                                                  {ad}
                                                </span>
                                                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                                  <span
                                                    className="block h-full rounded-full bg-sky-500"
                                                    style={{ width: `${Math.max((tutar / maxV) * 100, 8)}%` }}
                                                  />
                                                </span>
                                                <span className="flex-none text-[12.5px] font-bold tabular-nums">
                                                  {formatCurrencyFull(tutar)}
                                                </span>
                                              </div>
                                            ));
                                          })()
                                        )}
                                      </div>
                                    </div>

                                    {/* Çalışan Bazında Dosya Sayıları */}
                                    <div>
                                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        Çalışan Bazında Dosya Sayıları
                                      </p>
                                      <div className="flex flex-col gap-2.5">
                                        {calisanDosyalari.length === 0 ? (
                                          <p className="text-xs text-muted-foreground">Veri yok</p>
                                        ) : (
                                          (() => {
                                            const list = calisanDosyalari.slice(0, 5);
                                            const maxV = Math.max(...list.map(([, v]) => v), 1);
                                            return list.map(([ad, adet], i) => (
                                              <div key={`${ad}-${i}`} className="flex items-center gap-2.5">
                                                <span className="w-24 flex-none truncate text-[12.5px] font-semibold text-slate-700 dark:text-foreground" title={ad}>
                                                  {ad}
                                                </span>
                                                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                                  <span
                                                    className="block h-full rounded-full bg-violet-500"
                                                    style={{ width: `${Math.max((adet / maxV) * 100, 8)}%` }}
                                                  />
                                                </span>
                                                <span className="flex-none text-[12.5px] font-bold tabular-nums">
                                                  {adet}
                                                </span>
                                              </div>
                                            ));
                                          })()
                                        )}
                                      </div>
                                    </div>

                                    {/* Çalışan Bazında Kesilen Fatura */}
                                    <div>
                                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        Çalışan Bazında Kesilen Fatura
                                      </p>
                                      <div className="flex flex-col gap-2.5">
                                        {calisanFaturalari.length === 0 ? (
                                          <p className="text-xs text-muted-foreground">Veri yok</p>
                                        ) : (
                                          (() => {
                                            const maxV = Math.max(...calisanFaturalari.map(([, v]) => v), 1);
                                            return calisanFaturalari.map(([ad, tutar], i) => (
                                              <div key={`${ad}-${i}`} className="flex items-center gap-2.5">
                                                <span className="w-24 flex-none truncate text-[12.5px] font-semibold text-slate-700 dark:text-foreground" title={ad}>
                                                  {ad}
                                                </span>
                                                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                                  <span
                                                    className="block h-full rounded-full bg-amber-500"
                                                    style={{ width: `${Math.max((tutar / maxV) * 100, 8)}%` }}
                                                  />
                                                </span>
                                                <span className="flex-none text-[12.5px] font-bold tabular-nums">
                                                  {formatCurrencyFull(tutar)}
                                                </span>
                                              </div>
                                            ));
                                          })()
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Yükleme Geçmişi */}
                            <div className="rounded-[14px] border bg-card p-5">
                              <h3 className="mb-3.5 flex items-center gap-2 text-[15px] font-bold">
                                <History className="h-4 w-4 text-muted-foreground" />
                                Yükleme Geçmişi
                              </h3>
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse text-[13px]">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="px-2.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Tarih</th>
                                      <th className="px-2.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Dosya Adı</th>
                                      <th className="px-2.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Dönem</th>
                                      <th className="px-2.5 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Boyut</th>
                                      <th className="px-2.5 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Kayıt</th>
                                      <th className="px-2.5 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">İşlem</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {!dosyalar || dosyalar.length === 0 ? (
                                      <tr>
                                        <td colSpan={6} className="py-8 text-center text-muted-foreground">
                                          Henüz yükleme yok
                                        </td>
                                      </tr>
                                    ) : (
                                      dosyalar.map((d) => {
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
                                          <tr key={d.id} className="border-b border-border/60" data-testid={`row-dosya-${d.id}`}>
                                            <td className="px-2.5 py-2.5 tabular-nums text-muted-foreground">{tarih}</td>
                                            <td className="px-2.5 py-2.5 font-medium" title={d.filename}>{fname}</td>
                                            <td className="px-2.5 py-2.5 text-muted-foreground">{donem}</td>
                                            <td className="px-2.5 py-2.5 text-right tabular-nums text-muted-foreground">{boyut}</td>
                                            <td className="px-2.5 py-2.5 text-right tabular-nums">{d.kayitSayisi}</td>
                                            <td className="px-2.5 py-2.5 text-right">
                                              <button
                                                type="button"
                                                onClick={onGeriAl}
                                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700"
                                                data-testid={`button-geri-al-${d.id}`}
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                                Geri Al
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="giderler" className="space-y-6">
                            <div className="flex flex-col gap-6">

                              {/* Sticky Filtre Barı */}
                              <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-2 border-b border-border/70 bg-slate-50/85 px-6 py-4 backdrop-blur dark:bg-background/85 lg:-mx-8 lg:px-8">
                                <div className="flex flex-wrap items-end justify-between gap-4">
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      Gümrük · Giderler · {selectedGiderYil}
                                    </p>
                                    <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Gider Yönetimi</h2>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2.5">
                                    <Select value={selectedGiderAy} onValueChange={setSelectedGiderAy}>
                                      <SelectTrigger className="w-[160px]" data-testid="select-gider-ay">
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
                                      <SelectTrigger className="w-[110px]" data-testid="select-gider-yil">
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

                                    {selectedGiderAy !== "toplam" && (
                                      <button
                                        type="button"
                                        onClick={() => setClearMonthOpen(true)}
                                        className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-900/60 dark:bg-transparent dark:hover:bg-rose-950/30"
                                        data-testid="button-gider-temizle"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        Bu Ay'ı Temizle
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => setIsGiderUploadModalOpen(true)}
                                      className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                                      data-testid="button-gider-upload"
                                    >
                                      <Upload className="h-4 w-4" />
                                      Gider Excel Yükle
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* KPI Bar */}
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                                {[
                                  { label: "Toplam Fatura Adet", accent: "#7c3aed", value: (giderStats?.toplamCount ?? 0).toLocaleString("tr-TR"), hint: "kayıt", testid: "text-gider-count" },
                                  { label: "Mal Bedeli (KDV Hariç)", accent: "#0ea5e9", value: formatCurrencyFull(giderStats?.toplamMalBedeli ?? 0), hint: "döviz TRY'ye çevrilmeden", testid: "text-gider-malbedeli" },
                                  { label: "Toplam KDV", accent: "#d97706", value: formatCurrencyFull(giderStats?.toplamKdv ?? 0), hint: "indirilecek", testid: "text-gider-kdv" },
                                  { label: "Toplam Tutar (TRY)", accent: "#e11d48", value: formatCurrencyFull(giderStats?.toplamTryTutar ?? 0), hint: "döviz dahil TRY karşılığı", testid: "text-gider-try" },
                                ].map((kpi) => (
                                  <div
                                    key={kpi.label}
                                    className="relative overflow-hidden rounded-[14px] border bg-card p-5"
                                  >
                                    <div
                                      className="absolute left-0 top-0 h-full w-[3px]"
                                      style={{ background: kpi.accent }}
                                    />
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      {kpi.label}
                                    </p>
                                    <p className="mt-2.5 text-[26px] font-extrabold tabular-nums leading-tight" data-testid={kpi.testid}>
                                      {giderStatsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : kpi.value}
                                    </p>
                                    <p className="mt-2 text-[11px] font-medium text-muted-foreground">{kpi.hint}</p>
                                  </div>
                                ))}
                              </div>

                              {/* Gider Listesi */}
                              <div className="overflow-hidden rounded-[14px] border bg-card">
                                <div className="flex items-center justify-between border-b px-5 py-4">
                                  <h3 className="text-[15px] font-bold">Gider Listesi</h3>
                                  <span className="text-[12.5px] tabular-nums text-muted-foreground">
                                    {sortedGiderler?.length ?? 0} kayıt
                                  </span>
                                </div>
                                <div className="max-h-[70vh] overflow-x-auto">
                                  <Table className="w-full whitespace-nowrap text-[12.5px]">
                                    <TableHeader className="sticky top-0 z-[5] bg-slate-50 dark:bg-muted">
                                      <TableRow className="border-b hover:bg-transparent">
                                        <TableHead onClick={() => handleSort('tarih')} className="h-9 cursor-pointer select-none px-2.5 text-[10.5px] font-semibold uppercase text-muted-foreground hover:text-foreground">
                                          <div className="flex items-center">Tarih <SortIcon column="tarih" /></div>
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('firma')} className="h-9 cursor-pointer select-none px-2.5 text-[10.5px] font-semibold uppercase text-muted-foreground hover:text-foreground">
                                          <div className="flex items-center">Firma <SortIcon column="firma" /></div>
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('faturaNo')} className="h-9 cursor-pointer select-none px-2.5 text-[10.5px] font-semibold uppercase text-muted-foreground hover:text-foreground">
                                          <div className="flex items-center">Fatura No <SortIcon column="faturaNo" /></div>
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('malBedeli')} className="h-9 cursor-pointer select-none px-2.5 text-right text-[10.5px] font-semibold uppercase text-muted-foreground hover:text-foreground">
                                          <div className="flex items-center justify-end">Mal Bedeli <SortIcon column="malBedeli" /></div>
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('kdvTutari')} className="h-9 cursor-pointer select-none px-2.5 text-right text-[10.5px] font-semibold uppercase text-muted-foreground hover:text-foreground">
                                          <div className="flex items-center justify-end">KDV <SortIcon column="kdvTutari" /></div>
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('toplamTutar')} className="h-9 cursor-pointer select-none px-2.5 text-right text-[10.5px] font-semibold uppercase text-muted-foreground hover:text-foreground">
                                          <div className="flex items-center justify-end">Toplam <SortIcon column="toplamTutar" /></div>
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('paraBirimi')} className="h-9 cursor-pointer select-none px-2.5 text-[10.5px] font-semibold uppercase text-muted-foreground hover:text-foreground">
                                          <div className="flex items-center">Brm <SortIcon column="paraBirimi" /></div>
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('tryTutar')} className="h-9 cursor-pointer select-none px-2.5 text-right text-[10.5px] font-semibold uppercase text-muted-foreground hover:text-foreground">
                                          <div className="flex items-center justify-end">TRY Tutar <SortIcon column="tryTutar" /></div>
                                        </TableHead>
                                        <TableHead className="h-9 px-2.5 text-[10.5px] font-semibold uppercase text-muted-foreground">Şube</TableHead>
                                        <TableHead className="h-9 px-2.5 text-[10.5px] font-semibold uppercase text-muted-foreground">Kategori</TableHead>
                                        <TableHead className="h-9 px-2.5 text-[10.5px] font-semibold uppercase text-muted-foreground">Plaka</TableHead>
                                        <TableHead className="h-9 w-[40px] px-1.5"></TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {giderlerLoading ? (
                                        <TableRow>
                                          <TableCell colSpan={12} className="py-12 text-center">
                                            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                                          </TableCell>
                                        </TableRow>
                                      ) : giderlerError ? (
                                        <TableRow>
                                          <TableCell colSpan={12} className="py-12 text-center text-destructive">
                                            Veriler yüklenirken hata oluştu. <button className="underline" onClick={() => refetchGiderler()}>Tekrar dene</button>
                                          </TableCell>
                                        </TableRow>
                                      ) : sortedGiderler?.length === 0 ? (
                                        <TableRow>
                                          <TableCell colSpan={12} className="py-12 text-center text-muted-foreground">
                                            Kayıt bulunamadı
                                          </TableCell>
                                        </TableRow>
                                      ) : (
                                        sortedGiderler?.map((gider, idx) => (
                                          <TableRow
                                            key={gider.id}
                                            className={`${idx % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-slate-50 dark:bg-muted/30'} border-b transition-colors hover:bg-accent/50`}
                                          >
                                            <TableCell className="px-2.5 py-1.5 font-medium tabular-nums">{formatTarihDisplay(gider.tarih)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 font-medium" title={gider.firma ?? undefined}>{gider.firma}</TableCell>
                                            <TableCell className="max-w-[140px] truncate px-2.5 py-1.5 text-muted-foreground" title={gider.faturaNo ?? undefined}>{gider.faturaNo}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{formatCurrencyFull(gider.malBedeli)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{formatCurrencyFull(gider.kdvTutari)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right tabular-nums">{formatCurrencyFull(gider.toplamTutar)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-muted-foreground">{gider.paraBirimi}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right font-bold tabular-nums">{formatCurrencyFull(gider.tryTutar)}</TableCell>
                                            <TableCell className="px-1.5 py-1">
                                              <Select
                                                value={gider.sube ?? ""}
                                                onValueChange={(val) => handleInlineUpdate(gider.id, 'sube', val)}
                                              >
                                                <SelectTrigger className="h-7 w-full max-w-[120px] px-2 text-[11.5px]">
                                                  <SelectValue placeholder="Seçiniz" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {subeler.map((s) => (
                                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </TableCell>
                                            <TableCell className="px-1.5 py-1">
                                              <Select
                                                value={gider.kategori ?? ""}
                                                onValueChange={(val) => {
                                                  handleInlineUpdate(gider.id, 'kategori', val);
                                                  if (!ARAC_KATEGORILERI.includes(val)) {
                                                    handleInlineUpdate(gider.id, 'plaka', null);
                                                  }
                                                }}
                                              >
                                                <SelectTrigger className="h-7 w-full max-w-[140px] px-2 text-[11.5px]">
                                                  <SelectValue placeholder="Seçiniz" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {categories?.map((c) => (
                                                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </TableCell>
                                            <TableCell className="px-1.5 py-1">
                                              {ARAC_KATEGORILERI.includes(gider.kategori || "") ? (
                                                <Select
                                                  value={gider.plaka ?? ""}
                                                  onValueChange={(val) => handleInlineUpdate(gider.id, 'plaka', val)}
                                                >
                                                  <SelectTrigger className="h-7 w-full px-2 text-[11.5px]">
                                                    <SelectValue placeholder="Plaka" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    {araclar?.map((a) => (
                                                      <SelectItem key={a.id} value={a.plaka}>{a.plaka}</SelectItem>
                                                    ))}
                                                  </SelectContent>
                                                </Select>
                                              ) : (
                                                <span className="text-muted-foreground">—</span>
                                              )}
                                            </TableCell>
                                            <TableCell className="px-1.5 py-1 text-center">
                                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingGider(gider); setIsEditModalOpen(true); }} data-testid={`button-gider-edit-${gider.id}`}>
                                                <Pencil className="h-3.5 w-3.5" />
                                              </Button>
                                            </TableCell>
                                          </TableRow>
                                        ))
                                      )}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>

                              {/* Yükleme Geçmişi */}
                              <div className="rounded-[14px] border bg-card p-5">
                                <h3 className="mb-3.5 flex items-center gap-2 text-[15px] font-bold">
                                  <History className="h-4 w-4 text-muted-foreground" />
                                  Yükleme Geçmişi
                                </h3>
                                {giderDosyalar?.length === 0 ? (
                                  <p className="py-8 text-center text-sm text-muted-foreground">Henüz yükleme yok</p>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="border-b hover:bg-transparent">
                                          <TableHead className="px-2.5 text-[10.5px] font-semibold uppercase text-muted-foreground">Tarih</TableHead>
                                          <TableHead className="px-2.5 text-[10.5px] font-semibold uppercase text-muted-foreground">Dosya Adı</TableHead>
                                          <TableHead className="px-2.5 text-[10.5px] font-semibold uppercase text-muted-foreground">Dönem</TableHead>
                                          <TableHead className="px-2.5 text-right text-[10.5px] font-semibold uppercase text-muted-foreground">Kayıt</TableHead>
                                          <TableHead className="px-2.5 text-right text-[10.5px] font-semibold uppercase text-muted-foreground">İşlem</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {giderDosyalar?.map((d) => {
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
                                          return (
                                            <TableRow key={d.id} className="border-b" data-testid={`row-gider-dosya-${d.id}`}>
                                              <TableCell className="px-2.5 tabular-nums text-muted-foreground">{tarih}</TableCell>
                                              <TableCell className="px-2.5 font-medium" title={d.filename}>{fname}</TableCell>
                                              <TableCell className="px-2.5 text-muted-foreground">{donem}</TableCell>
                                              <TableCell className="px-2.5 text-right tabular-nums">{d.kayitSayisi}</TableCell>
                                              <TableCell className="px-2.5 text-right">
                                                <button
                                                  type="button"
                                                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-rose-600 transition-colors hover:text-rose-700"
                                                  onClick={() => setUndoTarget({ id: d.id, filename: d.filename, kayitSayisi: d.kayitSayisi })}
                                                  data-testid={`button-gider-geri-al-${d.id}`}
                                                >
                                                  <Trash2 className="h-3.5 w-3.5" />
                                                  Geri Al
                                                </button>
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}
                              </div>

                            </div>

                            {/* Bu Ay'ı Temizle onayı */}
                            <AlertDialog open={clearMonthOpen} onOpenChange={setClearMonthOpen}>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Bu Ay'ı Temizle</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {`${aylar.find(a => a.value === selectedGiderAy)?.label || selectedGiderAy} ${selectedGiderYil} ayına ait TÜM gider kayıtları silinecek. Bu işlem geri alınamaz.`}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>İptal</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-rose-600 text-white hover:bg-rose-700"
                                    onClick={async () => {
                                      const ayLabel = aylar.find(a => a.value === selectedGiderAy)?.label || selectedGiderAy;
                                      try {
                                        const r = await fetch(`/api/giderler?ay=${selectedGiderAy}&yil=${selectedGiderYil}`, {
                                          method: "DELETE",
                                          credentials: "include",
                                        });
                                        if (!r.ok) {
                                          toast({ title: "Hata", description: "Silinemedi", variant: "destructive" });
                                          return;
                                        }
                                        toast({ title: "Başarılı", description: `${ayLabel} ${selectedGiderYil} kayıtları silindi` });
                                        refetchGiderler();
                                        refetchGiderStats();
                                      } catch {
                                        toast({ title: "Hata", description: "Bağlantı hatası", variant: "destructive" });
                                      }
                                    }}
                                    data-testid="button-gider-temizle-onay"
                                  >
                                    Temizle
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>

                            {/* Geri Al onayı */}
                            <AlertDialog open={undoTarget !== null} onOpenChange={(open) => { if (!open) setUndoTarget(null); }}>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Yüklemeyi Geri Al</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {undoTarget ? `Bu yükleme silindiğinde ${undoTarget.kayitSayisi} satır gider kaydı da silinecek. Emin misiniz?` : ""}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>İptal</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-rose-600 text-white hover:bg-rose-700"
                                    onClick={async () => {
                                      if (!undoTarget) return;
                                      const r = await fetch(`/api/giderler/dosyalar/${undoTarget.id}`, { method: "DELETE", credentials: "include" });
                                      if (!r.ok) {
                                        toast({ title: "Hata", description: "Silinemedi", variant: "destructive" });
                                        return;
                                      }
                                      toast({ title: "Başarılı", description: "Yükleme geri alındı" });
                                      refetchGiderDosyalar();
                                      refetchGiderler();
                                      refetchGiderStats();
                                    }}
                                    data-testid="button-gider-geri-al-onay"
                                  >
                                    Geri Al
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>


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

// CSV satırlarını Türkçe Excel uyumlu (UTF-8 BOM + ; ayraç) string'e çevir.
// Excel TR locale otomatik tanır, çift tırnak içindeki virgül/yeni satır kaçar.
function toCsv(rows: (string | number | null | undefined)[][], headers: string[]): string {
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(";") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escape).join(";")];
  for (const row of rows) lines.push(row.map(escape).join(";"));
  return "﻿" + lines.join("\r\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Firma drill-down dialog: aylık hacim + işlem grafiği
function FirmaTimelineDialog({ firma, onClose }: { firma: string | null; onClose: () => void }) {
  const open = !!firma;
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/gumruk/firma-timeline?firma=${encodeURIComponent(firma || "")}`],
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[1100px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            {firma}
          </DialogTitle>
          <DialogDescription>Aylık işlem hacmi ve sayısı</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : !data || data.timeline?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Bu firma için kayıt yok.</div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Üst özet */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">Toplam Hacim (KDV hariç)</div>
                <div className="text-lg font-bold tabular-nums text-primary">
                  {new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(data.toplamHacim)}
                </div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">Toplam İşlem</div>
                <div className="text-lg font-bold tabular-nums">{data.toplamIslem}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">İlk İşlem</div>
                <div className="text-sm font-semibold">{data.ilkIslem || "-"}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">Son İşlem</div>
                <div className="text-sm font-semibold">{data.sonIslem || "-"}</div>
              </Card>
            </div>

            {/* Bar chart */}
            <Card className="p-4">
              <div className="font-semibold text-sm mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Aylık Hacim ({data.timeline.length} ay)
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.timeline} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="kisaLabel" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v)} />
                  <Tooltip
                    formatter={(v: any) => [new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(v), "Mal Bedeli"]}
                    labelFormatter={(l) => `${l}`}
                  />
                  <Bar dataKey="malBedeli" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Detay tablo */}
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[300px] overflow-auto">
                <Table className="text-sm">
                  <TableHeader className="sticky top-0 bg-muted">
                    <TableRow>
                      <TableHead>Dönem</TableHead>
                      <TableHead className="text-right">İşlem</TableHead>
                      <TableHead className="text-right">Mal Bedeli</TableHead>
                      <TableHead className="text-right">KDV</TableHead>
                      <TableHead className="text-right">Fatura Toplamı</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...data.timeline].reverse().map((m: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium whitespace-nowrap">{m.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.islemSayisi}</TableCell>
                        <TableCell className="text-right tabular-nums text-green-600 font-semibold">
                          {new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(m.malBedeli)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-orange-600">
                          {new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(m.kdv)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(m.faturaTutari)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TrendAnalysis() {
  const [churnMonths, setChurnMonths] = useState("2");
  const [comparisonWindow, setComparisonWindow] = useState("3");
  const [includeAllChurn, setIncludeAllChurn] = useState(false);
  const [topN, setTopN] = useState("100");
  const [drillFirma, setDrillFirma] = useState<string | null>(null);

  const queryUrl = `/api/gumruk/analiz?churnMonths=${churnMonths}&comparisonWindow=${comparisonWindow}&includeAllChurn=${includeAllChurn}&topN=${topN}`;
  const { data, isLoading } = useQuery<{
    risingTrends: any[];
    fallingTrends: any[];
    alerts: any[];
    currentPeriodLabel: string;
    previousPeriodLabel: string;
    comparisonWindow: number;
    riskOzet?: { firmaSayisi: number; toplamHacim: number };
  }>({
    queryKey: [queryUrl],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || (!data.risingTrends?.length && !data.fallingTrends?.length && !data.alerts?.length)) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground border-2 border-dashed rounded-lg">
            <TrendingUp className="w-12 h-12 mb-4 opacity-50" />
            <p>Analiz verisi bulunamadı.</p>
        </div>
    )
  }

  const { alerts, risingTrends, fallingTrends, currentPeriodLabel, previousPeriodLabel, riskOzet } = data;
  
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
  const TrendTable = ({ trends = [], defaultSortField = 'currentVol' }: { trends: any[], defaultSortField?: 'currentVol' | 'prevVol' }) => {
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
            <div className="rounded-md overflow-hidden">
                <div className="max-h-[600px] overflow-y-auto">
                    <Table className="text-sm">
                        <TableHeader className="sticky top-0 bg-muted z-10">
                            <TableRow>
                                <TableHead>Firma</TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-primary" onClick={() => handleSort('currentVol')}>
                                     <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                                        Son Dönem
                                        {sortField === 'currentVol' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                                     </div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-primary" onClick={() => handleSort('prevVol')}>
                                     <div className="flex items-center justify-end gap-1 whitespace-nowrap">
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
                                     <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                                        Fark (TL)
                                        {sortField === 'absGrowth' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                                     </div>
                                </TableHead>
                                <TableHead className="w-[40px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {!sortedTrends || sortedTrends.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-8">Veri yok</TableCell></TableRow>
                            ) : sortedTrends.map((t: any, i: number) => (
                                <TableRow key={i} className="cursor-pointer hover:bg-accent/40" onClick={() => setDrillFirma(t.company)}>
                                    <TableCell className="font-medium">{t.company}</TableCell>
                                    <TableCell className="text-right font-bold tabular-nums whitespace-nowrap">{new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(t.currentVol)}</TableCell>
                                    <TableCell className="text-right text-muted-foreground tabular-nums whitespace-nowrap">{new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(t.prevVol)}</TableCell>
                                    <TableCell className="text-right">
                                        <Badge variant={t.growth > 0 ? "secondary" : "destructive"} className={t.growth > 0 ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}>
                                            {t.growth > 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                                            %{t.growth.toFixed(1)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className={`text-right font-medium tabular-nums whitespace-nowrap ${t.absGrowth > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {t.absGrowth > 0 ? '+' : ''}{new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(t.absGrowth)}
                                    </TableCell>
                                    <TableCell><BarChart3 className="w-3.5 h-3.5 opacity-30" /></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </CardContent>
    </Card>
    );
  };

  const exportChurnCsv = () => {
    const rows = churnAlerts.map((a: any) => [a.company, a.lastSeenLabel || "-", a.inactiveMonths ?? "", a.transactionCount ?? "", a.totalVol ?? 0]);
    downloadCsv(`riskli-firmalar-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, ["Firma", "Son İşlem Ayı", "Inactive Ay", "Toplam İşlem", "Toplam Hacim (TL)"]));
  };
  const exportNewCsv = () => {
    const rows = newCustomerAlerts.map((a: any) => [a.company, a.firstSeenLabel || "-", a.transactionCount ?? "", a.currentVol ?? 0, a.totalVol ?? 0]);
    downloadCsv(`yeni-musteriler-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, ["Firma", "İlk İşlem Ayı", "Toplam İşlem", "Son Dönem Hacim (TL)", "Toplam Hacim (TL)"]));
  };
  const exportTrendCsv = (trends: any[], filename: string) => {
    const rows = trends.map((t: any) => [t.company, t.currentVol, t.prevVol, t.growth.toFixed(2), t.absGrowth.toFixed(2)]);
    downloadCsv(`${filename}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, ["Firma", `Son Dönem (${currentPeriodLabel})`, `Önceki Dönem (${previousPeriodLabel})`, "Büyüme %", "Fark (TL)"]));
  };

  const fmtCurrency = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  return (
    <div className="space-y-6">
      {/* Genel kontrol bar — tüm tablar için ortak parametreler */}
      <div className="flex flex-wrap items-end justify-between gap-3 p-4 rounded-lg border bg-muted/20">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            Karşılaştırma: <span className="text-primary">{currentPeriodLabel}</span> vs <span className="text-muted-foreground">{previousPeriodLabel}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Karşılaştırma Penceresi</Label>
            <Select value={comparisonWindow} onValueChange={setComparisonWindow}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 ay</SelectItem>
                <SelectItem value="3">3 ay</SelectItem>
                <SelectItem value="6">6 ay</SelectItem>
                <SelectItem value="12">12 ay</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Risk Süresi (Ay)</Label>
            <Select value={churnMonths} onValueChange={setChurnMonths}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="4">4</SelectItem>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="6">6</SelectItem>
                <SelectItem value="9">9</SelectItem>
                <SelectItem value="12">12</SelectItem>
                <SelectItem value="24">24</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sıralama Limiti</Label>
            <Select value={topN} onValueChange={setTopN}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="50">İlk 50</SelectItem>
                <SelectItem value="100">İlk 100</SelectItem>
                <SelectItem value="200">İlk 200</SelectItem>
                <SelectItem value="all">Tümü</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer pb-2">
            <Switch checked={includeAllChurn} onCheckedChange={setIncludeAllChurn} />
            <span className="text-xs font-medium">Tamamen kaybedilenleri de göster</span>
          </label>
        </div>
      </div>

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
                Yükselen ({risingTrends?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="falling" className="gap-2">
                <TrendingDown className="w-4 h-4 text-red-500" />
                Düşüşte ({fallingTrends?.length || 0})
            </TabsTrigger>
        </TabsList>

        {/* RISKLI SIRKETLER */}
        <TabsContent value="risks" className="space-y-4 mt-6">
            {/* Risk altındaki ciro özet */}
            {riskOzet && riskOzet.firmaSayisi > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card className="border-l-4 border-l-red-500 p-4">
                  <div className="text-xs text-muted-foreground">Riskli Firma Sayısı</div>
                  <div className="text-2xl font-black text-red-600 tabular-nums">{riskOzet.firmaSayisi}</div>
                </Card>
                <Card className="border-l-4 border-l-orange-500 p-4 md:col-span-2">
                  <div className="text-xs text-muted-foreground">Risk Altındaki Ciro (Toplam Geçmiş Hacim, KDV hariç)</div>
                  <div className="text-2xl font-black text-orange-600 tabular-nums">{fmtCurrency(riskOzet.toplamHacim)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Bu firmalar geçmişte aktifken {fmtCurrency(riskOzet.toplamHacim)} hacim üretti — şu an tehlikedeler.
                  </div>
                </Card>
              </div>
            )}

            <div className="flex items-center justify-between mb-2 bg-muted/30 p-4 rounded-lg border">
                <div>
                     <h3 className="text-lg font-semibold flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                        Kaybetme Riski Olan Şirketler
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Son işlemi {churnMonths}+ ay önce yapan eski müşteriler.
                        {!includeAllChurn && ` (Sadece son ${parseInt(churnMonths) + 3} ay içinde aktiftiler.)`}
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={exportChurnCsv} disabled={churnAlerts.length === 0}>
                  <DownloadIcon className="w-3.5 h-3.5 mr-1.5" /> CSV
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {churnAlerts.length === 0 ? (
                <div className="col-span-3 text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
                    <TrendingUp className="w-8 h-8 mb-2 mx-auto opacity-30" />
                    Belirlenen kriterlere uyan riskli şirket bulunamadı.
                </div>
            ) : (
                churnAlerts.map((alert: any, i: number) => (
                <Card key={i} className="border-l-4 border-l-red-500 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDrillFirma(alert.company)}>
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start gap-2">
                            <CardTitle className="text-base font-bold">{alert.company}</CardTitle>
                            <Badge variant="destructive" className="shrink-0">Risk</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm text-red-600 font-medium">
                            <AlertTriangle className="w-4 h-4" />
                            <span>{alert.message}</span>
                        </div>
                        {alert.lastSeenLabel && (
                          <div className="text-xs text-muted-foreground">Son işlem: <strong>{alert.lastSeenLabel}</strong></div>
                        )}
                        {alert.totalVol > 0 && (
                          <div className="text-xs flex items-center gap-2">
                            <span className="text-muted-foreground">Geçmiş hacim:</span>
                            <strong className="text-orange-600 tabular-nums">{fmtCurrency(alert.totalVol)}</strong>
                            <span className="text-muted-foreground">· {alert.transactionCount} işlem</span>
                          </div>
                        )}
                    </CardContent>
                </Card>
                ))
            )}
            </div>
        </TabsContent>

        {/* YENI SIRKETLER */}
        <TabsContent value="new" className="space-y-4 mt-6">
             <div className="flex items-center justify-between mb-2 bg-muted/30 p-4 rounded-lg border">
                 <div>
                     <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Lightbulb className="w-5 h-5 text-yellow-500" />
                        Portföye Yeni Katılanlar
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">Karşılaştırma penceresi içinde ({currentPeriodLabel}) ilk işlemini yapan firmalar.</p>
                 </div>
                 <Button variant="outline" size="sm" onClick={exportNewCsv} disabled={newCustomerAlerts.length === 0}>
                   <DownloadIcon className="w-3.5 h-3.5 mr-1.5" /> CSV
                 </Button>
            </div>
             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {newCustomerAlerts.length === 0 ? (
                 <div className="col-span-3 text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
                    Yeni müşteri bulunamadı.
                </div>
            ) : (
                newCustomerAlerts.map((alert: any, i: number) => (
                <Card key={i} className="border-l-4 border-l-green-500 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDrillFirma(alert.company)}>
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start gap-2">
                             <CardTitle className="text-base font-bold">{alert.company}</CardTitle>
                             <Badge className="bg-green-500 hover:bg-green-600 shrink-0">Yeni</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                            <TrendingUp className="w-4 h-4" />
                            <span>İlk işlem: <strong>{alert.firstSeenLabel}</strong></span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            <strong className="text-foreground tabular-nums">{alert.transactionCount}</strong> işlem · Son dönem hacim:{' '}
                            <strong className="text-green-700 tabular-nums">{fmtCurrency(alert.currentVol || 0)}</strong>
                        </div>
                        {alert.totalVol > (alert.currentVol || 0) && (
                          <div className="text-xs text-muted-foreground">
                            Toplam hacim: <strong className="tabular-nums">{fmtCurrency(alert.totalVol)}</strong>
                          </div>
                        )}
                    </CardContent>
                </Card>
                ))
            )}
            </div>
        </TabsContent>

        {/* YUKSELEN TRENDLER */}
        <TabsContent value="rising" className="space-y-4 mt-6">
            <div className="flex items-center justify-between mb-2 bg-muted/30 p-4 rounded-lg border">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-green-500" />
                        Yükselen Şirketler ve Trendler
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        İşlem hacmi {currentPeriodLabel} döneminde artan şirketler.
                        Yeni müşteriler hariç (Yeni sekmesinde gösterilir).
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => exportTrendCsv(risingTrends || [], "yukselen-trendler")} disabled={!risingTrends?.length}>
                  <DownloadIcon className="w-3.5 h-3.5 mr-1.5" /> CSV
                </Button>
            </div>
            <TrendTable trends={risingTrends || []} defaultSortField="currentVol" />
        </TabsContent>

        {/* DUSUSTEKI TRENDLER */}
        <TabsContent value="falling" className="space-y-4 mt-6">
             <div className="flex items-center justify-between mb-2 bg-muted/30 p-4 rounded-lg border">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <TrendingDown className="w-5 h-5 text-red-500" />
                        Düşüşteki Şirketler ve Trendler
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Önceki dönemde aktifken {currentPeriodLabel} döneminde hacmi azalan şirketler.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => exportTrendCsv(fallingTrends || [], "dususte-trendler")} disabled={!fallingTrends?.length}>
                  <DownloadIcon className="w-3.5 h-3.5 mr-1.5" /> CSV
                </Button>
            </div>
            <TrendTable trends={fallingTrends || []} defaultSortField="prevVol" />
        </TabsContent>

      </Tabs>

      {/* Drill-down dialog */}
      <FirmaTimelineDialog firma={drillFirma} onClose={() => setDrillFirma(null)} />
    </div>
  );
}
