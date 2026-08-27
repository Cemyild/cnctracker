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
import { SayfaBasligi } from "./kasaUI";
import { Search, Plus, Upload, FileDown, Pencil, Power, Trash2 } from "lucide-react";

type IbanSatir = { paraBirimi: string; iban: string; etiket: string };
type FirmaFormu = { id?: string; ad: string; vergiNo: string; notlar: string; ibanlar: IbanSatir[] };
const BOS_FORM: FirmaFormu = { ad: "", vergiNo: "", notlar: "", ibanlar: [] };

const KAYNAK_ETIKET: Record<string, string> = { muhasebe: "Muhasebe", temsilci: "Temsilci", depo: "Depo" };

// Tek accent (indigo) — para birimi rozetleri de dahil, gökkuşağı yok.
const DOVIZ_ROZET = "border-transparent bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300";
// 800+ satırlık liste: rozetler satır yüksekliğini büyütmesin.
const DOVIZ_ROZET_MINI = `${DOVIZ_ROZET} shrink-0 px-1.5 py-0 text-[10px] leading-4`;

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

      {/* Firma listesi — 800+ kayıt: kart yığını yerine tek yoğun liste.
          Ad + IBAN aynı satırda; IBAN başlıkları (Döviz/IBAN/Etiket) her satırda
          tekrarlanmıyor, yalnız kolon sırası olarak korunuyor. */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {filtreli.map((f) => {
          const ibanlar = f.ibanlar ?? [];
          return (
            <div
              key={f.id}
              className={`flex flex-wrap items-start gap-x-4 gap-y-1 border-b px-3 py-2 last:border-b-0 hover:bg-muted/30 ${f.aktif ? "" : "opacity-60"}`}
              data-testid={`row-firma-${f.id}`}
            >
              {/* Ad + ikincil bilgi */}
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium" title={f.ad}>{f.ad}</span>
                  {!f.aktif && (
                    <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] leading-4">Pasif</Badge>
                  )}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {f.vergiNo ? `VKN ${f.vergiNo} · ` : ""}
                  {KAYNAK_ETIKET[f.kaynak] ?? f.kaynak} · {f.kullanimSayisi} kullanım
                </div>
              </div>

              {/* IBAN'lar — tek IBAN tek satır, çoklu IBAN alt alta */}
              <div className="min-w-0 flex-[2] basis-80 space-y-0.5">
                {ibanlar.length === 0 ? (
                  <Badge variant="destructive" className="px-1.5 py-0 text-[10px] leading-4" data-testid={`rozet-iban-yok-${f.id}`}>
                    IBAN yok
                  </Badge>
                ) : (
                  ibanlar.map((i) => (
                    <div key={i.id} className="flex items-center gap-2 text-xs">
                      <Badge className={DOVIZ_ROZET_MINI}>{i.paraBirimi}</Badge>
                      <span className="truncate font-mono tabular-nums">{i.iban}</span>
                      {i.etiket && <span className="truncate text-muted-foreground">{i.etiket}</span>}
                    </div>
                  ))
                )}
              </div>

              {/* Aksiyonlar — metin buton 800 satırda yer yiyor; ikon + tooltip */}
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost" size="icon" className="h-7 w-7" title="Düzenle"
                  onClick={() => duzenleAc(f)} data-testid={`button-firma-duzenle-${f.id}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="sr-only">Düzenle</span>
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7" title={f.aktif ? "Pasifleştir" : "Aktifleştir"}
                  onClick={() => aktifToggle(f)} data-testid={`button-firma-aktif-${f.id}`}
                >
                  <Power className="h-3.5 w-3.5" />
                  <span className="sr-only">{f.aktif ? "Pasifleştir" : "Aktifleştir"}</span>
                </Button>
              </div>
            </div>
          );
        })}
        {filtreli.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">Kayıt yok.</div>
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
