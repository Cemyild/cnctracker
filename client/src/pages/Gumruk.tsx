import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BackgroundPaths } from "@/components/BackgroundPaths";
import { ExcelUploadModal } from "@/components/ExcelUploadModal";
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
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, TrendingUp, Users, Building2, Loader2 } from "lucide-react";
import type { GumrukVerisi } from "@shared/schema";

const aylar = [
  { value: "ocak", label: "Ocak" },
  { value: "subat", label: "Şubat" },
  { value: "mart", label: "Mart" },
  { value: "nisan", label: "Nisan" },
  { value: "mayis", label: "Mayıs" },
  { value: "haziran", label: "Haziran" },
  { value: "temmuz", label: "Temmuz" },
  { value: "agustos", label: "Ağustos" },
  { value: "eylul", label: "Eylül" },
  { value: "ekim", label: "Ekim" },
  { value: "kasim", label: "Kasım" },
  { value: "aralik", label: "Aralık" },
];

const currentYear = new Date().getFullYear();
const yillar = Array.from({ length: 5 }, (_, i) => currentYear - i);

function formatCurrency(value: string | null): string {
  if (!value) return "₺0,00";
  const num = parseFloat(value);
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
  }).format(num);
}

function getAyLabel(value: string): string {
  return aylar.find((a) => a.value === value)?.label || value;
}

export default function Gumruk() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedAy, setSelectedAy] = useState<string>("");
  const [selectedYil, setSelectedYil] = useState<string>(String(currentYear));

  // Yüklü ayları getir
  const { data: yukluAylar, refetch: refetchAylar } = useQuery<
    { ay: string; yil: number; kayitSayisi: number }[]
  >({
    queryKey: ["/api/gumruk/aylar"],
  });

  // Seçili ay verilerini getir
  const { data: veriler, isLoading: verilerLoading, refetch: refetchVeriler } = useQuery<GumrukVerisi[]>({
    queryKey: ["/api/gumruk", selectedAy, selectedYil],
    enabled: !!selectedAy && !!selectedYil,
  });

  const handleUploadSuccess = () => {
    refetchAylar();
    if (selectedAy && selectedYil) {
      refetchVeriler();
    }
  };

  // İstatistikleri hesapla
  const stats = veriler
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

  // En çok ciro yapan müşteriler
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

  // Çalışan bazında dosya sayıları
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
        {/* Üst Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
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
          </div>

          <Button onClick={() => setIsUploadModalOpen(true)} data-testid="button-open-upload">
            <Upload className="w-4 h-4 mr-2" />
            Excel Yükle
          </Button>
        </div>

        {/* Yüklü Aylar */}
        {yukluAylar && yukluAylar.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {yukluAylar.map((item) => (
              <Badge
                key={`${item.ay}-${item.yil}`}
                variant={selectedAy === item.ay && selectedYil === String(item.yil) ? "default" : "secondary"}
                className="cursor-pointer"
                onClick={() => {
                  setSelectedAy(item.ay);
                  setSelectedYil(String(item.yil));
                }}
                data-testid={`badge-ay-${item.ay}-${item.yil}`}
              >
                {getAyLabel(item.ay)} {item.yil} ({item.kayitSayisi} kayıt)
              </Badge>
            ))}
          </div>
        )}

        {/* İçerik */}
        {!selectedAy ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileSpreadsheet className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Veri Görüntüleme</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                Gümrük verilerini görüntülemek için yukarıdan ay ve yıl seçin veya yeni Excel dosyası yükleyin.
              </p>
              <Button onClick={() => setIsUploadModalOpen(true)} variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                Excel Yükle
              </Button>
            </CardContent>
          </Card>
        ) : verilerLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : veriler && veriler.length > 0 ? (
          <>
            {/* İstatistik Kartları */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Toplam Fatura
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold" data-testid="text-toplam-fatura">
                    {formatCurrency(String(stats?.toplamFatura || 0))}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Toplam KDV
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold" data-testid="text-toplam-kdv">
                    {formatCurrency(String(stats?.toplamKdv || 0))}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" />
                    Dosya Sayısı
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold" data-testid="text-dosya-sayisi">
                    {stats?.dosyaSayisi || 0}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Müşteri Sayısı
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold" data-testid="text-musteri-sayisi">
                    {stats?.musteriSayisi || 0}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Alt Kartlar */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* En Çok Ciro Yapan Müşteriler */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
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
                            {formatCurrency(String(ciro))}
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
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
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
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileSpreadsheet className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Veri Bulunamadı</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                {getAyLabel(selectedAy)} {selectedYil} için kayıtlı veri bulunmuyor.
              </p>
              <Button onClick={() => setIsUploadModalOpen(true)} variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                Excel Yükle
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <ExcelUploadModal
        open={isUploadModalOpen}
        onOpenChange={setIsUploadModalOpen}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}
