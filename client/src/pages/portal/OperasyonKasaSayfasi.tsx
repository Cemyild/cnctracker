import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Beyanname, OperasyonAvans, OperasyonMasraf } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatTarihKisa, formatPara } from "./portalUtils";
import YeniOdemeModal from "./YeniOdemeModal";
import { masraflariGrupla } from "./masrafGruplama";
import { KpiKart, GunKutusu, SonDevirKart, IK } from "./kasaUI";
import { MasrafTablosu } from "./MasrafTablosu";
import { Plus, Lock } from "lucide-react";

type Ozet = {
  bakiye: number;
  avanslar: OperasyonAvans[];
  masraflar: OperasyonMasraf[];
  sonDevir: { gunTarihi: string; kapanisBakiye: string } | null;
};

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
      {/* Başlık şeridi + sabit gün kutusu */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Kasam</h1>
          <p className="text-sm text-muted-foreground">Şube kasası</p>
        </div>
        <GunKutusu />
      </div>

      {/* KPI kartları */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiKart ikon={<IK.Wallet className="h-[19px] w-[19px]" />} label="Güncel Bakiye" deger={`${formatPara(ozet?.bakiye ?? 0)} ₺`} alt="şube kasası · devrediyor" />
        <KpiKart ikon={<IK.ArrowDownToLine className="h-[19px] w-[19px]" />} label="Gelen Avans" deger={`${formatPara(acikAvansToplam)} ₺`} renk="text-emerald-600" alt="muhasebeden bekleyen" />
        <KpiKart ikon={<IK.ArrowUpFromLine className="h-[19px] w-[19px]" />} label="Güncel Masraflar" deger={`${formatPara(acikMasrafToplam)} ₺`} renk="text-rose-600" alt={`${ozet?.masraflar.length ?? 0} kalem · kapatılmamış`} />
        <SonDevirKart gunTarihi={ozet?.sonDevir?.gunTarihi ?? null} kapanisBakiye={ozet?.sonDevir?.kapanisBakiye ?? null} />
      </div>

      {/* Aksiyon barı */}
      <div className="flex items-center justify-between gap-3">
        <Button size="lg" onClick={() => setYeniOdeme(true)} data-testid="button-op-yeni-odeme"><Plus className="mr-1.5 h-4 w-4" />Yeni Ödeme Kaydet</Button>
        <Button variant="outline" size="lg" onClick={() => setKapatDialog(true)} disabled={hareketSayisi === 0} data-testid="button-op-gunu-kapat"><Lock className="mr-1.5 h-4 w-4" />Günü Kapat</Button>
      </div>

      {/* Açık Hareketler */}
      <Card>
        <CardHeader><CardTitle>Açık Hareketler</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {(ozet?.avanslar.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Gelen Avanslar</div>
              {(ozet?.avanslar ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/40" data-testid={`row-avans-${a.id}`}>
                  <div className="text-emerald-700 dark:text-emerald-400">
                    <span className="mr-1.5 font-normal text-muted-foreground">{formatTarihKisa(a.tarih)}</span><span className="font-medium">Gelen Avans</span>
                    {a.belgeDosya && <> · <a className="underline" href={"/" + a.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">dekont</a></>}
                  </div>
                  <div className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+{formatPara(a.tutar, "₺")}</div>
                </div>
              ))}
            </div>
          )}

          {(gruplar.length > 0 || ofisMasraflar.length > 0) && (
            <MasrafTablosu
              gruplarSonucu={{ gruplar, ofisMasraflar, ofisToplam }}
              acikSet={acikGruplar}
              onToggle={grupAcKapa}
              varsayilanAcik={false}
              onKaldir={masrafKaldir}
            />
          )}

          {hareketSayisi === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Açık hareket yok.</p>
          )}
        </CardContent>
      </Card>

      <YeniOdemeModal open={yeniOdeme} onClose={() => setYeniOdeme(false)} />

      <Dialog open={kapatDialog} onOpenChange={setKapatDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Günü Kapat</DialogTitle></DialogHeader>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Gelen avans:</span><span className="tabular-nums text-emerald-600">+{formatPara(acikAvansToplam, "₺")}</span></div>
            <div className="flex justify-between"><span>Güncel masraf:</span><span className="tabular-nums text-rose-600">−{formatPara(acikMasrafToplam, "₺")}</span></div>
            <div className="flex justify-between border-t pt-1 font-semibold"><span>Kapanış bakiyesi:</span><span className="tabular-nums">{formatPara(ozet?.bakiye ?? 0, "₺")}</span></div>
            <p className="pt-2 text-xs text-muted-foreground">Kapatınca bu hareketler kilitlenir ve rapor muhasebeye iletilir. Bakiye ertesi güne devreder.</p>
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
