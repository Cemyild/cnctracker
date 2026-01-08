import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

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

export interface ExcelUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  uploadUrl?: string;
  title?: string;
  description?: string;
  hideDateSelectors?: boolean;
}


export function ExcelUploadModal({
  open,
  onOpenChange,
  onSuccess,
  uploadUrl = "/api/gumruk/yukle",
  title = "Excel Yükle",
  description = "Gümrük verilerini içeren Excel dosyasını yükleyin",
  hideDateSelectors = false
}: ExcelUploadModalProps) {
  const [selectedAy, setSelectedAy] = useState<string>("");
  const [selectedYil, setSelectedYil] = useState<string>(String(currentYear));
  const [isBulk, setIsBulk] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
        toast({
          title: "Hata",
          description: "Lütfen geçerli bir Excel dosyası seçin (.xlsx veya .xls)",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    const needsDates = !hideDateSelectors && !isBulk;
    if ((needsDates && (!selectedAy || !selectedYil)) || !file) {
      toast({
        title: "Hata",
        description: "Lütfen tüm alanları doldurun ve dosya seçin",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append("excel", file);
    if (!hideDateSelectors && !isBulk) {
      formData.append("ay", selectedAy);
      formData.append("yil", selectedYil);
    }

    try {
      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        const description = result.atlanan > 0
          ? `${result.eklenen} yeni kayıt eklendi, ${result.atlanan} mevcut kayıt atlandı`
          : `${result.eklenen} kayıt başarıyla eklendi`;
        toast({
          title: "Başarılı",
          description,
        });
        onSuccess();
        onOpenChange(false);
        resetForm();
      } else {
        toast({
          title: "Hata",
          description: result.error || "Yükleme sırasında bir hata oluştu",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: "Sunucu ile bağlantı kurulamadı",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      resetForm();
    }
  };

  const resetForm = () => {
    setSelectedAy("");
    setSelectedYil(String(currentYear));
    setFile(null);
    setIsBulk(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!hideDateSelectors && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="bulk-mode"
                  checked={isBulk}
                  onCheckedChange={(checked) => setIsBulk(checked as boolean)}
                />
                <Label htmlFor="bulk-mode" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Dosya tüm yılı içeriyor (Otomatik Tarih)
                </Label>
              </div>

              {!isBulk && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ay">Ay</Label>
                    <Select value={selectedAy} onValueChange={setSelectedAy}>
                      <SelectTrigger id="ay" data-testid="select-ay">
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

                  <div className="space-y-2">
                    <Label htmlFor="yil">Yıl</Label>
                    <Select value={selectedYil} onValueChange={setSelectedYil}>
                      <SelectTrigger id="yil" data-testid="select-yil">
                        <SelectValue placeholder="Yıl seçin" />
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
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="excel">Excel Dosyası</Label>
            <div className="flex items-center gap-2">
              <Input
                id="excel"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="cursor-pointer"
                data-testid="input-excel"
              />
            </div>
            {file && (
              <p className="text-sm text-muted-foreground">
                Seçilen dosya: {file.name}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }}
            disabled={isUploading}
          >
            İptal
          </Button>
          <Button
            onClick={handleUpload}
            disabled={((!hideDateSelectors && !isBulk) && (!selectedAy || !selectedYil)) || !file || isUploading}
            data-testid="button-upload"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Yükleniyor...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Yükle
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
