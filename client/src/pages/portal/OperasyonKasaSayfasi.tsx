import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Beyanname, OperasyonAvans, OperasyonMasraf } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatTarihKisa, formatPara } from "./portalUtils";
import YeniOdemeModal from "./YeniOdemeModal";
import { masraflariGrupla } from "./masrafGruplama";
import { ChevronRight, ChevronDown } from "lucide-react";

type Ozet = { bakiye: number; avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] };

// Açık Hareketler tablosu sütun şablonu — TÜM satırlarda birebir aynı olmalı ki
// sütunlar hizalansın. Her satır ayrı bir grid container; sütunlar ancak SABİT
// genişlikle satırlar arası aynı hizaya oturur ("auto" → içeriğe göre kayma/dalga).
const GRID = "grid-cols-[140px_minmax(0,1fr)_minmax(0,1.4fr)_130px_20px]";

export default function OperasyonKasaSayfasi() {
  const { toast } = useToast();
  const { data: ozet } = useQuery<Ozet>({
    queryKey: ["/api/portal/operasyon/ozet"],
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({ queryKey: ["/api/portal/beyannameler"] });

  const [yeniOdeme, setYeniOdeme] = useState(false);
  const [kapatDialog, setKapatDialog] = useState(false);
  const [kapatiliyor, setKapatiliyor] = useState(false);

  const acikMasrafToplam = (ozet?.masraflar ?? []).reduce((s, m) => s + parseFloat(m.tutar), 0);
  const acikAvansToplam = (ozet?.avanslar ?? []).reduce((s, a) => s + parseFloat(a.tutar), 0);

  const [acikGruplar, setAcikGruplar] = useState<Set<string>>(new Set());
  const grupAcKapa = (k: string) => setAcikGruplar((prev) => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  const beyannameMap = useMemo(() => new Map(beyannameler.map((b) => [b.id, b])), [beyannameler]);

  // Gruplama ortak yardımcıda (Kapanışlarım da aynısını kullanır).
  const { gruplar, ofisMasraflar, ofisToplam } = useMemo(
    () => masraflariGrupla(ozet?.masraflar ?? [], beyannameMap),
    [ozet?.masraflar, beyannameMap],
  );

  const tazele = () => queryClient.invalidateQueries({ queryKey: ["/api/portal/operasyon/ozet"] });

  const masrafKaldir = async (id: string) => {
    try {
      const res = await fetch(`/api/portal/operasyon/masraf/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Silinemedi");
      tazele();
    } catch (err: any) { toast({ title: "Hata", description: err.message, variant: "destructive" }); }
  };

  const gunuKapat = async () => {
    setKapatiliyor(true);
    try {
      const res = await fetch("/api/portal/operasyon/gunu-kapat", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Kapatılamadı");
      toast({ title: "Gün kapatıldı", description: "Rapor muhasebeye iletildi." });
      setKapatDialog(false);
      tazele();
      queryClient.invalidateQueries({ queryKey: ["/api/portal/operasyon/kapanislar"] });
    } catch (err: any) { toast({ title: "Hata", description: err.message, variant: "destructive" }); }
    finally { setKapatiliyor(false); }
  };

  const hareketSayisi = (ozet?.avanslar.length ?? 0) + (ozet?.masraflar.length ?? 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Güncel Bakiye</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold" data-testid="text-bakiye">{formatPara(ozet?.bakiye ?? 0, "TL")}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Açık Avans</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold text-green-600">{formatPara(acikAvansToplam, "TL")}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Açık Masraf</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold text-destructive">{formatPara(acikMasrafToplam, "TL")}</div></CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <Button size="lg" onClick={() => setYeniOdeme(true)} data-testid="button-op-yeni-odeme">+ Yeni Ödeme Kaydet</Button>
        <Button variant="outline" onClick={() => setKapatDialog(true)} disabled={hareketSayisi === 0} data-testid="button-op-gunu-kapat">Günü Kapat</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Açık Hareketler</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Blok 1 — Avanslar (yeşil, sade) */}
          {(ozet?.avanslar.length ?? 0) > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Avanslar</div>
              {(ozet?.avanslar ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm dark:border-green-900 dark:bg-green-950/40" data-testid={`row-avans-${a.id}`}>
                  <div className="text-green-700 dark:text-green-400">
                    <span className="mr-1.5 font-normal text-muted-foreground">{formatTarihKisa(a.tarih)}</span><span className="font-medium">Gelen Avans</span>
                    {a.belgeDosya && <> · <a className="underline" href={"/" + a.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">dekont</a></>}
                  </div>
                  <div className="font-semibold text-green-700 dark:text-green-400">+{formatPara(a.tutar, "TL")}</div>
                </div>
              ))}
            </div>
          )}

          {/* Blok 2 — Masraflar (sütun başlıklı grid tablo) */}
          {(gruplar.length > 0 || ofisMasraflar.length > 0) && (
            <div className="rounded-md border">
              {/* Sütun başlıkları — yalnız en üstte bir kez */}
              <div className={`grid ${GRID} gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground`}>
                <span>Tarih · Dosya No</span>
                <span>Beyanname No</span>
                <span>Firma</span>
                <span className="text-right">Tutar</span>
                <span />
              </div>

              {gruplar.map((g) => {
                const acik = acikGruplar.has(g.beyannameId);
                const b = g.beyanname;
                return (
                  <div key={g.beyannameId} className="border-b last:border-b-0" data-testid={`group-beyanname-${g.beyannameId}`}>
                    <button type="button" onClick={() => grupAcKapa(g.beyannameId)} className={`grid w-full ${GRID} items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50`} data-testid={`button-group-toggle-${g.beyannameId}`}>
                      <span className="truncate font-semibold"><span className="mr-1.5 font-normal text-muted-foreground">{formatTarihKisa(g.tarih)}</span>{b?.dosyaNo ?? "?"}</span>
                      <span className="truncate text-muted-foreground">{b?.beyanNo ?? "—"}</span>
                      <span className="truncate" title={b?.alici ?? ""}>{b?.alici ?? "?"}</span>
                      <span className="text-right font-semibold text-destructive">−{formatPara(g.toplam, "TL")}</span>
                      {acik ? <ChevronDown className="h-4 w-4 justify-self-end" /> : <ChevronRight className="h-4 w-4 justify-self-end" />}
                    </button>
                    {acik && (
                      <div className="space-y-1 border-t bg-muted/20 px-3 py-1.5">
                        {g.masraflar.map((m) => (
                          <div key={m.id} className="flex items-center justify-between text-sm py-0.5" data-testid={`row-masraf-${m.id}`}>
                            <span className="min-w-0 truncate">{m.masrafTuru ?? "Masraf"} · {m.alacakli}{m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                              <Button variant="ghost" size="sm" onClick={() => masrafKaldir(m.id)} data-testid={`button-masraf-kaldir-${m.id}`}>Kaldır</Button>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {ofisMasraflar.length > 0 && (
                <div data-testid="group-ofis">
                  <button type="button" onClick={() => grupAcKapa("__ofis__")} className={`grid w-full ${GRID} items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50`} data-testid="button-group-toggle-ofis">
                    <span className="col-span-3 font-semibold">Ofis Masrafları</span>
                    <span className="text-right font-semibold text-destructive">−{formatPara(ofisToplam, "TL")}</span>
                    {acikGruplar.has("__ofis__") ? <ChevronDown className="h-4 w-4 justify-self-end" /> : <ChevronRight className="h-4 w-4 justify-self-end" />}
                  </button>
                  {acikGruplar.has("__ofis__") && (
                    <div className="space-y-1 border-t bg-muted/20 px-3 py-1.5">
                      {ofisMasraflar.map((m) => (
                        <div key={m.id} className="flex items-center justify-between text-sm py-0.5" data-testid={`row-masraf-${m.id}`}>
                          <span className="min-w-0 truncate"><Badge variant="outline" className="mr-1">Ofis</Badge>{m.masrafTuru ?? "Masraf"} · {m.aciklama ?? "—"}{m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                            <Button variant="ghost" size="sm" onClick={() => masrafKaldir(m.id)} data-testid={`button-masraf-kaldir-${m.id}`}>Kaldır</Button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {hareketSayisi === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Açık hareket yok.</p>
          )}
        </CardContent>
      </Card>

      <YeniOdemeModal open={yeniOdeme} onClose={() => setYeniOdeme(false)} />

      <Dialog open={kapatDialog} onOpenChange={setKapatDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Günü Kapat</DialogTitle></DialogHeader>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Açık avans:</span><span className="text-green-600">+{formatPara(acikAvansToplam, "TL")}</span></div>
            <div className="flex justify-between"><span>Açık masraf:</span><span className="text-destructive">−{formatPara(acikMasrafToplam, "TL")}</span></div>
            <div className="flex justify-between font-semibold border-t pt-1"><span>Kapanış bakiyesi:</span><span>{formatPara(ozet?.bakiye ?? 0, "TL")}</span></div>
            <p className="text-xs text-muted-foreground pt-2">Kapatınca bu hareketler kilitlenir ve rapor muhasebeye iletilir. Bakiye ertesi güne devreder.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKapatDialog(false)}>Vazgeç</Button>
            <Button onClick={gunuKapat} disabled={kapatiliyor} data-testid="button-op-kapat-onay">{kapatiliyor ? "Kapatılıyor…" : "Onayla ve Kapat"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
