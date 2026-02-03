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
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type Gider, subeler } from "@shared/schema";
import { CategoryManager } from "./CategoryManager";
import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react";

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
  });

  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  const { data: categories, refetch: refetchCategories } = useQuery<{id: string, name: string}[]>({
    queryKey: ["/api/categories"],
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
              onValueChange={(val) => setFormData({ ...formData, kategori: val })}
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
