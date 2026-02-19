import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Loader2, Save, Car } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type Gider, subeler } from "@shared/schema";
import { CategoryManager } from "./CategoryManager";
import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react";

// Araç kategorileri - bu kategoriler seçildiğinde plaka sorulacak
const ARAC_KATEGORILERI = ["ARAÇ BAKIM", "ARAÇ MUAYENE", "ARAÇ ŞARJ", "ARAÇ KİRA", "ARAÇ ALIM"];

type Arac = {
  id: string;
  plaka: string;
  marka: string | null;
  model: string | null;
};

interface GiderEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gider: Gider | null;
  onSuccess: () => void;
}

export function GiderEditModal({
  open,
  onOpenChange,
  gider,
  onSuccess,
}: GiderEditModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    sube: "",
    kategori: "",
    plaka: "",
  });

  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  const { data: categories, refetch: refetchCategories } = useQuery<{id: string, name: string}[]>({
    queryKey: ["/api/categories"],
  });

  // Araçlar listesi (plaka dropdown için)
  const { data: araclar } = useQuery<Arac[]>({
    queryKey: ["/api/araclar"],
  });

  // Re-fetch categories when manager closes
  useEffect(() => {
    if (!isCategoryManagerOpen) {
        refetchCategories();
    }
  }, [isCategoryManagerOpen, refetchCategories]);

  useEffect(() => {
    if (gider) {
      setFormData({
        sube: gider.sube || "",
        kategori: gider.kategori || "",
        plaka: gider.plaka || "",
      });
    }
  }, [gider]);

  const handleSave = async () => {
    if (!gider) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/giderler/${gider.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error("Güncelleme başarısız");
      }

      toast({
        title: "Başarılı",
        description: "Gider güncellendi",
      });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Hata",
        description: "Güncelleme sırasında bir hata oluştu",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gider Düzenle</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Şube</Label>
            <Select
              value={formData.sube}
              onValueChange={(val) => setFormData({ ...formData, sube: val })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Şube Seçin" />
              </SelectTrigger>
              <SelectContent>
                {subeler.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
                <Label>Kategori</Label>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => setIsCategoryManagerOpen(true)}
                >
                    <Settings className="w-3 h-3 mr-1" />
                    Kategorileri Düzenle
                </Button>
            </div>

            <Select
              value={formData.kategori}
              onValueChange={(val) => {
                // Araç kategorisi değilse plakayı temizle
                const newPlaka = ARAC_KATEGORILERI.includes(val) ? formData.plaka : "";
                setFormData({ ...formData, kategori: val, plaka: newPlaka });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Kategori Seçin" />
              </SelectTrigger>
              <SelectContent>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Plaka dropdown - sadece araç kategorisi seçiliyse göster */}
          {ARAC_KATEGORILERI.includes(formData.kategori) && (
            <div className="grid gap-2">
              <Label className="flex items-center gap-2">
                <Car className="w-4 h-4" />
                Araç Plakası
              </Label>
              <Select
                value={formData.plaka}
                onValueChange={(val) => setFormData({ ...formData, plaka: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Plaka Seçin" />
                </SelectTrigger>
                <SelectContent>
                  {araclar?.map((a) => (
                    <SelectItem key={a.id} value={a.plaka}>
                      {a.plaka} {a.marka && a.model ? `(${a.marka} ${a.model})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            İptal
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Kaydediliyor
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Kaydet
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
      
      <CategoryManager 
        open={isCategoryManagerOpen} 
        onOpenChange={setIsCategoryManagerOpen} 
      />
    </Dialog>
  );
}
