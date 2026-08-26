import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { CrmDepartman, CrmKisi } from "./tipler";

const DEPARTMANSIZ_DEGER = "__yok__";

const bosForm = {
  adSoyad: "",
  departmanId: DEPARTMANSIZ_DEGER,
  unvan: "",
  telefon: "",
  cepTelefon: "",
  email: "",
  birincil: false,
  aktif: true,
  notlar: "",
};

type Props = {
  open: boolean;
  musteriId: string;
  departmanlar: CrmDepartman[];
  duzenlenen: CrmKisi | null;
  // Yeni kişi eklenirken hangi departmanın "+" düğmesine basıldıysa o seçili gelsin.
  onDepartmanId?: string | null;
  onClose: () => void;
};

export function KisiModal({ open, musteriId, departmanlar, duzenlenen, onDepartmanId, onClose }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(bosForm);

  useEffect(() => {
    if (!open) return;
    setForm(
      duzenlenen
        ? {
            adSoyad: duzenlenen.adSoyad,
            departmanId: duzenlenen.departmanId ?? DEPARTMANSIZ_DEGER,
            unvan: duzenlenen.unvan ?? "",
            telefon: duzenlenen.telefon ?? "",
            cepTelefon: duzenlenen.cepTelefon ?? "",
            email: duzenlenen.email ?? "",
            birincil: duzenlenen.birincil,
            aktif: duzenlenen.aktif,
            notlar: duzenlenen.notlar ?? "",
          }
        : { ...bosForm, departmanId: onDepartmanId ?? DEPARTMANSIZ_DEGER },
    );
  }, [open, duzenlenen, onDepartmanId]);

  const tazele = () => {
    qc.invalidateQueries({ queryKey: ["/api/crm/musteriler", musteriId] });
    qc.invalidateQueries({ queryKey: ["/api/crm/musteriler"] });
    qc.invalidateQueries({ queryKey: ["/api/crm/rehber"] });
    qc.invalidateQueries({ queryKey: ["/api/crm/stats"] });
  };

  const gonder = useMutation({
    mutationFn: async () => {
      const govde = {
        musteriId,
        adSoyad: form.adSoyad.trim(),
        departmanId: form.departmanId === DEPARTMANSIZ_DEGER ? null : form.departmanId,
        unvan: form.unvan,
        telefon: form.telefon,
        cepTelefon: form.cepTelefon,
        email: form.email,
        birincil: form.birincil,
        aktif: form.aktif,
        notlar: form.notlar,
      };
      const url = duzenlenen ? `/api/crm/kisiler/${duzenlenen.id}` : "/api/crm/kisiler";
      const res = await fetch(url, {
        method: duzenlenen ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(govde),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Kaydedilemedi");
      return res.json();
    },
    onSuccess: () => {
      tazele();
      onClose();
      toast({ title: duzenlenen ? "Kişi güncellendi" : "Kişi eklendi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const kaydedilemez = !form.adSoyad.trim() || gonder.isPending;

  return (
    <Dialog open={open} onOpenChange={(a) => !a && onClose()}>
      {/* min-w-0: DialogContent bir grid; içerideki uzun metin min-w-0 olmadan
          modalı yatayda şişirir. */}
      <DialogContent className="max-w-lg">
        <DialogHeader className="min-w-0">
          <DialogTitle>{duzenlenen ? "Kişiyi Düzenle" : "Yeni İletişim Kişisi"}</DialogTitle>
        </DialogHeader>

        <div className="grid min-w-0 gap-3.5">
          <div className="grid gap-1.5">
            <Label className="text-[12.5px] font-semibold">Ad Soyad *</Label>
            <Input
              value={form.adSoyad}
              onChange={(e) => setForm({ ...form, adSoyad: e.target.value })}
              placeholder="Ahmet Yılmaz"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid min-w-0 gap-1.5">
              <Label className="text-[12.5px] font-semibold">Departman</Label>
              <Select value={form.departmanId} onValueChange={(v) => setForm({ ...form, departmanId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEPARTMANSIZ_DEGER}>Departmansız</SelectItem>
                  {departmanlar.filter((d) => d.aktif || d.id === form.departmanId).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.ad}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label className="text-[12.5px] font-semibold">Görev / Ünvan</Label>
              <Input
                value={form.unvan}
                onChange={(e) => setForm({ ...form, unvan: e.target.value })}
                placeholder="İthalat Şefi"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid min-w-0 gap-1.5">
              <Label className="text-[12.5px] font-semibold">Telefon</Label>
              <Input
                value={form.telefon}
                onChange={(e) => setForm({ ...form, telefon: e.target.value })}
                placeholder="0212 000 00 00"
              />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label className="text-[12.5px] font-semibold">Cep Telefonu</Label>
              <Input
                value={form.cepTelefon}
                onChange={(e) => setForm({ ...form, cepTelefon: e.target.value })}
                placeholder="0532 000 00 00"
              />
            </div>
          </div>

          <div className="grid min-w-0 gap-1.5">
            <Label className="text-[12.5px] font-semibold">E-posta</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="ahmet@firma.com"
            />
          </div>

          <div className="grid min-w-0 gap-1.5">
            <Label className="text-[12.5px] font-semibold">Not</Label>
            <Textarea
              rows={2}
              value={form.notlar}
              onChange={(e) => setForm({ ...form, notlar: e.target.value })}
              placeholder="Öğleden sonra aranmalı, İngilizce konuşuyor…"
            />
          </div>

          <div className="flex flex-wrap items-center gap-6 rounded-[10px] border bg-muted/40 px-3.5 py-3">
            <label className="flex cursor-pointer items-center gap-2.5">
              <Switch checked={form.birincil} onCheckedChange={(v) => setForm({ ...form, birincil: v })} />
              <span className="text-[12.5px] font-semibold">Birincil muhatap</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5">
              <Switch checked={form.aktif} onCheckedChange={(v) => setForm({ ...form, aktif: v })} />
              <span className="text-[12.5px] font-semibold">Aktif</span>
            </label>
          </div>
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            Birincil muhatap, o departmanda önce aranacak kişidir. İşaretlendiğinde aynı
            departmandaki eski birincil kişi otomatik olarak düşer. İşten ayrılan kişiyi
            silmek yerine <strong>Aktif</strong> anahtarını kapatın — geçmiş görüşme kayıtları korunur.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button
            className="bg-slate-900 text-white hover:bg-slate-800"
            disabled={kaydedilemez}
            onClick={() => gonder.mutate()}
          >
            {duzenlenen ? "Güncelle" : "Ekle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
