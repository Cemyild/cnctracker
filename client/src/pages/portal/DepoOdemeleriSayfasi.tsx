import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
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
  type TalepDetay, formatTarih, formatPara, gunFarki, gunAciliyetSinifi,
  IADE_ETIKET, devamEdenTeminatlar, iadeEdilebilirTeminatlar,
} from "./portalUtils";
import { SayfaBasligi } from "./kasaUI";
import BelgeLinkleri from "./BelgeLinkleri";
import { IadeEdilebilirKarti } from "./depoIslemTakibi";

const TH = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

function bas2(s: string | null | undefined) {
  return (s ?? "?").trim().slice(0, 2).toUpperCase();
}

function IadeRozeti({ talep }: { talep: TalepDetay }) {
  if (talep.durum !== "odendi") {
    return <Badge variant="secondary">Ödeme Bekliyor</Badge>;
  }
  if (!talep.iadeDurumu) {
    return <Badge variant="outline">—</Badge>;
  }
  // islem_tamam = muhasebenin AKSİYON alması gereken durum → en dikkat çeken renk (emerald).
  const STIL: Record<string, string> = {
    beklemede: "border-transparent bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    islem_tamam: "border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    iade_edildi: "border-transparent bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  };
  return (
    <div className="flex flex-col gap-0.5">
      <Badge className={STIL[talep.iadeDurumu] ?? STIL.beklemede}>
        {IADE_ETIKET[talep.iadeDurumu] ?? talep.iadeDurumu}
      </Badge>
      {talep.iadeDurumu === "islem_tamam" && talep.islemBitisTarihi && (
        <span className="text-[11px] text-muted-foreground">
          {formatTarih(talep.islemBitisTarihi)} bitti
        </span>
      )}
    </div>
  );
}

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
              {talep.beyanname?.dosyaNo ?? "—"} — <span className="font-semibold tabular-nums text-rose-600">{formatPara(talep.tutar, talep.paraBirimi)}</span> — {talep.alacakli}
            </div>
            <div className="space-y-2">
              <Label>İade Durumu</Label>
              <Select value={iadeDurumu} onValueChange={setIadeDurumu}>
                <SelectTrigger data-testid="select-iade-durumu">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beklemede">İşlem Devam Ediyor</SelectItem>
                  <SelectItem value="islem_tamam">İade Talep Edilebilir</SelectItem>
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
  const islemSuren = devamEdenTeminatlar(depoTalepleri).length;
  const iadeEdilebilir = iadeEdilebilirTeminatlar(depoTalepleri).length;
  const altBaslik = [
    iadeEdilebilir > 0 ? `${iadeEdilebilir} iade talep edilebilir` : null,
    islemSuren > 0 ? `${islemSuren} işlem devam ediyor` : null,
  ].filter(Boolean).join(" · ") || "İade takibi";

  return (
    <div className="space-y-6">
      <SayfaBasligi baslik="Depo Teminatları" alt={altBaslik} />

      <IadeEdilebilirKarti talepler={depoTalepleri} iadeAc={setIadeTalebi} />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className={TH}>Dosya No</TableHead>
              <TableHead className={TH}>Konşimento No</TableHead>
              <TableHead className={TH}>Müşteri</TableHead>
              <TableHead className={TH}>Temsilci</TableHead>
              <TableHead className={`text-right ${TH}`}>Tutar</TableHead>
              <TableHead className={TH}>Ödeme Tarihi</TableHead>
              <TableHead className={TH}>Kaç Gündür Açık</TableHead>
              <TableHead className={TH}>İade Durumu</TableHead>
              <TableHead className={TH}>İade Tutarı</TableHead>
              <TableHead className={TH}>Belgeler</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {depoTalepleri.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={11} className="text-center text-muted-foreground">
                  Depo teminatı kaydı yok
                </TableCell>
              </TableRow>
            )}
            {depoTalepleri.map((t) => {
              // İade alınana kadar para dışarıdadır — islem_tamam aşamasında da sayaç işler.
              const acikGun =
                t.durum === "odendi" && t.iadeDurumu !== "iade_edildi"
                  ? gunFarki(t.odemeTarihi)
                  : null;
              return (
                <TableRow key={t.id} className="hover:bg-muted/30" data-testid={`row-depo-${t.id}`}>
                  <TableCell className="font-medium tabular-nums">
                    {t.beyanname?.dosyaNo ?? <Badge variant="outline">Dosyasız</Badge>}
                  </TableCell>
                  <TableCell>
                    {t.konsimentoNo ? (
                      <div>
                        <div className="text-sm tabular-nums">{t.konsimentoNo}</div>
                        {t.tasiyici && (
                          <div className="text-xs text-muted-foreground">{t.tasiyici}</div>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-[11px] font-bold text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                        {bas2(t.beyanname?.alici)}
                      </span>
                      <span className="max-w-36 truncate font-medium" title={t.beyanname?.alici ?? ""}>{t.beyanname?.alici ?? "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell>{t.talepEdenAd}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-rose-600">
                    {formatPara(t.tutar, t.paraBirimi)}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatTarih(t.odemeTarihi)}</TableCell>
                  <TableCell className="tabular-nums">
                    {acikGun == null ? "—" : (
                      <span className={gunAciliyetSinifi(acikGun)}>{acikGun} gün</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <IadeRozeti talep={t} />
                  </TableCell>
                  <TableCell className="tabular-nums">
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
      </div>

      <IadeDialog
        key={iadeTalebi?.id ?? "iade-kapali"}
        talep={iadeTalebi}
        kapat={() => setIadeTalebi(null)}
      />
    </div>
  );
}
