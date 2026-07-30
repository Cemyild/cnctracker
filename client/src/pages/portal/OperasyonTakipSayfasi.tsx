import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Beyanname, OperasyonAvans, OperasyonGunKapanis, OperasyonMasraf } from "@shared/schema";
import { subeler } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatTarih, formatPara } from "./portalUtils";
import { masraflariGrupla } from "./masrafGruplama";
import { KpiKart, GunKutusu, SonDevirKart, IK } from "./kasaUI";
import { MasrafTablosu } from "./MasrafTablosu";
import { ChevronRight, ChevronDown } from "lucide-react";

type Satir = { id: string; adSoyad: string; kullaniciAdi: string; sube: string | null; bakiye: number; acikMasraf: number };
type Kapanis = OperasyonGunKapanis & { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] };
type Detay = { bakiye: number; acik: { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] }; kapanislar: Kapanis[] };

export default function OperasyonTakipSayfasi() {
  const { toast } = useToast();
  const { data: liste = [] } = useQuery<Satir[]>({
    queryKey: ["/api/portal/operasyon-takip"], refetchInterval: 10000, refetchIntervalInBackground: true,
  });
  // Şube başlıkları MEVCUT KULLANICILARDAN türetilir — sabit listeden değil (boş şube bloğu gösterilmez).
  const gruplar = useMemo(() => {
    const harita = new Map<string, Satir[]>();
    for (const s of liste) {
      const ad = s.sube ?? "Şube atanmamış";
      const g = harita.get(ad);
      if (g) g.push(s); else harita.set(ad, [s]);
    }
    const sira = (ad: string) => {
      const i = (subeler as readonly string[]).indexOf(ad);
      return i === -1 ? subeler.length : i;
    };
    return Array.from(harita.entries())
      .map(([sube, satirlar]) => ({
        sube,
        satirlar,
        toplam: Math.round(satirlar.reduce((t, s) => t + s.bakiye, 0) * 100) / 100,
      }))
      .sort((a, b) => sira(a.sube) - sira(b.sube) || a.sube.localeCompare(b.sube, "tr"));
  }, [liste]);
  const [secili, setSecili] = useState<Satir | null>(null);
  const [avansDialog, setAvansDialog] = useState(false);
  const [avansTutar, setAvansTutar] = useState("");
  const [avansAciklama, setAvansAciklama] = useState("");
  const [avansDekont, setAvansDekont] = useState<File | null>(null);
  const [avansTarih, setAvansTarih] = useState(""); // geriye dönük avans için (boş → bugün)
  const [dekontSayac, setDekontSayac] = useState(0); // file input'u sıfırlamak için key
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const { data: detay } = useQuery<Detay>({
    queryKey: [`/api/portal/operasyon-takip/${secili?.id}`],
    enabled: !!secili,
    refetchInterval: secili ? 10000 : false,
    refetchIntervalInBackground: true,
  });

  const { data: beyannameler = [] } = useQuery<Beyanname[]>({ queryKey: ["/api/portal/beyannameler"] });
  const beyannameMap = useMemo(() => new Map(beyannameler.map((b) => [b.id, b])), [beyannameler]);

  // Kapanış günü: sette OLAN açık (varsayılan KAPALI).
  const [acikGunler, setAcikGunler] = useState<Set<string>>(new Set());
  const gunAcKapa = (id: string) => setAcikGunler((p) => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // AÇIK HAREKETLER grupları: sette OLAN AÇIK (varsayılan KAPALI) — Kasam ile aynı.
  const [acikAcikGruplar, setAcikAcikGruplar] = useState<Set<string>>(new Set());
  const acikGrupAcKapa = (k: string) => setAcikAcikGruplar((p) => {
    const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  // KAPANIŞ İÇİ gruplar: sette OLAN KAPALI (varsayılan AÇIK) — Kapanışlarım ile aynı, yukarıdakinin TERSİ.
  const [kapaliKapanisGruplar, setKapaliKapanisGruplar] = useState<Set<string>>(new Set());
  const kapanisGrupAcKapa = (k: string) => setKapaliKapanisGruplar((p) => {
    const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  const tazele = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/portal/operasyon-takip"] });
    if (secili) queryClient.invalidateQueries({ queryKey: [`/api/portal/operasyon-takip/${secili.id}`] });
  };

  // Avans formu state'i dialog dışında yaşadığı için HER kapanış/açılışta sıfırlanmalı.
  // Aksi hâlde seçili dosya bir sonraki şubenin kaydına sessizce eklenir (Radix dialog
  // unmount olduğundan alan BOŞ görünür ama state doludur).
  const avansFormSifirla = () => {
    // Tarih varsayılanı BUGÜN (yerel gün — new Date() argümansız, parse yok). Kullanıcı
    // geriye dönük avans için değiştirebilir.
    const d = new Date();
    const bugun = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setAvansTutar(""); setAvansAciklama(""); setAvansTarih(bugun);
    setAvansDekont(null); setDekontSayac((s) => s + 1);
  };
  const avansDialogAc = (s: Satir) => { setSecili(s); avansFormSifirla(); setAvansDialog(true); };
  const avansDialogKapat = () => { setAvansDialog(false); avansFormSifirla(); };

  const avansGonder = async () => {
    if (!secili) return;
    if (!avansTutar.trim()) { toast({ title: "Tutar girin", variant: "destructive" }); return; }
    setGonderiliyor(true);
    try {
      const fd = new FormData();
      fd.set("tutar", avansTutar);
      fd.set("aciklama", avansAciklama);
      if (avansTarih) fd.set("tarih", avansTarih); // geriye dönük avans tarihi
      if (avansDekont) fd.set("dekont", avansDekont); // OPSİYONEL
      const res = await fetch(`/api/portal/operasyon-takip/${secili.id}/avans`, {
        method: "POST", body: fd, credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Gönderilemedi");
      toast({ title: "Avans yüklendi", description: `${secili.adSoyad} bakiyesine geçti.` });
      avansDialogKapat();
      tazele();
    } catch (err: any) { toast({ title: "Hata", description: err.message, variant: "destructive" }); }
    finally { setGonderiliyor(false); }
  };

  // Muhasebe yanlış girdiği (açık) avansı silebilir. Kapanmış gün avansı kilitli → buton görünmez.
  const avansKaldir = async (id: string) => {
    if (!confirm("Bu avansı silmek istediğinize emin misiniz?")) return;
    try {
      const res = await fetch(`/api/portal/operasyon-takip/avans/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Silinemedi");
      toast({ title: "Avans silindi" });
      tazele();
    } catch (err: any) { toast({ title: "Hata", description: err.message, variant: "destructive" }); }
  };

  const geriAc = async (kapanisId: string) => {
    try {
      const res = await fetch(`/api/portal/operasyon-takip/kapanis/${kapanisId}/geri-ac`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Geri açılamadı");
      toast({ title: "Gün geri açıldı", description: "Operasyon düzeltebilir." });
      tazele();
    } catch (err: any) { toast({ title: "Hata", description: err.message, variant: "destructive" }); }
  };

  const acikAvansT = (detay?.acik.avanslar ?? []).reduce((s, a) => s + parseFloat(a.tutar), 0);
  const acikMasrafT = (detay?.acik.masraflar ?? []).reduce((s, m) => s + parseFloat(m.tutar), 0);
  const sonDevir = detay?.kapanislar[0] ? { gunTarihi: detay.kapanislar[0].gunTarihi, kapanisBakiye: detay.kapanislar[0].kapanisBakiye } : null;

  return (
    <div className="space-y-6">
      {/* Başlık şeridi + sabit gün kutusu */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Şube Masraf</h1>
          <p className="text-sm text-muted-foreground">Şube kasaları · avans yükle, detay incele</p>
        </div>
        <GunKutusu />
      </div>

      <Card>
        <CardHeader><CardTitle>Şube Bakiyeleri</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {gruplar.length === 0 && <p className="text-sm text-muted-foreground">Operasyon kullanıcısı yok.</p>}
          {gruplar.map((g) => (
            <div key={g.sube} className="space-y-2" data-testid={`grup-sube-${g.sube}`}>
              <div className="flex items-center justify-between border-b pb-1">
                <Badge className="bg-indigo-100 text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300">{g.sube}</Badge>
                <span className="text-sm font-bold tabular-nums" data-testid={`grup-sube-toplam-${g.sube}`}>{formatPara(g.toplam, "₺")}</span>
              </div>
              {g.satirlar.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 shadow-sm" data-testid={`sube-${s.id}`}>
                  <div>
                    <div className="font-medium">{s.adSoyad}</div>
                    <div className="text-xs text-muted-foreground">Açık masraf: <span className="tabular-nums">{formatPara(s.acikMasraf, "₺")}</span></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`text-lg font-bold tabular-nums ${s.bakiye < 0 ? "text-rose-600" : ""}`} data-testid={`sube-bakiye-${s.id}`}>{formatPara(s.bakiye, "₺")}</div>
                    <Button size="sm" onClick={() => avansDialogAc(s)} data-testid={`button-avans-${s.id}`}>Avans Yükle</Button>
                    <Button size="sm" variant="outline" onClick={() => setSecili(s)} data-testid={`button-detay-${s.id}`}>Detay</Button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      {secili && detay && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle>{secili.adSoyad} — Detay</CardTitle>
              <GunKutusu />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* KPI kartları — seçili şube */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <KpiKart ikon={<IK.Wallet className="h-[19px] w-[19px]" />} label="Güncel Bakiye" deger={`${formatPara(detay.bakiye)} ₺`} alt={secili.sube ?? "şube kasası"} />
              <KpiKart ikon={<IK.ArrowDownToLine className="h-[19px] w-[19px]" />} label="Gelen Avans" deger={`${formatPara(acikAvansT)} ₺`} renk="text-emerald-600" alt="açık dönem" />
              <KpiKart ikon={<IK.ArrowUpFromLine className="h-[19px] w-[19px]" />} label="Güncel Masraflar" deger={`${formatPara(acikMasrafT)} ₺`} renk="text-rose-600" alt={`${detay.acik.masraflar.length} kalem · kapatılmamış`} />
              <SonDevirKart gunTarihi={sonDevir?.gunTarihi ?? null} kapanisBakiye={sonDevir?.kapanisBakiye ?? null} />
            </div>

            {/* ---- AÇIK HAREKETLER ---- */}
            {(() => {
              const acikGruplama = masraflariGrupla(detay.acik.masraflar, beyannameMap);
              const hicYok = detay.acik.avanslar.length === 0 && detay.acik.masraflar.length === 0;
              return (
                <div className="space-y-3">
                  <div className="text-sm font-medium">Açık Hareketler</div>
                  {hicYok && <p className="text-xs text-muted-foreground">Açık hareket yok.</p>}
                  {(detay.acik.avanslar.length > 0 || acikGruplama.gruplar.length > 0 || acikGruplama.ofisMasraflar.length > 0) && (
                    <MasrafTablosu gruplarSonucu={acikGruplama} avanslar={detay.acik.avanslar} onAvansKaldir={avansKaldir} acikSet={acikAcikGruplar} onToggle={acikGrupAcKapa} varsayilanAcik={false} />
                  )}
                </div>
              );
            })()}

            {/* ---- KAPANMIŞ GÜNLER ---- */}
            <div className="space-y-3 border-t pt-4">
              <div className="text-sm font-medium">Kapanmış Günler</div>
              {detay.kapanislar.length === 0 && <p className="text-xs text-muted-foreground">Kapanış yok.</p>}
              {detay.kapanislar.map((k) => {
                const gunAcik = acikGunler.has(k.id);
                const gunGruplama = masraflariGrupla(k.masraflar, beyannameMap);
                return (
                  <div key={k.id} className="rounded-xl border bg-card shadow-sm" data-testid={`takip-kapanis-${k.id}`}>
                    {/* Başlık: KATLAMA BUTONU + GERİ AÇ KARDEŞ (iç içe button YOK) */}
                    <div className="flex items-start justify-between gap-2 p-4">
                      <button type="button" onClick={() => gunAcKapa(k.id)} className="min-w-0 flex-1 rounded text-left hover:bg-muted/40" data-testid={`button-kapanis-toggle-${k.id}`}>
                        <div className="flex items-center gap-2">
                          {gunAcik ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                          <span className="text-sm font-semibold">{formatTarih(k.gunTarihi)} Kapanışı</span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                          <div><div className="text-xs text-muted-foreground">Açılış</div><div className="font-semibold tabular-nums">{formatPara(k.acilisBakiye, "₺")}</div></div>
                          <div><div className="text-xs text-muted-foreground">Avans</div><div className="font-semibold tabular-nums text-emerald-600">+{formatPara(k.avansToplam, "₺")}</div></div>
                          <div><div className="text-xs text-muted-foreground">Masraf</div><div className="font-semibold tabular-nums text-rose-600">−{formatPara(k.masrafToplam, "₺")}</div></div>
                          <div><div className="text-xs text-muted-foreground">Kapanış</div><div className="font-semibold tabular-nums">{formatPara(k.kapanisBakiye, "₺")}</div></div>
                        </div>
                      </button>
                      <div className="shrink-0">
                        {k.durum === "geri_acildi" && <Badge variant="destructive">Geri Açıldı</Badge>}
                        {k.durum === "kapali" && <Button size="sm" variant="outline" onClick={() => geriAc(k.id)} data-testid={`button-geri-ac-${k.id}`}>Geri Aç</Button>}
                      </div>
                    </div>

                    {gunAcik && (
                      <div className="space-y-3 border-t p-4">
                        {(k.avanslar.length > 0 || gunGruplama.gruplar.length > 0 || gunGruplama.ofisMasraflar.length > 0) ? (
                          <MasrafTablosu gruplarSonucu={gunGruplama} avanslar={k.avanslar} acikSet={kapaliKapanisGruplar} onToggle={kapanisGrupAcKapa} varsayilanAcik={true} anahtarOnEk={k.id} />
                        ) : (
                          <div className="text-xs text-muted-foreground">Hareket yok.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={avansDialog} onOpenChange={(a) => { if (!a) avansDialogKapat(); else setAvansDialog(true); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Avans Yükle — {secili?.adSoyad}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Tutar (₺)</Label><Input placeholder="0,00" value={avansTutar} onChange={(e) => setAvansTutar(e.target.value)} data-testid="input-avans-tutar" /></div>
            <div className="space-y-1"><Label>Açıklama</Label><Input value={avansAciklama} onChange={(e) => setAvansAciklama(e.target.value)} data-testid="input-avans-aciklama" /></div>
            <div className="space-y-1"><Label>Tarih</Label><Input type="date" value={avansTarih} onChange={(e) => setAvansTarih(e.target.value)} data-testid="input-avans-tarih" /><p className="text-xs text-muted-foreground">Geriye dönük avans için tarihi değiştirebilirsiniz.</p></div>
            <div className="space-y-1"><Label>Dekont (opsiyonel)</Label><Input key={dekontSayac} type="file" onChange={(e) => setAvansDekont(e.target.files?.[0] ?? null)} data-testid="input-avans-dekont" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={avansDialogKapat}>Vazgeç</Button>
            <Button onClick={avansGonder} disabled={gonderiliyor} data-testid="button-avans-gonder">{gonderiliyor ? "Gönderiliyor…" : "Yükle"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
