import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SilmeLog } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SayfaBasligi } from "./kasaUI";

const TH = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

const TIP_ETIKET: Record<string, string> = {
  odeme_talebi: "Ödeme Talebi",
  operasyon_masraf: "Şube Masrafı",
  operasyon_avans: "Avans",
};
const TIP_STIL: Record<string, string> = {
  odeme_talebi: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  operasyon_masraf: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  operasyon_avans: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};

// timestamp → "30/07/2026 14:32". Sunucu ISO döndürür; burada YALNIZCA gösterim yapılır.
function zaman(t: string | Date | null): string {
  if (!t) return "—";
  const d = typeof t === "string" ? new Date(t) : t;
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function SilmeLogSayfasi() {
  const { data: kayitlar = [] } = useQuery<SilmeLog[]>({ queryKey: ["/api/portal/admin/silme-log"] });
  const [detay, setDetay] = useState<SilmeLog | null>(null);

  return (
    <div className="space-y-6">
      <SayfaBasligi
        baslik="Silme Günlüğü"
        alt={`${kayitlar.length} silme kaydı · silinen kayıtların değişmez izi`}
      />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className={TH}>Zaman</TableHead>
              <TableHead className={TH}>Silen</TableHead>
              <TableHead className={TH}>Tür</TableHead>
              <TableHead className={TH}>Kayıt</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {kayitlar.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Henüz silinen kayıt yok
                </TableCell>
              </TableRow>
            )}
            {kayitlar.map((k) => (
              <TableRow key={k.id} className="hover:bg-muted/30" data-testid={`row-silme-${k.id}`}>
                <TableCell className="whitespace-nowrap text-sm tabular-nums">{zaman(k.silmeZamani)}</TableCell>
                <TableCell className="text-sm font-medium">{k.silenAd}</TableCell>
                <TableCell>
                  <Badge className={`border-transparent ${TIP_STIL[k.kayitTipi] ?? ""}`}>
                    {TIP_ETIKET[k.kayitTipi] ?? k.kayitTipi}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-lg truncate text-sm" title={k.ozet}>{k.ozet}</TableCell>
                <TableCell className="text-right">
                  {k.detayJson && (
                    <Button variant="outline" size="sm" className="h-7" onClick={() => setDetay(k)} data-testid={`button-silme-detay-${k.id}`}>
                      Detay
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!detay} onOpenChange={(a) => { if (!a) setDetay(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Silinen Kaydın Tam Hâli</DialogTitle></DialogHeader>
          <div className="min-w-0 space-y-2">
            <div className="text-sm text-muted-foreground">
              {detay && `${zaman(detay.silmeZamani)} · ${detay.silenAd} · ${TIP_ETIKET[detay.kayitTipi] ?? detay.kayitTipi}`}
            </div>
            {/* Ham JSON: kaydı yeniden oluşturmak gerekirse tek kaynak burasıdır. */}
            <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
              {detay?.detayJson ? JSON.stringify(JSON.parse(detay.detayJson), null, 2) : ""}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
