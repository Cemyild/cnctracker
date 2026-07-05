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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  type TalepDetay, formatTarih, formatPara, gunFarki,
  IADE_ETIKET,
} from "./portalUtils";
import BelgeLinkleri from "./BelgeLinkleri";

function IadeDialog({
  talep, kapat,
}: { talep: TalepDetay | null; kapat: () => void }) {
  const { toast } = useToast();
  const [iadeDurumu, setIadeDurumu] = useState("iade_edildi");
  const [iadeTutari, setIadeTutari] = useState(talep?.iadeTutari ?? "");
  const [iadeTarihi, setIadeTarihi] = useState(talep?.iadeTarihi ?? "");
  const [iadeNotu, setIadeNotu] = useState(talep?.iadeNotu ?? "");
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const kaydet = async () => {
    if (!talep) return;
    setGonderiliyor(true);
    try {
      const res = await fetch(`/api/portal/talepler/${talep.id}/iade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iadeDurumu,
          iadeTutari: iadeTutari.trim() ? iadeTutari.replace(",", ".") : null,
          iadeTarihi: iadeTarihi || null,
          iadeNotu: iadeNotu.trim() || null,
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "İade kaydedilemedi");
      toast({ title: "İade kaydı güncellendi" });
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
          <DialogTitle>İade Kaydı</DialogTitle>
        </DialogHeader>
        {talep && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {talep.beyanname?.dosyaNo ?? "—"} — {formatPara(talep.tutar, talep.paraBirimi)} — {talep.alacakli}
            </div>
            <div className="space-y-2">
              <Label>İade Durumu</Label>
              <Select value={iadeDurumu} onValueChange={setIadeDurumu}>
                <SelectTrigger data-testid="select-iade-durumu">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beklemede">İade Bekleniyor</SelectItem>
                  <SelectItem value="iade_edildi">İade Alındı</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>İade Tutarı (kesinti varsa farklı olabilir)</Label>
                <Input
                  placeholder="0,00"
                  value={iadeTutari}
                  onChange={(e) => setIadeTutari(e.target.value)}
                  data-testid="input-iade-tutari"
                />
              </div>
              <div className="space-y-2">
                <Label>İade Tarihi</Label>
                <Input
                  type="date"
                  value={iadeTarihi}
                  onChange={(e) => setIadeTarihi(e.target.value)}
                  data-testid="input-iade-tarihi"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Not (örn. demuraj kesintisi)</Label>
              <Textarea
                value={iadeNotu}
                onChange={(e) => setIadeNotu(e.target.value)}
                data-testid="input-iade-notu"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={kapat}>Vazgeç</Button>
          <Button onClick={kaydet} disabled={gonderiliyor} data-testid="button-iade-kaydet">
            {gonderiliyor ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DepoOdemeleriSayfasi() {
  const { data: talepler = [] } = useQuery<TalepDetay[]>({
    queryKey: ["/api/portal/talepler"],
  });
  const [iadeTalebi, setIadeTalebi] = useState<TalepDetay | null>(null);
  const depoTalepleri = talepler.filter((t) => t.odemeTipi === "depo_teminat");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Depo Teminatları — İade Takibi</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dosya No</TableHead>
                <TableHead>Konşimento No</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>Temsilci</TableHead>
                <TableHead>Tutar</TableHead>
                <TableHead>Ödeme Tarihi</TableHead>
                <TableHead>Kaç Gündür Açık</TableHead>
                <TableHead>İade Durumu</TableHead>
                <TableHead>İade Tutarı</TableHead>
                <TableHead>Belgeler</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {depoTalepleri.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground">
                    Depo teminatı kaydı yok
                  </TableCell>
                </TableRow>
              )}
              {depoTalepleri.map((t) => {
                const acikGun =
                  t.durum === "odendi" && t.iadeDurumu === "beklemede"
                    ? gunFarki(t.odemeTarihi)
                    : null;
                return (
                  <TableRow key={t.id} data-testid={`row-depo-${t.id}`}>
                    <TableCell>
                      {t.beyanname?.dosyaNo ?? <Badge variant="outline">Dosyasız</Badge>}
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
                    <TableCell className="max-w-44 truncate">{t.beyanname?.alici ?? "—"}</TableCell>
                    <TableCell>{t.talepEdenAd}</TableCell>
                    <TableCell>{formatPara(t.tutar, t.paraBirimi)}</TableCell>
                    <TableCell>{formatTarih(t.odemeTarihi)}</TableCell>
                    <TableCell>
                      {acikGun == null ? "—" : (
                        <span className={acikGun > 30 ? "text-red-600 font-medium" : ""}>
                          {acikGun} gün
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.durum !== "odendi" ? (
                        <Badge variant="secondary">Ödeme Bekliyor</Badge>
                      ) : (
                        <Badge variant={t.iadeDurumu === "iade_edildi" ? "default" : "outline"}>
                          {IADE_ETIKET[t.iadeDurumu ?? ""] ?? "—"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.iadeTutari ? formatPara(t.iadeTutari, t.paraBirimi) : "—"}
                      {t.iadeNotu && (
                        <div className="text-xs text-muted-foreground max-w-36 truncate">
                          {t.iadeNotu}
                        </div>
                      )}
                    </TableCell>
                    <TableCell><BelgeLinkleri talep={t} /></TableCell>
                    <TableCell>
                      {t.durum === "odendi" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIadeTalebi(t)}
                          data-testid={`button-iade-${t.id}`}
                        >
                          İade Kaydı
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <IadeDialog
        key={iadeTalebi?.id ?? "iade-kapali"}
        talep={iadeTalebi}
        kapat={() => setIadeTalebi(null)}
      />
    </div>
  );
}
