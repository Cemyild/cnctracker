import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Beyanname, OperasyonAvans, OperasyonGunKapanis, OperasyonMasraf } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown } from "lucide-react";
import { formatTarih, formatPara } from "./portalUtils";
import { masraflariGrupla } from "./masrafGruplama";
import { GunKutusu } from "./kasaUI";
import { MasrafTablosu } from "./MasrafTablosu";

type Kapanis = OperasyonGunKapanis & { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] };

export default function OperasyonKapanislarSayfasi() {
  const { data: kapanislar = [] } = useQuery<Kapanis[]>({ queryKey: ["/api/portal/operasyon/kapanislar"] });
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({ queryKey: ["/api/portal/beyannameler"] });

  // Gün: sette OLAN açık (varsayılan KAPALI).
  const [acikGunler, setAcikGunler] = useState<Set<string>>(new Set());
  const gunAcKapa = (id: string) => setAcikGunler((p) => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // Beyanname grubu: sette OLAN KAPALI (varsayılan AÇIK) — MasrafTablosu varsayilanAcik={true} ile eşleşir.
  const [kapaliGruplar, setKapaliGruplar] = useState<Set<string>>(new Set());
  const grupAcKapa = (anahtar: string) => setKapaliGruplar((p) => {
    const n = new Set(p); n.has(anahtar) ? n.delete(anahtar) : n.add(anahtar); return n;
  });

  const beyannameMap = useMemo(() => new Map(beyannameler.map((b) => [b.id, b])), [beyannameler]);

  return (
    <div className="space-y-6">
      {/* Başlık şeridi + sabit gün kutusu (KPI/aksiyon yok — salt kapanış geçmişi) */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Kapanışlarım</h1>
          <p className="text-sm text-muted-foreground">Kapanmış günlerin geçmişi</p>
        </div>
        <GunKutusu />
      </div>

      {kapanislar.length === 0 && <p className="text-sm text-muted-foreground">Henüz kapanış yok.</p>}
      {kapanislar.map((k) => {
        const gunAcik = acikGunler.has(k.id);
        const gunGruplama = masraflariGrupla(k.masraflar, beyannameMap);
        return (
          <Card key={k.id} data-testid={`kapanis-${k.id}`}>
            <button type="button" onClick={() => gunAcKapa(k.id)} className="w-full p-4 text-left hover:bg-muted/40" data-testid={`button-kapanis-toggle-${k.id}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {gunAcik ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="text-base font-semibold">{formatTarih(k.gunTarihi)} Kapanışı</span>
                </span>
                {k.durum === "geri_acildi" && <Badge variant="destructive">Geri Açıldı</Badge>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                <div><div className="text-xs text-muted-foreground">Açılış</div><div className="font-semibold tabular-nums">{formatPara(k.acilisBakiye, "₺")}</div></div>
                <div><div className="text-xs text-muted-foreground">Avans</div><div className="font-semibold tabular-nums text-emerald-600">+{formatPara(k.avansToplam, "₺")}</div></div>
                <div><div className="text-xs text-muted-foreground">Masraf</div><div className="font-semibold tabular-nums text-rose-600">−{formatPara(k.masrafToplam, "₺")}</div></div>
                <div><div className="text-xs text-muted-foreground">Kapanış</div><div className="font-semibold tabular-nums">{formatPara(k.kapanisBakiye, "₺")}</div></div>
              </div>
            </button>

            {gunAcik && (
              <CardContent className="space-y-4 border-t pt-4">
                {(k.avanslar.length > 0 || gunGruplama.gruplar.length > 0 || gunGruplama.ofisMasraflar.length > 0) ? (
                  <MasrafTablosu gruplarSonucu={gunGruplama} avanslar={k.avanslar} acikSet={kapaliGruplar} onToggle={grupAcKapa} varsayilanAcik={true} anahtarOnEk={k.id} />
                ) : (
                  <div className="text-xs text-muted-foreground">Hareket yok.</div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
