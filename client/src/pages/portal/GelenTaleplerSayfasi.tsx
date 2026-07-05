import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  type TalepDetay, formatTarih, formatPara,
  TIP_ETIKET, DURUM_ETIKET,
} from "./portalUtils";
import BelgeLinkleri from "./BelgeLinkleri";

function OdemeDialog({
  talep, kapat,
}: { talep: TalepDetay | null; kapat: () => void }) {
  const { toast } = useToast();
  const [dekont, setDekont] = useState<File | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const odemeYap = async () => {
    if (!talep) return;
    if (!dekont) {
      toast({ title: "Dekont dosyası zorunlu", variant: "destructive" });
      return;
    }
    setGonderiliyor(true);
    try {
      const fd = new FormData();
      fd.set("dekont", dekont);
      const res = await fetch(`/api/portal/talepler/${talep.id}/odeme`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ödeme kaydedilemedi");
      toast({ title: "Ödendi olarak işaretlendi" });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/talepler"] });
      kapat();
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <Dialog open={!!talep} onOpenChange={(a) => !a && kapat()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ödemeyi Kaydet</DialogTitle>
        </DialogHeader>
        {talep && (
          <div className="space-y-4">
            <div className="text-sm rounded-md border p-3 space-y-1">
              <div><span className="font-medium">Dosya:</span> {talep.beyanname?.dosyaNo ?? "—"} — {talep.beyanname?.alici ?? "—"}</div>
              <div><span className="font-medium">Talep Eden:</span> {talep.talepEdenAd}</div>
              <div><span className="font-medium">Tür:</span> {TIP_ETIKET[talep.odemeTipi] ?? talep.odemeTipi} / {talep.masrafTuru}</div>
              <div><span className="font-medium">Tutar:</span> {formatPara(talep.tutar, talep.paraBirimi)}</div>
              {talep.konsimentoNo && (
                <div>
                  <span className="font-medium">Konşimento:</span> {talep.konsimentoNo}
                  {talep.tasiyici ? ` — ${talep.tasiyici}` : ""}
                </div>
              )}
              <div><span className="font-medium">Alacaklı:</span> {talep.alacakli}{talep.iban ? ` — ${talep.iban}` : ""}</div>
              {talep.aciklama && <div><span className="font-medium">Açıklama:</span> {talep.aciklama}</div>}
              <div className="pt-1"><BelgeLinkleri talep={talep} /></div>
            </div>
            <div className="space-y-2">
              <Label>Dekont (zorunlu)</Label>
              <Input
                type="file"
                onChange={(e) => setDekont(e.target.files?.[0] ?? null)}
                data-testid="input-dekont"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={kapat}>Vazgeç</Button>
          <Button onClick={odemeYap} disabled={gonderiliyor} data-testid="button-odeme-kaydet">
            {gonderiliyor ? "Kaydediliyor…" : "Ödendi Olarak Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GelenTaleplerSayfasi() {
  const { data: talepler = [] } = useQuery<TalepDetay[]>({
    queryKey: ["/api/portal/talepler"],
  });
  const [odemeTalebi, setOdemeTalebi] = useState<TalepDetay | null>(null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tüm Temsilcilerin Talepleri</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarih</TableHead>
                <TableHead>Temsilci</TableHead>
                <TableHead>Dosya No</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>Konşimento No</TableHead>
                <TableHead>Tutar</TableHead>
                <TableHead>Alacaklı</TableHead>
                <TableHead>Belgeler</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {talepler.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground">
                    Talep yok
                  </TableCell>
                </TableRow>
              )}
              {talepler.map((t) => (
                <TableRow key={t.id} data-testid={`row-muhasebe-talep-${t.id}`}>
                  <TableCell>{formatTarih(t.talepTarihi)}</TableCell>
                  <TableCell>{t.talepEdenAd}</TableCell>
                  <TableCell>
                    {t.beyanname?.dosyaNo ?? <Badge variant="outline">Dosyasız</Badge>}
                  </TableCell>
                  <TableCell className="max-w-44 truncate">{t.beyanname?.alici ?? "—"}</TableCell>
                  <TableCell>
                    {TIP_ETIKET[t.odemeTipi] ?? t.odemeTipi}
                    {t.odemeTipi === "masraf" ? ` / ${t.masrafTuru}` : ""}
                  </TableCell>
                  <TableCell>
                    {t.konsimentoNo ? (
                      <div>
                        <div className="text-sm">{t.konsimentoNo}</div>
                        {t.tasiyici && (
                          <div className="text-xs text-muted-foreground">{t.tasiyici}</div>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{formatPara(t.tutar, t.paraBirimi)}</TableCell>
                  <TableCell className="max-w-36 truncate">
                    {t.alacakli}
                    {t.iban && <div className="text-xs text-muted-foreground">{t.iban}</div>}
                  </TableCell>
                  <TableCell><BelgeLinkleri talep={t} /></TableCell>
                  <TableCell>
                    <Badge variant={t.durum === "odendi" ? "default" : "secondary"}>
                      {DURUM_ETIKET[t.durum] ?? t.durum}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {t.durum === "bekliyor" && (
                      <Button
                        size="sm"
                        onClick={() => setOdemeTalebi(t)}
                        data-testid={`button-ode-${t.id}`}
                      >
                        Öde
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <OdemeDialog
        key={odemeTalebi?.id ?? "odeme-kapali"}
        talep={odemeTalebi}
        kapat={() => setOdemeTalebi(null)}
      />
    </div>
  );
}
