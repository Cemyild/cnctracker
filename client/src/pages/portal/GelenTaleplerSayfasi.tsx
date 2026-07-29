import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
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
import { SayfaBasligi } from "./kasaUI";
import BelgeLinkleri from "./BelgeLinkleri";

const TH = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

function bas2(s: string | null | undefined) {
  return (s ?? "?").trim().slice(0, 2).toUpperCase();
}

function DurumRozeti({ durum }: { durum: string }) {
  const stil = durum === "odendi"
    ? "border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
    : "border-transparent bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  return <Badge className={stil}>{DURUM_ETIKET[durum] ?? durum}</Badge>;
}

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
            <div className="space-y-1 rounded-lg border bg-muted/20 p-3 text-sm">
              <div><span className="font-medium">Dosya:</span> {talep.beyanname?.dosyaNo ?? "—"} — {talep.beyanname?.alici ?? "—"}</div>
              <div><span className="font-medium">Talep Eden:</span> {talep.talepEdenAd}</div>
              <div><span className="font-medium">Tür:</span> {TIP_ETIKET[talep.odemeTipi] ?? talep.odemeTipi} / {talep.masrafTuru}</div>
              <div><span className="font-medium">Tutar:</span> <span className="font-semibold tabular-nums text-rose-600">{formatPara(talep.tutar, talep.paraBirimi)}</span></div>
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

// Yerel gün YYYY-MM-DD (new Date() argümansız — parse yok, timezone güvenli).
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function GelenTaleplerSayfasi() {
  const { data: talepler = [] } = useQuery<TalepDetay[]>({
    queryKey: ["/api/portal/talepler"],
  });
  const [odemeTalebi, setOdemeTalebi] = useState<TalepDetay | null>(null);

  // Ödenen talepler tarih aralığı — varsayılan son 30 gün. Bekleyenlere UYGULANMAZ.
  const [baslangic, setBaslangic] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return ymd(d); });
  const [bitis, setBitis] = useState(() => ymd(new Date()));

  // Bekleyenler: TÜMÜ (aksiyon bekliyor, tarih filtresiyle gizlenmez). Ödenenler: tarih aralığında.
  const bekleyenler = talepler.filter((t) => t.durum === "bekliyor");
  const odenenler = talepler
    .filter((t) => t.durum === "odendi" && t.talepTarihi >= baslangic && t.talepTarihi <= bitis)
    .sort((a, b) => (a.talepTarihi < b.talepTarihi ? 1 : -1)); // en yeni ödenen üstte

  const talepTablosu = (list: TalepDetay[], bosMesaj: string) => (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className={TH}>Tarih</TableHead>
            <TableHead className={TH}>Temsilci</TableHead>
            <TableHead className={TH}>Dosya No</TableHead>
            <TableHead className={TH}>Müşteri</TableHead>
            <TableHead className={TH}>Tür</TableHead>
            <TableHead className={TH}>Konşimento No</TableHead>
            <TableHead className={`text-right ${TH}`}>Tutar</TableHead>
            <TableHead className={TH}>Alacaklı</TableHead>
            <TableHead className={TH}>Belgeler</TableHead>
            <TableHead className={TH}>Durum</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={11} className="text-center text-muted-foreground">
                {bosMesaj}
              </TableCell>
            </TableRow>
          )}
          {list.map((t) => (
            <TableRow key={t.id} className="hover:bg-muted/30" data-testid={`row-muhasebe-talep-${t.id}`}>
              <TableCell className="tabular-nums">{formatTarih(t.talepTarihi)}</TableCell>
              <TableCell>
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-[11px] font-bold text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                    {bas2(t.talepEdenAd)}
                  </span>
                  <span className="truncate font-medium">{t.talepEdenAd}</span>
                </div>
              </TableCell>
              <TableCell className="font-medium tabular-nums">
                {t.beyanname?.dosyaNo ?? <Badge variant="outline">Dosyasız</Badge>}
              </TableCell>
              <TableCell className="max-w-44 truncate" title={t.beyanname?.alici ?? ""}>{t.beyanname?.alici ?? "—"}</TableCell>
              <TableCell>
                {TIP_ETIKET[t.odemeTipi] ?? t.odemeTipi}
                {t.odemeTipi === "masraf" ? ` / ${t.masrafTuru}` : ""}
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
              <TableCell className="text-right font-semibold tabular-nums text-rose-600">
                {formatPara(t.tutar, t.paraBirimi)}
              </TableCell>
              <TableCell className="max-w-36 truncate">
                {t.alacakli}
                {t.iban && <div className="text-xs text-muted-foreground">{t.iban}</div>}
              </TableCell>
              <TableCell><BelgeLinkleri talep={t} /></TableCell>
              <TableCell>
                <DurumRozeti durum={t.durum} />
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
    </div>
  );

  return (
    <div className="space-y-6">
      <SayfaBasligi
        baslik="Gelen Talepler"
        alt={`Tüm temsilcilerin ödeme talepleri${bekleyenler.length > 0 ? ` · ${bekleyenler.length} bekliyor` : ""}`}
      />

      {/* Bekleyen Talepler — TÜMÜ (tarih filtresiz, aksiyon bekliyor) */}
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Bekleyen Talepler <span className="font-normal text-muted-foreground">({bekleyenler.length})</span>
        </h2>
        {talepTablosu(bekleyenler, "Bekleyen talep yok")}
      </div>

      {/* Ödenen Talepler — tarih aralığında */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Ödenen Talepler <span className="font-normal text-muted-foreground">({odenenler.length})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-muted-foreground">Tarih aralığı</Label>
            <Input type="date" value={baslangic} onChange={(e) => setBaslangic(e.target.value)} className="h-8 w-40" data-testid="input-gelen-baslangic" />
            <span className="text-muted-foreground">–</span>
            <Input type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} className="h-8 w-40" data-testid="input-gelen-bitis" />
          </div>
        </div>
        {talepTablosu(odenenler, "Bu tarih aralığında ödenen talep yok")}
      </div>

      <OdemeDialog
        key={odemeTalebi?.id ?? "odeme-kapali"}
        talep={odemeTalebi}
        kapat={() => setOdemeTalebi(null)}
      />
    </div>
  );
}
