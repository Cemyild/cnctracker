import { useQuery } from "@tanstack/react-query";
import type { OperasyonAvans, OperasyonGunKapanis, OperasyonMasraf } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTarih, formatPara } from "./portalUtils";

type Kapanis = OperasyonGunKapanis & { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] };

export default function OperasyonKapanislarSayfasi() {
  const { data: kapanislar = [] } = useQuery<Kapanis[]>({ queryKey: ["/api/portal/operasyon/kapanislar"] });
  return (
    <div className="space-y-4">
      {kapanislar.length === 0 && <p className="text-sm text-muted-foreground">Henüz kapanış yok.</p>}
      {kapanislar.map((k) => (
        <Card key={k.id} data-testid={`kapanis-${k.id}`}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{formatTarih(k.gunTarihi)} Kapanışı</CardTitle>
            {k.durum === "geri_acildi" && <Badge variant="destructive">Geri Açıldı</Badge>}
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div><div className="text-muted-foreground text-xs">Açılış</div><div className="font-semibold">{formatPara(k.acilisBakiye, "TL")}</div></div>
              <div><div className="text-muted-foreground text-xs">Avans</div><div className="font-semibold text-green-600">+{formatPara(k.avansToplam, "TL")}</div></div>
              <div><div className="text-muted-foreground text-xs">Masraf</div><div className="font-semibold text-destructive">−{formatPara(k.masrafToplam, "TL")}</div></div>
              <div><div className="text-muted-foreground text-xs">Kapanış</div><div className="font-semibold">{formatPara(k.kapanisBakiye, "TL")}</div></div>
            </div>
            <div className="border-t pt-2 space-y-1">
              {k.masraflar.map((m) => (
                <div key={m.id} className="flex justify-between">
                  <span>{m.dosyaYok && <Badge variant="outline" className="mr-1">Ofis</Badge>}{m.masrafTuru ?? "Masraf"} · {m.alacakli}{m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}</span>
                  <span className="text-destructive">−{formatPara(m.tutar, "TL")}</span>
                </div>
              ))}
              {k.masraflar.length === 0 && <div className="text-muted-foreground text-xs">Masraf yok.</div>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
