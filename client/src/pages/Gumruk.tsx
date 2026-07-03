import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { type Calisan, type Gider, type GumrukVerisi, subeler } from "@shared/schema";
import { isYakitFaturasi } from "@shared/yakit";
import { Link } from "wouter";
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
  Calculator,
  Plus,
  Fuel
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
  LabelList,
  PieChart,
  Pie
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
                    const [selectedGiderIds, setSelectedGiderIds] = useState<Set<string>>(new Set());
                    const [eksikFilter, setEksikFilter] = useState<'tum' | 'sube' | 'kategori' | 'herhangi'>('tum');
                    // Sabitlenmiş görünüm: listedeki satır sırası/üyeliği. null = yeniden hesaplanacak.
                    const [gorunumIds, setGorunumIds] = useState<string[] | null>(null);
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

                    const toggleGiderSelection = (id: string) => {
                        setSelectedGiderIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(id)) {
                                next.delete(id);
                            } else {
                                next.add(id);
                            }
                            return next;
                        });
                    };

                    const handleBulkUpdate = async (field: 'sube' | 'kategori', value: string) => {
                        const ids = Array.from(selectedGiderIds);
                        if (ids.length === 0) return;

                        const veri: Record<string, string | null> = { [field]: value };
                        // Satır içi düzenlemeyle aynı kural: araç dışı kategoriye geçişte plaka temizlenir
                        if (field === 'kategori' && !ARAC_KATEGORILERI.includes(value)) {
                            veri.plaka = null;
                        }

                        try {
                            const response = await fetch('/api/giderler/bulk-update', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ ids, veri })
                            });

                            if (!response.ok) throw new Error("Bulk update failed");
                            const result = await response.json();

                            toast({
                                title: "Başarılı",
                                description: `${result.updated} kayıt güncellendi`,
                                duration: 2000,
                            });

                            refetchGiderler();
                            refetchGiderStats();
                        } catch (error) {
                            toast({
                                title: "Hata",
                                description: "Toplu güncelleme sırasında hata oluştu",
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
                    setGorunumIds(null); // yeni yüklenen kayıtlar listede görünsün
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

    // Yakıt tedarikçisi faturaları bu listede işlenmez — Araçlar sayfasında yönetilir
    const base = giderler.filter((g) => !isYakitFaturasi(g.firma));

    // Eksik bilgi filtresi: null veya boş string "seçilmemiş" sayılır
    const bos = (v: string | null) => !v || !String(v).trim();
    const filtered = eksikFilter === 'tum'
      ? base
      : base.filter((g) =>
          eksikFilter === 'sube' ? bos(g.sube)
          : eksikFilter === 'kategori' ? bos(g.kategori)
          : bos(g.sube) || bos(g.kategori)
        );

                    if (!sortConfig.key) return filtered;

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

    return [...filtered].sort((a, b) => {
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
  }, [giderler, sortConfig, eksikFilter]);

  // Filtre etiketlerinde gösterilecek eksik kayıt sayıları (filtreden bağımsız, tüm liste üzerinden)
  const eksikSayilari = useMemo(() => {
    const bos = (v: string | null) => !v || !String(v).trim();
    const liste = (giderler ?? []).filter((g) => !isYakitFaturasi(g.firma));
    return {
      sube: liste.filter((g) => bos(g.sube)).length,
      kategori: liste.filter((g) => bos(g.kategori)).length,
      herhangi: liste.filter((g) => bos(g.sube) || bos(g.kategori)).length,
    };
  }, [giderler]);

  // Listeden gizlenen yakıt faturası sayısı (bilgi şeridi için)
  const yakitSayisi = useMemo(
    () => (giderler ?? []).filter((g) => isYakitFaturasi(g.firma)).length,
    [giderler]
  );

  // Görünüm parametreleri (filtre/sıralama/ay/yıl) değişince liste yeniden
  // hesaplanıp SABİTLENİR. Kayıt güncellemeleri satırları oynatmaz/kaybettirmez —
  // kullanıcı eksik listede çalışırken satırlar yerinde durur, plaka da seçilebilir.
  useEffect(() => {
    setGorunumIds(null);
  }, [eksikFilter, sortConfig, selectedGiderAy, selectedGiderYil]);

  useEffect(() => {
    if (gorunumIds === null && !giderlerLoading && giderler) {
      setGorunumIds(sortedGiderler.map((g) => g.id));
    }
  }, [gorunumIds, giderlerLoading, giderler, sortedGiderler]);

  // Ekranda gösterilen liste: sırası ve üyeliği sabit, hücre değerleri güncel.
  // Silinen kayıtlar (byId'de bulunamayanlar) doğal olarak düşer.
  const displayGiderler = useMemo(() => {
    if (!gorunumIds) return sortedGiderler;
    const byId = new Map((giderler ?? []).map((g) => [g.id, g]));
    return gorunumIds.map((id) => byId.get(id)).filter((g): g is Gider => !!g);
  }, [gorunumIds, giderler, sortedGiderler]);

  // Seçim, görünen listeyle sınırlı kalsın: görünüm değişince veya kayıtlar
  // silinince görünmeyen id'ler seçimden düşürülür.
  useEffect(() => {
    setSelectedGiderIds((prev) => {
      if (prev.size === 0) return prev;
      const gorunen = new Set(displayGiderler.map((g) => g.id));
      const next = new Set(Array.from(prev).filter((id) => gorunen.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [displayGiderler]);

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
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                                  <h3 className="text-[15px] font-bold">Gider Listesi</h3>
                                  <div className="flex items-center gap-3">
                                    <Select value={eksikFilter} onValueChange={(v) => setEksikFilter(v as typeof eksikFilter)}>
                                      <SelectTrigger
                                        className={cn(
                                          "h-8 w-[230px] px-2.5 text-[12px]",
                                          eksikFilter !== 'tum' && "border-amber-400 font-semibold text-amber-700 dark:border-amber-500 dark:text-amber-400"
                                        )}
                                        data-testid="select-eksik-filter"
                                      >
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="tum">Tüm faturalar</SelectItem>
                                        <SelectItem value="herhangi">Şube veya kategori eksik ({eksikSayilari.herhangi})</SelectItem>
                                        <SelectItem value="sube">Şubesi eksik ({eksikSayilari.sube})</SelectItem>
                                        <SelectItem value="kategori">Kategorisi eksik ({eksikSayilari.kategori})</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <span className="text-[12.5px] tabular-nums text-muted-foreground">
                                      {displayGiderler.length} kayıt
                                    </span>
                                  </div>
                                </div>
                                {yakitSayisi > 0 && (
                                  <div className="flex flex-wrap items-center gap-2 border-b bg-emerald-50/60 px-5 py-2 text-[12px] dark:bg-emerald-950/20" data-testid="gider-yakit-banner">
                                    <Fuel className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                    <span className="text-muted-foreground">
                                      <strong className="font-semibold text-foreground">{yakitSayisi} yakıt faturası</strong> (Halis Petrol) bu listede işlenmez — araç kırılımı e-postadaki Excel ile yapılır:
                                    </span>
                                    <Link href="/araclar" className="font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-400">
                                      Araçlar sayfasına git
                                    </Link>
                                  </div>
                                )}
                                {selectedGiderIds.size > 0 && (
                                  <div className="flex flex-wrap items-center gap-3 border-b bg-accent/40 px-5 py-2.5" data-testid="gider-bulk-bar">
                                    <span className="text-[12.5px] font-semibold tabular-nums">
                                      {selectedGiderIds.size} fatura seçildi
                                    </span>
                                    <Select value="" onValueChange={(val) => handleBulkUpdate('sube', val)}>
                                      <SelectTrigger className="h-7 w-[150px] px-2 text-[11.5px]" data-testid="select-bulk-sube">
                                        <SelectValue placeholder="Şube ata" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {subeler.map((s) => (
                                          <SelectItem key={s} value={s}>{s}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Select value="" onValueChange={(val) => handleBulkUpdate('kategori', val)}>
                                      <SelectTrigger className="h-7 w-[170px] px-2 text-[11.5px]" data-testid="select-bulk-kategori">
                                        <SelectValue placeholder="Kategori ata" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {categories?.map((c) => (
                                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 gap-1.5 px-2 text-[12px] text-muted-foreground"
                                      onClick={() => setSelectedGiderIds(new Set())}
                                      data-testid="button-bulk-clear"
                                    >
                                      <XIcon className="h-3.5 w-3.5" /> Seçimi temizle
                                    </Button>
                                  </div>
                                )}
                                <div className="max-h-[70vh] overflow-x-auto">
                                  <Table className="w-full whitespace-nowrap text-[12.5px]">
                                    <TableHeader className="sticky top-0 z-[5] bg-slate-50 dark:bg-muted">
                                      <TableRow className="border-b hover:bg-transparent">
                                        <TableHead className="h-9 w-[36px] px-2.5">
                                          <Checkbox
                                            checked={
                                              displayGiderler.length > 0 && selectedGiderIds.size === displayGiderler.length
                                                ? true
                                                : selectedGiderIds.size > 0
                                                  ? "indeterminate"
                                                  : false
                                            }
                                            onCheckedChange={(checked) => {
                                              setSelectedGiderIds(checked ? new Set(displayGiderler.map((g) => g.id)) : new Set());
                                            }}
                                            aria-label="Tümünü seç"
                                            data-testid="checkbox-gider-select-all"
                                          />
                                        </TableHead>
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
                                          <TableCell colSpan={13} className="py-12 text-center">
                                            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                                          </TableCell>
                                        </TableRow>
                                      ) : giderlerError ? (
                                        <TableRow>
                                          <TableCell colSpan={13} className="py-12 text-center text-destructive">
                                            Veriler yüklenirken hata oluştu. <button className="underline" onClick={() => refetchGiderler()}>Tekrar dene</button>
                                          </TableCell>
                                        </TableRow>
                                      ) : displayGiderler.length === 0 ? (
                                        <TableRow>
                                          <TableCell colSpan={13} className="py-12 text-center text-muted-foreground">
                                            Kayıt bulunamadı
                                          </TableCell>
                                        </TableRow>
                                      ) : (
                                        displayGiderler.map((gider, idx) => (
                                          <TableRow
                                            key={gider.id}
                                            className={`${selectedGiderIds.has(gider.id) ? 'bg-accent/60' : idx % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-slate-50 dark:bg-muted/30'} border-b transition-colors hover:bg-accent/50`}
                                          >
                                            <TableCell className="px-2.5 py-1.5">
                                              <Checkbox
                                                checked={selectedGiderIds.has(gider.id)}
                                                onCheckedChange={() => toggleGiderSelection(gider.id)}
                                                aria-label="Faturayı seç"
                                                data-testid={`checkbox-gider-${gider.id}`}
                                              />
                                            </TableCell>
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
  const [selectedAy, setSelectedAy] = useState<string>("toplam"); // Varsayılan: Yıllık Toplam (referansla hizalı)
                      const [selectedYil, setSelectedYil] = useState<string>(String(currentYear));

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
    { value: "1", label: "Ocak" }, { value: "2", label: "Şubat" }, { value: "3", label: "Mart" },
    { value: "4", label: "Nisan" }, { value: "5", label: "Mayıs" }, { value: "6", label: "Haziran" },
    { value: "7", label: "Temmuz" }, { value: "8", label: "Ağustos" }, { value: "9", label: "Eylül" },
    { value: "10", label: "Ekim" }, { value: "11", label: "Kasım" }, { value: "12", label: "Aralık" }
  ];

  // Şube renk paleti (donut + yüzdeli liste ortak)
  const branchColors = ["#7c3aed", "#0ea5e9", "#059669", "#d97706", "#e11d48"];

  // Dönem etiketi (eyebrow için): seçili ay adı · yıl ("toplam" → "Yıllık Toplam")
  const donemLabel = useMemo(() => {
    const ayLabel = selectedAy === "toplam" ? "Yıllık Toplam" : (aylar.find((a) => a.value === selectedAy)?.label ?? "");
    return `${ayLabel} · ${selectedYil}`;
  }, [selectedAy, selectedYil]);

  // Donut + yüzdeli liste verisi: her şubenin toplam maliyetteki payı
  const subePayData = useMemo(() => {
    const toplam = totalStats.toplamMaliyet || 0;
    return branchStats.map((s, i) => ({
      name: s.name,
      count: s.count,
      toplamMaliyet: s.toplamMaliyet,
      color: branchColors[i % branchColors.length],
      pay: toplam > 0 ? (s.toplamMaliyet / toplam) * 100 : 0,
    }));
  }, [branchStats, totalStats.toplamMaliyet]);

  const enBuyukPay = useMemo(() => {
    if (subePayData.length === 0) return 0;
    return Math.round(Math.max(...subePayData.map((s) => s.pay)));
  }, [subePayData]);

  // Çalışan detay listesi: ham kayıtlardan per-employee hesap
  const calisanRows = useMemo(() => {
    if (!calisanlar) return [];
    return calisanlar.map((p) => {
      const brut = parseFloat(p.brutUcret || 0);
      const isciSgk = parseFloat(p.sigortaKesintisi || 0);
      const isverenSgk = parseFloat(p.isverenSgkPayi || 0) + parseFloat(p.isverenIssizlikPayi || 0);
      const dbMaliyet = parseFloat(p.toplamIsverenMaliyeti || 0);
      const maliyet = dbMaliyet > 0 ? dbMaliyet : brut + isverenSgk;
      const statu = (p.statu || "").toString().trim();
      const statuLabel = statu || "Normal";
      let statuClass = "text-slate-600 bg-slate-100 border-slate-200";
      if (statu.includes("önetim")) statuClass = "text-violet-700 bg-violet-50 border-violet-200";
      else if (statu.includes("mekli")) statuClass = "text-amber-700 bg-amber-50 border-amber-200";
      return {
        adSoyad: p.adSoyad || "—",
        sube: p.sube || "Merkez",
        statuLabel,
        statuClass,
        brut,
        net: parseFloat(p.netUcret || 0),
        isciSgk,
        isverenSgk,
        maliyet,
      };
    });
  }, [calisanlar]);

  // Türkçe yüzde formatı (virgül): 18,4
  const fmtPct = (v: number) => v.toFixed(1).replace(".", ",");

  return (
    <div className="space-y-6">
      {/* Sticky filtre header */}
      <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-2 border-b border-border/70 bg-slate-50/85 px-6 py-4 backdrop-blur dark:bg-background/85 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Gümrük · Çalışanlar · {donemLabel}
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Personel Maliyeti</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Dönem</span>
              <Select value={selectedAy} onValueChange={setSelectedAy}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Ay Seçin" /></SelectTrigger>
                <SelectContent>
                  {aylar.map((ay) => (
                    <SelectItem key={ay.value} value={ay.value}>{ay.label}</SelectItem>
                  ))}
                  <SelectItem value="toplam" className="font-bold border-t">Yıllık Toplam</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Yıl</span>
              <Select value={selectedYil} onValueChange={setSelectedYil}>
                <SelectTrigger className="w-[100px]"><SelectValue placeholder="Yıl" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2027">2027</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Yükleniyor / boş durum */}
      {isLoading && (
        <div className="text-center py-10"><Loader2 className="animate-spin w-8 h-8 mx-auto text-primary" /></div>
      )}

      {!isLoading && branchStats.length === 0 && (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
          Kayıt bulunamadı.
        </div>
      )}

      {!isLoading && branchStats.length > 0 && (
        <>
          {/* 6 KPI kart */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
            {[
              { label: "Personel", accent: "#7c3aed", value: String(totalStats.count), valueClass: "" },
              { label: "Genel Brüt", accent: "#0ea5e9", value: formatCurrencyFull(totalStats.brut), valueClass: "" },
              { label: "Genel Net", accent: "#059669", value: formatCurrencyFull(totalStats.net), valueClass: "text-emerald-600" },
              { label: "İşçi SGK", accent: "#d97706", value: formatCurrencyFull(totalStats.isciSgk), valueClass: "" },
              { label: "İşveren SGK", accent: "#e11d48", value: formatCurrencyFull(totalStats.isverenPayi), valueClass: "" },
              { label: "Toplam Maliyet", accent: "#0f172a", value: formatCurrencyFull(totalStats.toplamMaliyet), valueClass: "" },
            ].map((kpi) => (
              <div key={kpi.label} className="relative overflow-hidden rounded-[13px] border bg-card p-4">
                <div className="absolute left-0 top-0 h-full w-[3px]" style={{ background: kpi.accent }} />
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
                <p className={cn("mt-2 text-[18px] font-extrabold tabular-nums leading-tight", kpi.valueClass)}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          {/* Şube Bazında Toplam Maliyet — donut + yüzdeli liste */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-baseline justify-between gap-3">
                <CardTitle className="text-[15px] font-bold">Şube Bazında Toplam Maliyet</CardTitle>
                <p className="text-xs text-muted-foreground">Her ofisin toplam personel maliyetindeki payı</p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-7 items-center">
                {/* Donut */}
                <div className="relative mx-auto h-[180px] w-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={subePayData}
                        dataKey="toplamMaliyet"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={64}
                        outerRadius={80}
                        stroke="none"
                      >
                        {subePayData.map((s) => (
                          <Cell key={s.name} fill={s.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">En büyük pay</span>
                    <span className="text-[22px] font-extrabold tabular-nums" style={{ color: "#7c3aed" }}>%{enBuyukPay}</span>
                  </div>
                </div>
                {/* Yüzdeli liste */}
                <div className="flex flex-col gap-3">
                  {subePayData.map((s) => (
                    <div key={s.name} className="flex items-center gap-3">
                      <span className="h-[9px] w-[9px] flex-shrink-0 rounded-[3px]" style={{ background: s.color }} />
                      <span className="flex-[0_0_140px] text-[13px] font-semibold text-foreground/80">
                        {s.name} <span className="font-normal text-muted-foreground">· {s.count} kişi</span>
                      </span>
                      <span className="h-[9px] flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full" style={{ width: `${s.pay}%`, background: s.color }} />
                      </span>
                      <span className="flex-[0_0_56px] text-right text-[13px] font-extrabold tabular-nums">%{fmtPct(s.pay)}</span>
                      <span className="flex-[0_0_auto] text-right text-[12.5px] font-semibold tabular-nums text-muted-foreground">
                        {formatCurrencyFull(s.toplamMaliyet)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Şube Bazlı Dağılım tablosu */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-[15px] font-bold">Şube Bazlı Dağılım</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-[10.5px] uppercase tracking-wide">Şube Adı</TableHead>
                    <TableHead className="text-center text-[10.5px] uppercase tracking-wide">Personel</TableHead>
                    <TableHead className="text-right text-[10.5px] uppercase tracking-wide">Brüt Ücret</TableHead>
                    <TableHead className="text-right text-[10.5px] uppercase tracking-wide">Net Ücret</TableHead>
                    <TableHead className="text-right text-[10.5px] uppercase tracking-wide">İşçi SGK</TableHead>
                    <TableHead className="text-right text-[10.5px] uppercase tracking-wide">İşveren SGK</TableHead>
                    <TableHead className="text-right text-[10.5px] uppercase tracking-wide">Toplam Maliyet</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branchStats.map((stat, i) => (
                    <TableRow key={stat.name} className={cn("hover:bg-muted/30", i % 2 === 1 && "bg-muted/20")}>
                      <TableCell className="font-semibold">
                        <span className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                          {stat.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{stat.count}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrencyFull(stat.brut)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-emerald-600">{formatCurrencyFull(stat.net)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrencyFull(stat.isciSgk)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-violet-600">{formatCurrencyFull(stat.isverenPayi)}</TableCell>
                      <TableCell className="text-right font-extrabold tabular-nums">{formatCurrencyFull(stat.toplamMaliyet)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-muted/60 border-t-2">
                    <TableCell className="font-extrabold">GENEL TOPLAM</TableCell>
                    <TableCell className="text-center font-extrabold tabular-nums">{totalStats.count}</TableCell>
                    <TableCell className="text-right font-extrabold tabular-nums">{formatCurrencyFull(totalStats.brut)}</TableCell>
                    <TableCell className="text-right font-extrabold tabular-nums text-emerald-700">{formatCurrencyFull(totalStats.net)}</TableCell>
                    <TableCell className="text-right font-extrabold tabular-nums">{formatCurrencyFull(totalStats.isciSgk)}</TableCell>
                    <TableCell className="text-right font-extrabold tabular-nums text-violet-700">{formatCurrencyFull(totalStats.isverenPayi)}</TableCell>
                    <TableCell className="text-right font-extrabold tabular-nums">{formatCurrencyFull(totalStats.toplamMaliyet)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          {/* Çalışan Detay Listesi — per-employee */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-[15px] font-bold">Çalışan Detay Listesi</CardTitle>
                <span className="text-[12.5px] tabular-nums text-muted-foreground">{totalStats.count} kişi</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[62vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-[5]">
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-[10.5px] uppercase tracking-wide">Ad Soyad</TableHead>
                      <TableHead className="text-[10.5px] uppercase tracking-wide">Şube</TableHead>
                      <TableHead className="text-[10.5px] uppercase tracking-wide">Statü</TableHead>
                      <TableHead className="text-right text-[10.5px] uppercase tracking-wide">Brüt Ücret</TableHead>
                      <TableHead className="text-right text-[10.5px] uppercase tracking-wide">Net Ücret</TableHead>
                      <TableHead className="text-right text-[10.5px] uppercase tracking-wide">İşçi SGK</TableHead>
                      <TableHead className="text-right text-[10.5px] uppercase tracking-wide">İşveren SGK</TableHead>
                      <TableHead className="text-right text-[10.5px] uppercase tracking-wide">Toplam Maliyet</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calisanRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          Çalışan kaydı bulunamadı.
                        </TableCell>
                      </TableRow>
                    ) : (
                      calisanRows.map((p, i) => (
                        <TableRow key={`${p.adSoyad}-${i}`} className={cn("hover:bg-muted/30", i % 2 === 1 && "bg-muted/20")}>
                          <TableCell className="font-semibold">{p.adSoyad}</TableCell>
                          <TableCell className="text-muted-foreground">{p.sube}</TableCell>
                          <TableCell>
                            <span className={cn("inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", p.statuClass)}>
                              {p.statuLabel}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrencyFull(p.brut)}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-emerald-600">{formatCurrencyFull(p.net)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrencyFull(p.isciSgk)}</TableCell>
                          <TableCell className="text-right tabular-nums text-violet-600">{formatCurrencyFull(p.isverenSgk)}</TableCell>
                          <TableCell className="text-right font-extrabold tabular-nums">{formatCurrencyFull(p.maliyet)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
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
  const [tab, setTab] = useState<"rising" | "falling" | "risk" | "yeni">("rising");
  const [sortField, setSortField] = useState<"currentVol" | "prevVol" | "growth" | "absGrowth">("currentVol");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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

  // ─── Türetilen değerler ───
  const isTrendTab = tab === "rising" || tab === "falling";
  const trendSource = (tab === "falling" ? fallingTrends : risingTrends) || [];
  const sortedTrends = [...trendSource].sort((a: any, b: any) => {
    const dir = sortDir === "asc" ? 1 : -1;
    return ((a[sortField] ?? 0) - (b[sortField] ?? 0)) * dir;
  });
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };
  const sortCaret = (field: typeof sortField) =>
    sortField === field ? (sortDir === "asc" ? "▲" : "▼") : "";

  const riskTotalHacim = riskOzet?.toplamHacim ?? churnAlerts.reduce((sum: number, a: any) => sum + (a.totalVol ?? 0), 0);
  const riskFirmaSayisi = riskOzet?.firmaSayisi ?? churnAlerts.length;

  // CSV — aktif tab'ın dışa aktarıcısı
  const exportActive = () => {
    if (tab === "risk") return exportChurnCsv();
    if (tab === "yeni") return exportNewCsv();
    return exportTrendCsv(trendSource, tab === "falling" ? "dususte-trendler" : "yukselen-trendler");
  };

  const kpis = [
    { label: "Yükselen Firma", accent: "#10b981", value: String(risingTrends?.length ?? 0), sub: "ciro artışı pozitif" },
    { label: "Düşen Firma", accent: "#e11d48", value: String(fallingTrends?.length ?? 0), sub: "ciro daralması" },
    { label: "Riskli Firma", accent: "#f59e0b", value: String(riskFirmaSayisi), sub: `${formatCurrencyFull(riskTotalHacim)} hacim` },
    { label: "Yeni Müşteri", accent: "#0ea5e9", value: String(newCustomerAlerts.length), sub: "yeni kazanılan" },
  ];

  const tabsDef = [
    { id: "rising" as const, label: "Yükselen", dot: "#10b981", count: risingTrends?.length ?? 0, badgeBg: "bg-emerald-100", badgeFg: "text-emerald-700" },
    { id: "falling" as const, label: "Düşen", dot: "#e11d48", count: fallingTrends?.length ?? 0, badgeBg: "bg-rose-100", badgeFg: "text-rose-700" },
    { id: "risk" as const, label: "Riskli Firmalar", dot: "#f59e0b", count: churnAlerts.length, badgeBg: "bg-amber-100", badgeFg: "text-amber-700" },
    { id: "yeni" as const, label: "Yeni Müşteriler", dot: "#0ea5e9", count: newCustomerAlerts.length, badgeBg: "bg-sky-100", badgeFg: "text-sky-700" },
  ];

  const segBtn = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-[12.5px] transition-colors",
      active
        ? "bg-white text-foreground font-bold shadow-sm dark:bg-background"
        : "text-muted-foreground font-semibold hover:text-foreground"
    );

  const riskDot = (m: number) => (m >= 9 ? "#ef4444" : m >= 5 ? "#f59e0b" : "#fbbf24");
  const riskMonColor = (m: number) => (m >= 9 ? "text-red-600" : m >= 5 ? "text-amber-600" : "text-amber-500");

  return (
    <div className="space-y-5">
      {/* Sticky kontrol barı */}
      <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-2 border-b border-border/70 bg-slate-50/85 px-6 py-4 backdrop-blur dark:bg-background/85 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[21px] font-extrabold tracking-tight">Trend Analizi</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Karşılaştırma: <strong style={{ color: "#0284c7" }}>{currentPeriodLabel}</strong>
              {" "}vs{" "}
              <span className="text-muted-foreground">{previousPeriodLabel}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2.5">
            {/* Pencere */}
            <div>
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Pencere</div>
              <div className="inline-flex rounded-lg bg-muted p-1">
                {["1", "3", "6", "12"].map((w) => (
                  <button key={w} type="button" onClick={() => setComparisonWindow(w)} className={segBtn(comparisonWindow === w)}>
                    {w} ay
                  </button>
                ))}
              </div>
            </div>
            {/* Risk Süresi */}
            <div>
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Risk Süresi</div>
              <div className="inline-flex rounded-lg bg-muted p-1">
                {["2", "3", "6", "12"].map((m) => (
                  <button key={m} type="button" onClick={() => setChurnMonths(m)} className={segBtn(churnMonths === m)}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {/* Sıralama Limiti */}
            <div>
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Limit</div>
              <Select value={topN} onValueChange={setTopN}>
                <SelectTrigger className="h-[38px] w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">İlk 50</SelectItem>
                  <SelectItem value="100">İlk 100</SelectItem>
                  <SelectItem value="200">İlk 200</SelectItem>
                  <SelectItem value="all">Tümü</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Tamamen kaybedilenler toggle */}
            <label className="flex h-[38px] items-center gap-2 rounded-lg border bg-card px-3 cursor-pointer">
              <Switch checked={includeAllChurn} onCheckedChange={setIncludeAllChurn} />
              <span className="whitespace-nowrap text-xs font-medium">Tamamen kaybedilenler</span>
            </label>
            {/* CSV */}
            <Button variant="outline" onClick={exportActive} className="h-[38px] gap-2">
              <DownloadIcon className="h-[15px] w-[15px]" />
              CSV
            </Button>
          </div>
        </div>
      </div>

      {/* 4 KPI kartı */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="relative overflow-hidden rounded-[14px] border bg-card p-5">
            <div className="absolute left-0 top-0 h-full w-[3px]" style={{ background: kpi.accent }} />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
            <p className="mt-2.5 text-[25px] font-extrabold tabular-nums leading-tight">{kpi.value}</p>
            <p className="mt-2 text-[12px] font-medium text-muted-foreground">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex flex-wrap gap-1.5 border-b">
        {tabsDef.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "relative -mb-px inline-flex items-center px-1 py-2.5 mr-4 text-[13.5px] transition-colors",
              tab === t.id ? "font-bold text-foreground" : "font-semibold text-muted-foreground hover:text-foreground"
            )}
            style={tab === t.id ? { boxShadow: "inset 0 -2px 0 #0ea5e9" } : undefined}
          >
            <span className="mr-2 inline-block h-[7px] w-[7px] rounded-full" style={{ background: t.dot }} />
            {t.label}
            <span className={cn("ml-2 rounded-full px-1.5 py-px text-[11px] font-bold", t.badgeBg, t.badgeFg)}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ── Trend tablosu (Yükselen / Düşen) ── */}
      {isTrendTab && (
        <Card className="overflow-hidden rounded-[14px]">
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-y-auto">
              <Table className="text-sm">
                <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                  <TableRow>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Firma</TableHead>
                    {([
                      { key: "currentVol", label: "Son Dönem" },
                      { key: "prevVol", label: "Önceki Dönem" },
                      { key: "growth", label: "Büyüme" },
                      { key: "absGrowth", label: "Fark (₺)" },
                    ] as const).map((c) => (
                      <TableHead
                        key={c.key}
                        className="cursor-pointer select-none text-right text-[11px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                        onClick={() => handleSort(c.key)}
                      >
                        <span className="whitespace-nowrap">{c.label} {sortCaret(c.key)}</span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTrends.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Veri yok</TableCell></TableRow>
                  ) : sortedTrends.map((t: any, i: number) => (
                    <TableRow key={i} className="cursor-pointer hover:bg-accent/40" onClick={() => setDrillFirma(t.company)}>
                      <TableCell className="font-semibold text-[13.5px]">{t.company}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums whitespace-nowrap">{formatCurrencyFull(t.currentVol)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground">{formatCurrencyFull(t.prevVol)}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold",
                            t.growth >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          )}
                        >
                          {t.growth >= 0 ? "▲" : "▼"} %{Math.abs(t.growth).toFixed(1).replace(".", ",")}
                        </span>
                      </TableCell>
                      <TableCell className={cn("text-right font-semibold tabular-nums whitespace-nowrap", t.absGrowth >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        {t.absGrowth >= 0 ? "+" : "−"}{formatCurrencyFull(Math.abs(t.absGrowth))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Riskli Firmalar ── */}
      {tab === "risk" && (
        <Card className="overflow-hidden rounded-[14px]">
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-y-auto">
              <Table className="text-sm">
                <TableHeader className="sticky top-0 z-10 bg-rose-50 backdrop-blur">
                  <TableRow>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wide text-rose-700">Firma</TableHead>
                    <TableHead className="text-right text-[11px] font-bold uppercase tracking-wide text-rose-700">Son İşlem</TableHead>
                    <TableHead className="text-right text-[11px] font-bold uppercase tracking-wide text-rose-700">İnaktif</TableHead>
                    <TableHead className="text-right text-[11px] font-bold uppercase tracking-wide text-rose-700">Toplam Hacim</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {churnAlerts.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Belirlenen kriterlere uyan riskli şirket bulunamadı.</TableCell></TableRow>
                  ) : churnAlerts.map((a: any, i: number) => (
                    <TableRow key={i} className="cursor-pointer hover:bg-rose-50/40" onClick={() => setDrillFirma(a.company)}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: riskDot(a.inactiveMonths ?? 0) }} />
                          <span className="font-semibold text-[13.5px]">{a.company}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{a.lastSeenLabel || "-"}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn("font-bold tabular-nums", riskMonColor(a.inactiveMonths ?? 0))}>{a.inactiveMonths ?? 0} ay</span>
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums whitespace-nowrap">{formatCurrencyFull(a.totalVol ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Yeni Müşteriler ── */}
      {tab === "yeni" && (
        <Card className="overflow-hidden rounded-[14px]">
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-y-auto">
              <Table className="text-sm">
                <TableHeader className="sticky top-0 z-10 bg-emerald-50 backdrop-blur">
                  <TableRow>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Firma</TableHead>
                    <TableHead className="text-right text-[11px] font-bold uppercase tracking-wide text-emerald-700">İlk İşlem</TableHead>
                    <TableHead className="text-right text-[11px] font-bold uppercase tracking-wide text-emerald-700">İşlem</TableHead>
                    <TableHead className="text-right text-[11px] font-bold uppercase tracking-wide text-emerald-700">Son Dönem Hacim</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {newCustomerAlerts.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Yeni müşteri bulunamadı.</TableCell></TableRow>
                  ) : newCustomerAlerts.map((a: any, i: number) => (
                    <TableRow key={i} className="cursor-pointer hover:bg-emerald-50/40" onClick={() => setDrillFirma(a.company)}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
                            <Plus className="h-[13px] w-[13px]" strokeWidth={2.4} />
                          </span>
                          <span className="font-semibold text-[13.5px]">{a.company}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{a.firstSeenLabel || "-"}</TableCell>
                      <TableCell className="text-right tabular-nums text-foreground/80">{a.transactionCount ?? 0}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums whitespace-nowrap">{formatCurrencyFull(a.currentVol ?? a.totalVol ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Drill-down dialog */}
      <FirmaTimelineDialog firma={drillFirma} onClose={() => setDrillFirma(null)} />
    </div>
  );
}
