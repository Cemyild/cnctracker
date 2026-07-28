import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { OdemeSirketiDetay } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { firmaIbanOzet } from "./portalUtils";
import { SayfaBasligi } from "./kasaUI";
import { Search, Plus, Upload, FileDown, Pencil, Power, Trash2 } from "lucide-react";

type IbanSatir = { paraBirimi: string; iban: string; etiket: string };
type FirmaFormu = { id?: string; ad: string; vergiNo: string; notlar: string; ibanlar: IbanSatir[] };
const BOS_FORM: FirmaFormu = { ad: "", vergiNo: "", notlar: "", ibanlar: [] };

const KAYNAK_ETIKET: Record<string, string> = { muhasebe: "Muhasebe", temsilci: "Temsilci", depo: "Depo" };

// Tek accent (indigo) — para birimi rozetleri de dahil, gökkuşağı yok.
const DOVIZ_ROZET = "border-transparent bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300";

function bas2(s: string | null | undefined) {
  return (s ?? "?").trim().slice(0, 2).toUpperCase();
}

export default function FirmalarSayfasi() {
  const { toast } = useToast();
  const { data: firmalar = [] } = useQuery<OdemeSirketiDetay[]>({
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
        (f.vergiNo ?? "").toLocaleLowerCase("tr").includes(q) ||
        (f.ibanlar ?? []).some((i) => i.iban.toLocaleLowerCase("tr").includes(q)),
    );
  }, [firmalar, arama]);

  const yeniAc = () => { setForm({ ...BOS_FORM }); setDialogAcik(true); };
  const duzenleAc = (f: OdemeSirketiDetay) => {
    setForm({
      id: f.id, ad: f.ad, vergiNo: f.vergiNo ?? "", notlar: f.notlar ?? "",
      ibanlar: (f.ibanlar ?? []).map((i) => ({ paraBirimi: i.paraBirimi, iban: i.iban, etiket: i.etiket ?? "" })),
    });
    setDialogAcik(true);
  };

  const tazele = () => queryClient.invalidateQueries({ queryKey: ["/api/portal/odeme-sirketleri/tumu"] });

  // Portal kalıbı: ham fetch + { error } gövdesinden temiz Türkçe mesaj
  // (apiRequest non-ok'ta kendi mesajıyla throw edip 409/404 gövdesini yutardı).
  const ibanEkle = () => setForm((p) => ({ ...p, ibanlar: [...p.ibanlar, { paraBirimi: "USD", iban: "", etiket: "" }] }));
  const ibanKaldir = (i: number) => setForm((p) => ({ ...p, ibanlar: p.ibanlar.filter((_, idx) => idx !== i) }));
  const ibanDegistir = (i: number, alan: keyof IbanSatir, deger: string) =>
    setForm((p) => ({ ...p, ibanlar: p.ibanlar.map((x, idx) => (idx === i ? { ...x, [alan]: deger } : x)) }));

  const kaydet = async () => {
    if (!form.ad.trim()) { toast({ title: "Firma adı zorunlu", variant: "destructive" }); return; }
    setKaydediliyor(true);
    try {
      const govde = {
        ad: form.ad, vergiNo: form.vergiNo, notlar: form.notlar,
        ibanlar: form.ibanlar.filter((x) => x.iban.trim()).map((x) => ({ paraBirimi: x.paraBirimi, iban: x.iban.trim(), etiket: x.etiket.trim() || null })),
      };
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

  const aktifToggle = async (f: OdemeSirketiDetay) => {
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
  const sablonIndir = () => { window.location.href = "/api/portal/odeme-sirketleri/sablon"; };
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
      <SayfaBasligi baslik="Ödeme Firmaları" alt={`${firmalar.length} kayıtlı firma · ödeme yapılacak firma ve IBAN listesi`} />

      {/* Arama + Excel/ekleme aksiyonları */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Firma adı, IBAN veya vergi no ara…"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            className="pl-9"
            data-testid="input-firma-arama"
          />
        </div>
        <div className="flex gap-2">
          <input ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={excelYukle} data-testid="input-firma-excel-file" />
          <Button variant="outline" onClick={excelSec} data-testid="button-firma-excel">
            <Upload className="mr-1.5 h-4 w-4" />Excel Yükle
          </Button>
          <Button variant="outline" onClick={sablonIndir} data-testid="button-firma-sablon">
            <FileDown className="mr-1.5 h-4 w-4" />Şablon İndir
          </Button>
          <Button onClick={yeniAc} data-testid="button-firma-ekle">
            <Plus className="mr-1.5 h-4 w-4" />Elle Ekle
          </Button>
        </div>
      </div>

      {/* Firma kartları */}
      <div className="space-y-3">
        {filtreli.map((f) => {
          const ozet = firmaIbanOzet(f);
          const ibanlar = f.ibanlar ?? [];
          return (
            <div key={f.id} className="overflow-hidden rounded-xl border bg-card shadow-sm" data-testid={`row-firma-${f.id}`}>
              <div className={`flex flex-wrap items-center justify-between gap-3 p-4 ${f.aktif ? "" : "opacity-60"}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-bold text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                    {bas2(f.ad)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold" title={f.ad}>{f.ad}</span>
                      <Badge variant={f.aktif ? "outline" : "secondary"} className="text-[10px] font-medium">
                        {f.aktif ? "Aktif" : "Pasif"}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Vergi No: {f.vergiNo || "—"}</span>
                      <span>{KAYNAK_ETIKET[f.kaynak] ?? f.kaynak}</span>
                      <span>{f.kullanimSayisi} kullanım</span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {ozet.length > 0 ? (
                    ozet.map((o) => (
                      <Badge key={o.paraBirimi} className={DOVIZ_ROZET}>
                        {o.paraBirimi}{o.adet > 1 ? ` ×${o.adet}` : ""}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="destructive" data-testid={`rozet-iban-yok-${f.id}`}>IBAN yok</Badge>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => duzenleAc(f)} data-testid={`button-firma-duzenle-${f.id}`}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />Düzenle
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => aktifToggle(f)} data-testid={`button-firma-aktif-${f.id}`}>
                    <Power className="mr-1 h-3.5 w-3.5" />{f.aktif ? "Pasifleştir" : "Aktifleştir"}
                  </Button>
                </div>
              </div>

              {/* IBAN alt-tablosu */}
              {ibanlar.length > 0 && (
                <div className="border-t bg-muted/20 px-4 py-2.5">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="w-20 pb-1.5 pr-3 font-medium">Döviz</th>
                        <th className="pb-1.5 pr-3 font-medium">IBAN</th>
                        <th className="pb-1.5 font-medium">Etiket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ibanlar.map((i) => (
                        <tr key={i.id} className="border-t border-dashed border-border/60">
                          <td className="py-1.5 pr-3">
                            <Badge className={DOVIZ_ROZET}>{i.paraBirimi}</Badge>
                          </td>
                          <td className="py-1.5 pr-3 font-mono tabular-nums">{i.iban}</td>
                          <td className="py-1.5 text-muted-foreground">{i.etiket || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {filtreli.length === 0 && (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">Kayıt yok.</div>
        )}
      </div>

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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>IBAN'lar</Label>
                <Button type="button" variant="outline" size="sm" onClick={ibanEkle} data-testid="button-iban-ekle">
                  <Plus className="mr-1 h-3.5 w-3.5" />IBAN Ekle
                </Button>
              </div>
              {form.ibanlar.length === 0 && <p className="text-xs text-muted-foreground">Henüz IBAN yok — "IBAN Ekle" ile satır ekleyin.</p>}
              {form.ibanlar.map((satir, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-2" data-testid={`iban-satir-${i}`}>
                  <div className="w-24">
                    <Select value={satir.paraBirimi} onValueChange={(v) => ibanDegistir(i, "paraBirimi", v)}>
                      <SelectTrigger data-testid={`select-iban-pb-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TRY">TRY</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input className="flex-1 min-w-[180px] font-mono tabular-nums" placeholder="TR.." value={satir.iban} onChange={(e) => ibanDegistir(i, "iban", e.target.value)} data-testid={`input-iban-no-${i}`} />
                  <Input className="w-40" placeholder="Etiket (banka)" value={satir.etiket} onChange={(e) => ibanDegistir(i, "etiket", e.target.value)} data-testid={`input-iban-etiket-${i}`} />
                  <Button type="button" variant="ghost" size="sm" onClick={() => ibanKaldir(i)} data-testid={`button-iban-kaldir-${i}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label>Vergi/TC No</Label>
              <Input value={form.vergiNo} onChange={(e) => setForm({ ...form, vergiNo: e.target.value })} data-testid="input-firma-vergino" />
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
