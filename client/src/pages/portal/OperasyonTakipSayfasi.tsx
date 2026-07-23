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
import { formatTarih, formatTarihKisa, formatPara } from "./portalUtils";
import { masraflariGrupla } from "./masrafGruplama";
import { ChevronRight, ChevronDown } from "lucide-react";

type Satir = { id: string; adSoyad: string; kullaniciAdi: string; sube: string | null; bakiye: number; bugunHarcanan: number };
type Kapanis = OperasyonGunKapanis & { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] };
type Detay = { bakiye: number; acik: { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] }; kapanislar: Kapanis[] };

// Kasam/Kapanışlarım tablolarıyla BİREBİR aynı grid şablonu (hizalama şartı).
// SABİT sütun genişlikleri — her satır ayrı grid; "auto" olsaydı içerik uzunluğu
// satırdan satıra değişip sütunları kaydırırdı (Meksika dalgası). Sabit → hizalı.
const GRID = "grid-cols-[140px_minmax(0,1fr)_minmax(0,1.4fr)_130px_20px]";

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

  const geriAc = async (kapanisId: string) => {
    try {
      const res = await fetch(`/api/portal/operasyon-takip/kapanis/${kapanisId}/geri-ac`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Geri açılamadı");
      toast({ title: "Gün geri açıldı", description: "Operasyon düzeltebilir." });
      tazele();
    } catch (err: any) { toast({ title: "Hata", description: err.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Şube Bakiyeleri</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {gruplar.length === 0 && <p className="text-sm text-muted-foreground">Operasyon kullanıcısı yok.</p>}
          {gruplar.map((g) => (
            <div key={g.sube} className="space-y-2" data-testid={`grup-sube-${g.sube}`}>
              <div className="flex items-center justify-between border-b pb-1">
                <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g.sube}</span>
                <span className="text-sm font-bold" data-testid={`grup-sube-toplam-${g.sube}`}>{formatPara(g.toplam, "TL")}</span>
              </div>
              {g.satirlar.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3" data-testid={`sube-${s.id}`}>
                  <div>
                    <div className="font-medium">{s.adSoyad}</div>
                    <div className="text-xs text-muted-foreground">Bugün harcanan: {formatPara(s.bugunHarcanan, "TL")}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`text-lg font-bold ${s.bakiye < 0 ? "text-destructive" : ""}`} data-testid={`sube-bakiye-${s.id}`}>{formatPara(s.bakiye, "TL")}</div>
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
          <CardHeader><CardTitle>{secili.adSoyad} — Detay (Bakiye {formatPara(detay.bakiye, "TL")})</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {/* ---- AÇIK HAREKETLER ---- */}
            {(() => {
              const { gruplar: aGruplar, ofisMasraflar: aOfis, ofisToplam: aOfisToplam } =
                masraflariGrupla(detay.acik.masraflar, beyannameMap);
              const hicYok = detay.acik.avanslar.length === 0 && detay.acik.masraflar.length === 0;
              return (
                <div className="space-y-3">
                  <div className="text-sm font-medium">Açık Hareketler</div>
                  {hicYok && <p className="text-xs text-muted-foreground">Açık hareket yok.</p>}

                  {detay.acik.avanslar.length > 0 && (
                    <div className="space-y-1">
                      {detay.acik.avanslar.map((a) => (
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

                  {(aGruplar.length > 0 || aOfis.length > 0) && (
                    <div className="rounded-md border">
                      <div className={`grid ${GRID} gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground`}>
                        <span>Tarih · Dosya No</span><span>Beyanname No</span><span>Firma</span><span className="text-right">Tutar</span><span />
                      </div>
                      {aGruplar.map((g) => {
                        const acik = acikAcikGruplar.has(g.beyannameId); // VARSAYILAN KAPALI
                        const b = g.beyanname;
                        return (
                          <div key={g.beyannameId} className="border-b last:border-b-0" data-testid={`group-acik-${g.beyannameId}`}>
                            <button type="button" onClick={() => acikGrupAcKapa(g.beyannameId)} className={`grid w-full ${GRID} items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50`} data-testid={`button-group-toggle-acik-${g.beyannameId}`}>
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
                                    <span className="shrink-0 font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {aOfis.length > 0 && (
                        <div data-testid="group-acik-ofis">
                          <button type="button" onClick={() => acikGrupAcKapa("__ofis__")} className={`grid w-full ${GRID} items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50`} data-testid="button-group-toggle-acik-ofis">
                            <span className="col-span-3 font-semibold">Ofis Masrafları</span>
                            <span className="text-right font-semibold text-destructive">−{formatPara(aOfisToplam, "TL")}</span>
                            {acikAcikGruplar.has("__ofis__") ? <ChevronDown className="h-4 w-4 justify-self-end" /> : <ChevronRight className="h-4 w-4 justify-self-end" />}
                          </button>
                          {acikAcikGruplar.has("__ofis__") && (
                            <div className="space-y-1 border-t bg-muted/20 px-3 py-1.5">
                              {aOfis.map((m) => (
                                <div key={m.id} className="flex items-center justify-between text-sm py-0.5" data-testid={`row-masraf-${m.id}`}>
                                  <span className="min-w-0 truncate"><Badge variant="outline" className="mr-1">Ofis</Badge>{m.masrafTuru ?? "Masraf"} · {m.alacakli}{m.aciklama ? ` · ${m.aciklama}` : ""}{m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}</span>
                                  <span className="shrink-0 font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ---- KAPANMIŞ GÜNLER ---- */}
            <div className="border-t pt-4 space-y-3">
              <div className="text-sm font-medium">Kapanmış Günler</div>
              {detay.kapanislar.length === 0 && <p className="text-xs text-muted-foreground">Kapanış yok.</p>}
              {detay.kapanislar.map((k) => {
                const gunAcik = acikGunler.has(k.id);
                const { gruplar, ofisMasraflar, ofisToplam } = masraflariGrupla(k.masraflar, beyannameMap);
                return (
                  <div key={k.id} className="rounded-md border" data-testid={`takip-kapanis-${k.id}`}>
                    {/* Başlık: KATLAMA BUTONU + GERİ AÇ KARDEŞ (iç içe button YOK) */}
                    <div className="flex items-start justify-between gap-2 p-3">
                      <button type="button" onClick={() => gunAcKapa(k.id)} className="min-w-0 flex-1 text-left hover:bg-muted/50 rounded" data-testid={`button-kapanis-toggle-${k.id}`}>
                        <div className="flex items-center gap-2">
                          {gunAcik ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                          <span className="text-sm font-semibold">{formatTarih(k.gunTarihi)} Kapanışı</span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div><div className="text-muted-foreground text-xs">Açılış</div><div className="font-semibold">{formatPara(k.acilisBakiye, "TL")}</div></div>
                          <div><div className="text-muted-foreground text-xs">Avans</div><div className="font-semibold text-green-600">+{formatPara(k.avansToplam, "TL")}</div></div>
                          <div><div className="text-muted-foreground text-xs">Masraf</div><div className="font-semibold text-destructive">−{formatPara(k.masrafToplam, "TL")}</div></div>
                          <div><div className="text-muted-foreground text-xs">Kapanış</div><div className="font-semibold">{formatPara(k.kapanisBakiye, "TL")}</div></div>
                        </div>
                      </button>
                      <div className="shrink-0">
                        {k.durum === "geri_acildi" && <Badge variant="destructive">Geri Açıldı</Badge>}
                        {k.durum === "kapali" && <Button size="sm" variant="outline" onClick={() => geriAc(k.id)} data-testid={`button-geri-ac-${k.id}`}>Geri Aç</Button>}
                      </div>
                    </div>

                    {gunAcik && (
                      <div className="space-y-3 border-t p-3">
                        {k.avanslar.length > 0 && (
                          <div className="space-y-1">
                            {k.avanslar.map((a) => (
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

                        {(gruplar.length > 0 || ofisMasraflar.length > 0) ? (
                          <div className="rounded-md border">
                            <div className={`grid ${GRID} gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground`}>
                              <span>Tarih · Dosya No</span><span>Beyanname No</span><span>Firma</span><span className="text-right">Tutar</span><span />
                            </div>
                            {gruplar.map((g) => {
                              const anahtar = `${k.id}-${g.beyannameId}`;
                              const acik = !kapaliKapanisGruplar.has(anahtar); // VARSAYILAN AÇIK
                              const b = g.beyanname;
                              return (
                                <div key={g.beyannameId} className="border-b last:border-b-0" data-testid={`group-kapanis-${k.id}-${g.beyannameId}`}>
                                  <button type="button" onClick={() => kapanisGrupAcKapa(anahtar)} className={`grid w-full ${GRID} items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50`} data-testid={`button-group-toggle-${k.id}-${g.beyannameId}`}>
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
                                          <span className="shrink-0 font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {ofisMasraflar.length > 0 && (() => {
                              const anahtar = `${k.id}-__ofis__`;
                              const acik = !kapaliKapanisGruplar.has(anahtar); // VARSAYILAN AÇIK
                              return (
                                <div data-testid={`group-kapanis-ofis-${k.id}`}>
                                  <button type="button" onClick={() => kapanisGrupAcKapa(anahtar)} className={`grid w-full ${GRID} items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50`} data-testid={`button-group-toggle-ofis-${k.id}`}>
                                    <span className="col-span-3 font-semibold">Ofis Masrafları</span>
                                    <span className="text-right font-semibold text-destructive">−{formatPara(ofisToplam, "TL")}</span>
                                    {acik ? <ChevronDown className="h-4 w-4 justify-self-end" /> : <ChevronRight className="h-4 w-4 justify-self-end" />}
                                  </button>
                                  {acik && (
                                    <div className="space-y-1 border-t bg-muted/20 px-3 py-1.5">
                                      {ofisMasraflar.map((m) => (
                                        <div key={m.id} className="flex items-center justify-between text-sm py-0.5" data-testid={`row-masraf-${m.id}`}>
                                          <span className="min-w-0 truncate"><Badge variant="outline" className="mr-1">Ofis</Badge>{m.masrafTuru ?? "Masraf"} · {m.alacakli}{m.aciklama ? ` · ${m.aciklama}` : ""}{m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}</span>
                                          <span className="shrink-0 font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className="text-muted-foreground text-xs">Masraf yok.</div>
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
            <div className="space-y-1"><Label>Tutar (TL)</Label><Input placeholder="0,00" value={avansTutar} onChange={(e) => setAvansTutar(e.target.value)} data-testid="input-avans-tutar" /></div>
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
