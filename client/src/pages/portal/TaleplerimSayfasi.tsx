import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Beyanname } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  type TalepDetay, formatTarih, formatPara,
  TIP_ETIKET, DURUM_ETIKET, IADE_ETIKET, BELGE_ETIKET, belgeUrl,
} from "./portalUtils";
import { SayfaBasligi } from "./kasaUI";
import BeyannameSecici from "./BeyannameSecici";
import { AlertTriangle, FileText } from "lucide-react";

// Durum/iade rozetleri — tek accent + semantik (gökkuşağı yok).
// bekliyor=amber · odendi=emerald · iade beklemede=rose (açık kalan tutar) · iade edildi=indigo (çözümlenmiş).
const DURUM_STIL: Record<string, string> = {
  bekliyor: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  odendi: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};
const IADE_STIL: Record<string, string> = {
  beklemede: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  iade_edildi: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
};

function basHarf(s: string | null | undefined) {
  return (s ?? "?").trim().slice(0, 2).toUpperCase();
}

// Ödenmiş ama beyannamesiz talepler — temsilciden eşleştirme istenir
function EslesmeBekleyenler({
  talepler, beyannameler,
}: { talepler: TalepDetay[]; beyannameler: Beyanname[] }) {
  const { toast } = useToast();
  const [secimler, setSecimler] = useState<Record<string, string>>({});
  const [gonderilen, setGonderilen] = useState<string | null>(null);

  const bekleyenler = talepler.filter((t) => !t.beyannameId && t.durum === "odendi");
  if (!bekleyenler.length) return null;

  const eslestir = async (talepId: string) => {
    const beyannameId = secimler[talepId];
    if (!beyannameId) {
      toast({ title: "Beyanname seçin", variant: "destructive" });
      return;
    }
    setGonderilen(talepId);
    try {
      const res = await fetch(`/api/portal/talepler/${talepId}/beyanname`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beyannameId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Eşleştirme yapılamadı");
      toast({ title: "Eşleştirildi" });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/talepler"] });
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally {
      setGonderilen(null);
    }
  };

  return (
    <Card className="border-amber-200 dark:border-amber-900/40">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="h-[18px] w-[18px]" />
          </span>
          <CardTitle className="text-base font-semibold text-amber-700 dark:text-amber-300">
            Eşleşme Bekleyen Ödemeler ({bekleyenler.length})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Bu ödemeler dosyasız gönderilmişti ve ödendi. Lütfen ait oldukları beyannameyle
          eşleştirin.
        </p>
        {bekleyenler.map((t) => {
          return (
            <div
              key={t.id}
              className="rounded-lg border bg-muted/20 p-3.5 space-y-2.5"
              data-testid={`row-eslesmeyen-${t.id}`}
            >
              <div className="text-sm">
                <span className="tabular-nums font-medium">{formatTarih(t.talepTarihi)}</span>
                <span className="text-muted-foreground"> — </span>
                <span className="font-semibold tabular-nums text-rose-600">{formatPara(t.tutar, t.paraBirimi)}</span>
                <span className="text-muted-foreground"> — {t.alacakli}</span>
                {t.aciklama && <span className="text-muted-foreground"> — {t.aciklama}</span>}
              </div>
              <div className="flex flex-col md:flex-row gap-2">
                <BeyannameSecici
                  beyannameler={beyannameler}
                  value={secimler[t.id] ?? ""}
                  onChange={(v) => setSecimler((s) => ({ ...s, [t.id]: v }))}
                  testId={`select-eslestir-${t.id}`}
                  className="md:max-w-md"
                />
                <Button
                  size="sm"
                  onClick={() => eslestir(t.id)}
                  disabled={gonderilen === t.id}
                  data-testid={`button-eslestir-${t.id}`}
                >
                  {gonderilen === t.id ? "Eşleştiriliyor…" : "Eşleştir"}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function TaleplerimSayfasi() {
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({
    queryKey: ["/api/portal/beyannameler"],
  });
  const { data: talepler = [] } = useQuery<TalepDetay[]>({
    queryKey: ["/api/portal/talepler"],
  });

  return (
    <div className="space-y-6">
      <SayfaBasligi baslik="Taleplerim" alt="Gönderdiğiniz ödeme taleplerinin durumu ve belgeleri" />

      <EslesmeBekleyenler talepler={talepler} beyannameler={beyannameler} />

      <Card>
        <CardHeader>
          <CardTitle>Taleplerim</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent bg-muted/40 border-border">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tarih</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dosya No</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Müşteri</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tür</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tutar</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alacaklı</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Durum</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Belgeler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {talepler.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Henüz talep yok
                  </TableCell>
                </TableRow>
              )}
              {talepler.map((t) => (
                <TableRow key={t.id} className="hover:bg-muted/30 border-border" data-testid={`row-talep-${t.id}`}>
                  <TableCell className="text-sm tabular-nums">{formatTarih(t.talepTarihi)}</TableCell>
                  <TableCell>
                    {t.beyanname?.dosyaNo ? (
                      <span className="font-semibold tabular-nums">{t.beyanname.dosyaNo}</span>
                    ) : (
                      <span className="inline-block rounded-md border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">Dosyasız</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-48">
                    {t.beyanname?.alici ? (
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-[10px] font-bold text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                          {basHarf(t.beyanname.alici)}
                        </span>
                        <span className="truncate" title={t.beyanname.alici}>{t.beyanname.alici}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{TIP_ETIKET[t.odemeTipi] ?? t.odemeTipi}</div>
                    {t.odemeTipi === "masraf" && (
                      <div className="text-xs text-muted-foreground">{t.masrafTuru}</div>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold tabular-nums text-rose-600">
                    {formatPara(t.tutar, t.paraBirimi)}
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-sm">{t.alacakli}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge className={`border-transparent ${DURUM_STIL[t.durum] ?? DURUM_STIL.bekliyor}`}>
                        {DURUM_ETIKET[t.durum] ?? t.durum}
                      </Badge>
                      {t.odemeTipi === "depo_teminat" && t.iadeDurumu && (
                        <Badge className={`border-transparent ${IADE_STIL[t.iadeDurumu] ?? IADE_STIL.beklemede}`}>
                          {IADE_ETIKET[t.iadeDurumu] ?? t.iadeDurumu}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {t.belgeler.map((b) => (
                        <a
                          key={b.id}
                          href={belgeUrl(b)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-w-0 items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate">{BELGE_ETIKET[b.belgeTipi] ?? b.belgeTipi}: {b.filename}</span>
                        </a>
                      ))}
                      {t.belgeler.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
