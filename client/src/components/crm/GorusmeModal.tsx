import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { bugun, GORUSME_TIPLERI, type CrmGorusme, type CrmKisi } from "./tipler";

const KISISIZ_DEGER = "__yok__";

type Props = {
  open: boolean;
  musteriId: string;
  kisiler: CrmKisi[];
  duzenlenen: CrmGorusme | null;
  onClose: () => void;
};

export function GorusmeModal({ open, musteriId, kisiler, duzenlenen, onClose }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const bosForm = {
    tarih: bugun(),
    tip: "telefon",
    kisiId: KISISIZ_DEGER,
    konu: "",
    notlar: "",
    personel: "",
    takipTarihi: "",
  };
  const [form, setForm] = useState(bosForm);

  useEffect(() => {
    if (!open) return;
    setForm(
      duzenlenen
        ? {
            tarih: duzenlenen.tarih,
            tip: duzenlenen.tip,
            kisiId: duzenlenen.kisiId ?? KISISIZ_DEGER,
            konu: duzenlenen.konu,
            notlar: duzenlenen.notlar ?? "",
            personel: duzenlenen.personel ?? "",
            takipTarihi: duzenlenen.takipTarihi ?? "",
          }
        : { ...bosForm, tarih: bugun() },
    );
    // bosForm her render yeniden kurulur; bağımlılığa alınırsa döngü olur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, duzenlenen]);

  const gonder = useMutation({
    mutationFn: async () => {
      const govde = {
        musteriId,
        tarih: form.tarih,
        tip: form.tip,
        kisiId: form.kisiId === KISISIZ_DEGER ? null : form.kisiId,
        konu: form.konu.trim(),
        notlar: form.notlar,
        personel: form.personel,
        takipTarihi: form.takipTarihi || null,
      };
      const url = duzenlenen ? `/api/crm/gorusmeler/${duzenlenen.id}` : "/api/crm/gorusmeler";
      const res = await fetch(url, {
        method: duzenlenen ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(govde),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Kaydedilemedi");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/crm/musteriler", musteriId] });
      qc.invalidateQueries({ queryKey: ["/api/crm/musteriler"] });
      qc.invalidateQueries({ queryKey: ["/api/crm/takipler"] });
      qc.invalidateQueries({ queryKey: ["/api/crm/stats"] });
      onClose();
      toast({ title: duzenlenen ? "Görüşme güncellendi" : "Görüşme kaydedildi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const kaydedilemez = !form.konu.trim() || !form.tarih || gonder.isPending;

  return (
    <Dialog open={open} onOpenChange={(a) => !a && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="min-w-0">
          <DialogTitle>{duzenlenen ? "Görüşmeyi Düzenle" : "Görüşme Kaydı"}</DialogTitle>
        </DialogHeader>

        <div className="grid min-w-0 gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid min-w-0 gap-1.5">
              <Label className="text-[12.5px] font-semibold">Tarih *</Label>
              <Input type="date" value={form.tarih} onChange={(e) => setForm({ ...form, tarih: e.target.value })} />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label className="text-[12.5px] font-semibold">Görüşme Türü</Label>
              <Select value={form.tip} onValueChange={(v) => setForm({ ...form, tip: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GORUSME_TIPLERI.map((t) => (
                    <SelectItem key={t.kod} value={t.kod}>{t.etiket}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid min-w-0 gap-1.5">
            <Label className="text-[12.5px] font-semibold">Görüşülen Kişi</Label>
            <Select value={form.kisiId} onValueChange={(v) => setForm({ ...form, kisiId: v })}>
              <SelectTrigger><SelectValue placeholder="Seçiniz" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KISISIZ_DEGER}>Belirtilmedi</SelectItem>
                {kisiler.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.adSoyad}{k.departmanAd ? ` — ${k.departmanAd}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid min-w-0 gap-1.5">
            <Label className="text-[12.5px] font-semibold">Konu *</Label>
            <Input
              value={form.konu}
              onChange={(e) => setForm({ ...form, konu: e.target.value })}
              placeholder="Bekleyen beyanname evrakları"
            />
          </div>

          <div className="grid min-w-0 gap-1.5">
            <Label className="text-[12.5px] font-semibold">Notlar</Label>
            <Textarea
              rows={3}
              value={form.notlar}
              onChange={(e) => setForm({ ...form, notlar: e.target.value })}
              placeholder="Konuşulanlar, verilen sözler, kararlar…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid min-w-0 gap-1.5">
              <Label className="text-[12.5px] font-semibold">Görüşmeyi Yapan</Label>
              <Input
                value={form.personel}
                onChange={(e) => setForm({ ...form, personel: e.target.value })}
                placeholder="Personel adı"
              />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label className="text-[12.5px] font-semibold">Takip Tarihi</Label>
              <Input
                type="date"
                value={form.takipTarihi}
                onChange={(e) => setForm({ ...form, takipTarihi: e.target.value })}
              />
            </div>
          </div>
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            Takip tarihi girerseniz görüşme, tamamlandı olarak işaretlenene kadar
            üstteki <strong>Bekleyen Takip</strong> sayacında görünür.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button
            className="bg-slate-900 text-white hover:bg-slate-800"
            disabled={kaydedilemez}
            onClick={() => gonder.mutate()}
          >
            {duzenlenen ? "Güncelle" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
