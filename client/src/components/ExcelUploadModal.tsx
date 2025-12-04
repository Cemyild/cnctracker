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

interface ExcelUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ExcelUploadModal({ open, onOpenChange, onSuccess }: ExcelUploadModalProps) {
  const [selectedAy, setSelectedAy] = useState<string>("");
  const [selectedYil, setSelectedYil] = useState<string>(String(currentYear));
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
    if (!selectedAy || !selectedYil || !file) {
      toast({
        title: "Hata",
        description: "Lütfen ay, yıl seçin ve Excel dosyası yükleyin",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append("excel", file);
    formData.append("ay", selectedAy);
    formData.append("yil", selectedYil);

    try {
      const response = await fetch("/api/gumruk/yukle", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Başarılı",
          description: result.message,
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
    }
  };

  const resetForm = () => {
    setSelectedAy("");
    setSelectedYil(String(currentYear));
    setFile(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Excel Yükle
          </DialogTitle>
          <DialogDescription>
            Gümrük verilerini içeren Excel dosyasını yükleyin
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
            disabled={!selectedAy || !selectedYil || !file || isUploading}
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
