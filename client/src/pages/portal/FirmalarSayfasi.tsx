import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { OdemeSirketi } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { firmaParaBirimleri } from "./portalUtils";

type FirmaFormu = { id?: string; ad: string; ibanTry: string; ibanUsd: string; banka: string; vergiNo: string; notlar: string };
const BOS_FORM: FirmaFormu = { ad: "", ibanTry: "", ibanUsd: "", banka: "", vergiNo: "", notlar: "" };

const KAYNAK_ETIKET: Record<string, string> = { muhasebe: "Muhasebe", temsilci: "Temsilci", depo: "Depo" };

export default function FirmalarSayfasi() {
  const { toast } = useToast();
  const { data: firmalar = [] } = useQuery<OdemeSirketi[]>({
    queryKey: ["/api/portal/odeme-sirketleri/tumu"],
  });
  const [arama, setArama] = useState("");
  const [dialogAcik, setDialogAcik] = useState(false);
  const [form, setForm] = useState<FirmaFormu>({ ...BOS_FORM });
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const excelRef = useRef<HTMLInputElement>(null);

  const filtreli = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (!q) return firmalar;
    return firmalar.filter(
      (f) =>
        f.ad.toLocaleLowerCase("tr").includes(q) ||
        (f.ibanTry ?? "").toLocaleLowerCase("tr").includes(q) ||
        (f.ibanUsd ?? "").toLocaleLowerCase("tr").includes(q) ||
        (f.iban ?? "").toLocaleLowerCase("tr").includes(q) ||
        (f.vergiNo ?? "").toLocaleLowerCase("tr").includes(q),
    );
  }, [firmalar, arama]);

  const yeniAc = () => { setForm({ ...BOS_FORM }); setDialogAcik(true); };
  const duzenleAc = (f: OdemeSirketi) => {
    setForm({ id: f.id, ad: f.ad, ibanTry: f.ibanTry ?? f.iban ?? "", ibanUsd: f.ibanUsd ?? "", banka: f.banka ?? "", vergiNo: f.vergiNo ?? "", notlar: f.notlar ?? "" });
    setDialogAcik(true);
  };

  const tazele = () => queryClient.invalidateQueries({ queryKey: ["/api/portal/odeme-sirketleri/tumu"] });

  // Portal kalıbı: ham fetch + { error } gövdesinden temiz Türkçe mesaj
  // (apiRequest non-ok'ta kendi mesajıyla throw edip 409/404 gövdesini yutardı).
  const kaydet = async () => {
    if (!form.ad.trim()) { toast({ title: "Firma adı zorunlu", variant: "destructive" }); return; }
    setKaydediliyor(true);
    try {
      const govde = { ad: form.ad, ibanTry: form.ibanTry, ibanUsd: form.ibanUsd, banka: form.banka, vergiNo: form.vergiNo, notlar: form.notlar };
      const url = form.id ? `/api/portal/odeme-sirketleri/${form.id}` : "/api/portal/odeme-sirketleri";
      const res = await fetch(url, {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(govde),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydedilemedi");
      toast({ title: form.id ? "Firma güncellendi" : "Firma eklendi" });
      setDialogAcik(false);
      tazele();
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setKaydediliyor(false);
    }
  };

  const aktifToggle = async (f: OdemeSirketi) => {
    try {
      const res = await fetch(`/api/portal/odeme-sirketleri/${f.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktif: !f.aktif }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Güncellenemedi");
      tazele();
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    }
  };

  const excelSec = () => excelRef.current?.click();
  const excelYukle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const dosya = e.target.files?.[0];
    if (!dosya) return;
    try {
      const fd = new FormData();
      fd.set("excel", dosya);
      const res = await fetch("/api/portal/odeme-sirketleri/excel", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Excel yüklenemedi");
      const s = await res.json();
      toast({ title: "Excel işlendi", description: `${s.eklendi} eklendi, ${s.guncellendi} güncellendi, ${s.atlandi} atlandı` });
      tazele();
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      if (excelRef.current) excelRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle>Ödeme Yapılacak Firmalar ({firmalar.length})</CardTitle>
          <div className="flex gap-2">
            <input ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={excelYukle} data-testid="input-firma-excel-file" />
            <Button variant="outline" onClick={excelSec} data-testid="button-firma-excel">Excel Yükle</Button>
            <Button onClick={yeniAc} data-testid="button-firma-ekle">Elle Ekle</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Firma adı, IBAN veya vergi no ara…"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            data-testid="input-firma-arama"
          />
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left">
                  <th className="p-2">Ad</th>
                  <th className="p-2">IBAN</th>
                  <th className="p-2">Banka</th>
                  <th className="p-2">Vergi No</th>
                  <th className="p-2">Kaynak</th>
                  <th className="p-2">Kullanım</th>
                  <th className="p-2">Durum</th>
                  <th className="p-2 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filtreli.map((f) => (
                  <tr key={f.id} className={`border-b ${f.aktif ? "" : "opacity-50"}`} data-testid={`row-firma-${f.id}`}>
                    <td className="p-2 font-medium">{f.ad}</td>
                    <td className="p-2">
                      {firmaParaBirimleri(f).length > 0 ? (
                        firmaParaBirimleri(f).map((pb) => (
                          <Badge key={pb} variant="secondary" className="mr-1">{pb}</Badge>
                        ))
                      ) : (
                        <Badge variant="destructive" data-testid={`rozet-iban-yok-${f.id}`}>IBAN yok</Badge>
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground">{f.banka ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{f.vergiNo ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{KAYNAK_ETIKET[f.kaynak] ?? f.kaynak}</td>
                    <td className="p-2 text-muted-foreground">{f.kullanimSayisi}</td>
                    <td className="p-2">{f.aktif ? "Aktif" : "Pasif"}</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => duzenleAc(f)} data-testid={`button-firma-duzenle-${f.id}`}>Düzenle</Button>
                      <Button variant="ghost" size="sm" onClick={() => aktifToggle(f)} data-testid={`button-firma-aktif-${f.id}`}>
                        {f.aktif ? "Pasifleştir" : "Aktifleştir"}
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtreli.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Kayıt yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogAcik} onOpenChange={setDialogAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Firma Düzenle" : "Yeni Firma"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Firma Adı</Label>
              <Input value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} data-testid="input-firma-ad" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>IBAN (TRY)</Label>
                <Input value={form.ibanTry} onChange={(e) => setForm({ ...form, ibanTry: e.target.value })} placeholder="TR.." data-testid="input-firma-iban-try" />
              </div>
              <div className="space-y-1">
                <Label>IBAN (USD)</Label>
                <Input value={form.ibanUsd} onChange={(e) => setForm({ ...form, ibanUsd: e.target.value })} placeholder="TR.." data-testid="input-firma-iban-usd" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Banka</Label>
                <Input value={form.banka} onChange={(e) => setForm({ ...form, banka: e.target.value })} data-testid="input-firma-banka" />
              </div>
              <div className="space-y-1">
                <Label>Vergi/TC No</Label>
                <Input value={form.vergiNo} onChange={(e) => setForm({ ...form, vergiNo: e.target.value })} data-testid="input-firma-vergino" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Not</Label>
              <Textarea value={form.notlar} onChange={(e) => setForm({ ...form, notlar: e.target.value })} data-testid="input-firma-notlar" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAcik(false)}>Vazgeç</Button>
            <Button onClick={kaydet} disabled={kaydediliyor} data-testid="button-firma-kaydet">
              {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
