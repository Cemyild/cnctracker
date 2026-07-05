import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Beyanname } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  type TalepDetay, formatTarih, formatPara,
  TIP_ETIKET, DURUM_ETIKET, IADE_ETIKET, BELGE_ETIKET, belgeUrl,
} from "./portalUtils";
import BelgeLinkleri from "./BelgeLinkleri";

// Ödenmiş ama beyannamesiz talepler — temsilciden eşleştirme istenir
function EslesmeBekleyenler({
  talepler, beyannameler,
}: { talepler: TalepDetay[]; beyannameler: Beyanname[] }) {
  const { toast } = useToast();
  const [secimler, setSecimler] = useState<Record<string, string>>({});
  const [aramalar, setAramalar] = useState<Record<string, string>>({});
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
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="text-amber-700">
          Eşleşme Bekleyen Ödemeler ({bekleyenler.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Bu ödemeler dosyasız gönderilmişti ve ödendi. Lütfen ait oldukları beyannameyle
          eşleştirin.
        </p>
        {bekleyenler.map((t) => {
          const q = (aramalar[t.id] ?? "").trim().toLocaleLowerCase("tr");
          const filtreli = q
            ? beyannameler.filter(
                (b) =>
                  b.dosyaNo.toLocaleLowerCase("tr").includes(q) ||
                  (b.alici ?? "").toLocaleLowerCase("tr").includes(q),
              )
            : beyannameler;
          return (
            <div
              key={t.id}
              className="rounded-md border p-3 space-y-2"
              data-testid={`row-eslesmeyen-${t.id}`}
            >
              <div className="text-sm">
                {formatTarih(t.talepTarihi)} — {formatPara(t.tutar, t.paraBirimi)} — {t.alacakli}
                {t.aciklama && <span className="text-muted-foreground"> — {t.aciklama}</span>}
              </div>
              <div className="flex flex-col md:flex-row gap-2">
                <Input
                  placeholder="Beyanname ara…"
                  value={aramalar[t.id] ?? ""}
                  onChange={(e) => setAramalar((s) => ({ ...s, [t.id]: e.target.value }))}
                  className="md:max-w-56"
                />
                <Select
                  value={secimler[t.id] ?? ""}
                  onValueChange={(v) => setSecimler((s) => ({ ...s, [t.id]: v }))}
                >
                  <SelectTrigger className="md:max-w-md">
                    <SelectValue placeholder="Beyanname seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {filtreli.slice(0, 100).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.dosyaNo} — {b.alici ?? "?"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
      <EslesmeBekleyenler talepler={talepler} beyannameler={beyannameler} />

      <Card>
        <CardHeader>
          <CardTitle>Taleplerim</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarih</TableHead>
                <TableHead>Dosya No</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>Tutar</TableHead>
                <TableHead>Alacaklı</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Belgeler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {talepler.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Henüz talep yok
                  </TableCell>
                </TableRow>
              )}
              {talepler.map((t) => (
                <TableRow key={t.id} data-testid={`row-talep-${t.id}`}>
                  <TableCell>{formatTarih(t.talepTarihi)}</TableCell>
                  <TableCell>
                    {t.beyanname?.dosyaNo ?? <Badge variant="outline">Dosyasız</Badge>}
                  </TableCell>
                  <TableCell className="max-w-48 truncate">{t.beyanname?.alici ?? "—"}</TableCell>
                  <TableCell>
                    {TIP_ETIKET[t.odemeTipi] ?? t.odemeTipi}
                    {t.odemeTipi === "masraf" ? ` / ${t.masrafTuru}` : ""}
                  </TableCell>
                  <TableCell>{formatPara(t.tutar, t.paraBirimi)}</TableCell>
                  <TableCell className="max-w-40 truncate">{t.alacakli}</TableCell>
                  <TableCell>
                    <Badge variant={t.durum === "odendi" ? "default" : "secondary"}>
                      {DURUM_ETIKET[t.durum] ?? t.durum}
                    </Badge>
                    {t.odemeTipi === "depo_teminat" && t.iadeDurumu && (
                      <Badge variant="outline" className="ml-1">
                        {IADE_ETIKET[t.iadeDurumu] ?? t.iadeDurumu}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      {t.belgeler.map((b) => (
                        <a
                          key={b.id}
                          href={belgeUrl(b)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary underline"
                        >
                          {BELGE_ETIKET[b.belgeTipi] ?? b.belgeTipi}: {b.filename}
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
