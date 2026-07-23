import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Beyanname, OperasyonAvans, OperasyonGunKapanis, OperasyonMasraf } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown } from "lucide-react";
import { formatTarih, formatTarihKisa, formatPara } from "./portalUtils";
import { masraflariGrupla } from "./masrafGruplama";

type Kapanis = OperasyonGunKapanis & { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] };

// Kasam'daki tabloyla BİREBİR aynı grid şablonu (hizalama şartı).
// SABİT sütun genişlikleri — "auto" satırdan satıra kayardı (dalga); sabit → hizalı.
const GRID = "grid-cols-[140px_minmax(0,1fr)_minmax(0,1.4fr)_130px_20px]";

export default function OperasyonKapanislarSayfasi() {
  const { data: kapanislar = [] } = useQuery<Kapanis[]>({ queryKey: ["/api/portal/operasyon/kapanislar"] });
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({ queryKey: ["/api/portal/beyannameler"] });

  // Gün: sette OLAN açık (varsayılan KAPALI).
  const [acikGunler, setAcikGunler] = useState<Set<string>>(new Set());
  const gunAcKapa = (id: string) => setAcikGunler((p) => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // Beyanname grubu: sette OLAN KAPALI (varsayılan AÇIK) — Kasam'daki mantığın TERSİ.
  const [kapaliGruplar, setKapaliGruplar] = useState<Set<string>>(new Set());
  const grupAcKapa = (anahtar: string) => setKapaliGruplar((p) => {
    const n = new Set(p); n.has(anahtar) ? n.delete(anahtar) : n.add(anahtar); return n;
  });

  const beyannameMap = useMemo(() => new Map(beyannameler.map((b) => [b.id, b])), [beyannameler]);

  return (
    <div className="space-y-4">
      {kapanislar.length === 0 && <p className="text-sm text-muted-foreground">Henüz kapanış yok.</p>}
      {kapanislar.map((k) => {
        const gunAcik = acikGunler.has(k.id);
        const { gruplar, ofisMasraflar, ofisToplam } = masraflariGrupla(k.masraflar, beyannameMap);
        return (
          <Card key={k.id} data-testid={`kapanis-${k.id}`}>
            <button type="button" onClick={() => gunAcKapa(k.id)} className="w-full p-4 text-left hover:bg-muted/50" data-testid={`button-kapanis-toggle-${k.id}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {gunAcik ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="text-base font-semibold">{formatTarih(k.gunTarihi)} Kapanışı</span>
                </span>
                {k.durum === "geri_acildi" && <Badge variant="destructive">Geri Açıldı</Badge>}
              </div>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div><div className="text-muted-foreground text-xs">Açılış</div><div className="font-semibold">{formatPara(k.acilisBakiye, "TL")}</div></div>
                <div><div className="text-muted-foreground text-xs">Avans</div><div className="font-semibold text-green-600">+{formatPara(k.avansToplam, "TL")}</div></div>
                <div><div className="text-muted-foreground text-xs">Masraf</div><div className="font-semibold text-destructive">−{formatPara(k.masrafToplam, "TL")}</div></div>
                <div><div className="text-muted-foreground text-xs">Kapanış</div><div className="font-semibold">{formatPara(k.kapanisBakiye, "TL")}</div></div>
              </div>
            </button>

            {gunAcik && (
              <CardContent className="space-y-4 border-t pt-4">
                {k.avanslar.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Avanslar</div>
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
                      <span>Tarih · Dosya No</span>
                      <span>Beyanname No</span>
                      <span>Firma</span>
                      <span className="text-right">Tutar</span>
                      <span />
                    </div>

                    {gruplar.map((g) => {
                      const anahtar = `${k.id}-${g.beyannameId}`;
                      const acik = !kapaliGruplar.has(anahtar); // VARSAYILAN AÇIK
                      const b = g.beyanname;
                      return (
                        <div key={g.beyannameId} className="border-b last:border-b-0" data-testid={`group-kapanis-${k.id}-${g.beyannameId}`}>
                          <button type="button" onClick={() => grupAcKapa(anahtar)} className={`grid w-full ${GRID} items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50`} data-testid={`button-group-toggle-${k.id}-${g.beyannameId}`}>
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
                      const acik = !kapaliGruplar.has(anahtar); // VARSAYILAN AÇIK
                      return (
                        <div data-testid={`group-kapanis-ofis-${k.id}`}>
                          <button type="button" onClick={() => grupAcKapa(anahtar)} className={`grid w-full ${GRID} items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50`} data-testid={`button-group-toggle-ofis-${k.id}`}>
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
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
