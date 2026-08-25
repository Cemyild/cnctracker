import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Beyanname } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTarih, formatPara } from "@/pages/portal/portalUtils";

/**
 * Ödemeler ▸ İzleme: yüklenmiş beyannamelerin rejim bazlı listesi.
 *
 * Süzme, arama ve sayfalama SUNUCUDA yapılır (/api/odemeler/beyannameler →
 * storage.getBeyannameListesi). Portal tarafındaki "tüm tabloyu indir" kalıbı
 * burada tekrarlanmaz: tablo on binlerce satıra çıkabiliyor.
 */

type BeyannameSayfa = {
  satirlar: Beyanname[];
  toplam: number;
  sayilar: { IM: number; EX: number; TR: number };
};

const REJIM_SEKMELERI = [
  { kod: "IM", etiket: "İthalat" },
  { kod: "EX", etiket: "İhracat" },
  { kod: "TR", etiket: "Transit" },
] as const;

type RejimKodu = (typeof REJIM_SEKMELERI)[number]["kod"];

const SAYFA_BOYU = 50;

export function BeyannameListesi() {
  const [rejim, setRejim] = useState<RejimKodu>("IM");
  const [aramaGirdi, setAramaGirdi] = useState("");
  const [arama, setArama] = useState("");
  const [sayfa, setSayfa] = useState(0);

  // Her tuş vuruşunda sorgu atılmasın: 300 ms sessizlikten sonra aranır.
  useEffect(() => {
    const zaman = setTimeout(() => {
      setArama(aramaGirdi.trim());
      setSayfa(0);
    }, 300);
    return () => clearTimeout(zaman);
  }, [aramaGirdi]);

  const url =
    `/api/odemeler/beyannameler?rejim=${rejim}&arama=${encodeURIComponent(arama)}` +
    `&limit=${SAYFA_BOYU}&offset=${sayfa * SAYFA_BOYU}`;
  const { data, isFetching } = useQuery<BeyannameSayfa>({
    queryKey: [url],
    placeholderData: keepPreviousData, // sekme/sayfa değişirken tablo boşalmasın
  });

  const satirlar = data?.satirlar ?? [];
  const toplam = data?.toplam ?? 0;
  const ilk = toplam === 0 ? 0 : sayfa * SAYFA_BOYU + 1;
  const son = Math.min((sayfa + 1) * SAYFA_BOYU, toplam);
  // Transitte dosya no, karşı taraf ve fatura bedeli YOKTUR (elle girilen kayıt).
  const transit = rejim === "TR";
  const sutunSayisi = transit ? 5 : 8;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle>Beyanname Listesi</CardTitle>
        <Input
          value={aramaGirdi}
          onChange={(e) => setAramaGirdi(e.target.value)}
          placeholder="Dosya no, beyanname no, firma veya AV ara…"
          className="w-full sm:max-w-xs"
          data-testid="input-beyanname-arama"
        />
      </CardHeader>
      <CardContent className="space-y-3">
        <Tabs
          value={rejim}
          onValueChange={(v) => {
            setRejim(v as RejimKodu);
            setSayfa(0);
          }}
        >
          <TabsList>
            {REJIM_SEKMELERI.map((sekme) => (
              <TabsTrigger
                key={sekme.kod}
                value={sekme.kod}
                data-testid={`tab-beyanname-${sekme.kod}`}
              >
                {sekme.etiket}
                <Badge variant="secondary" className="ml-2">
                  {data?.sayilar[sekme.kod] ?? 0}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {!transit && <TableHead>Dosya No</TableHead>}
                <TableHead>Beyanname No</TableHead>
                <TableHead>Beyan Tarihi</TableHead>
                <TableHead>{transit ? "Firma" : "Müşteri"}</TableHead>
                {!transit && (
                  <TableHead>{rejim === "EX" ? "Yurt Dışı Alıcı" : "Gönderen"}</TableHead>
                )}
                <TableHead>Gümrük İdaresi</TableHead>
                {!transit && <TableHead className="text-right">Fatura Bedeli</TableHead>}
                <TableHead>{transit ? "Kaynak" : "AV"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {satirlar.length === 0 && (
                <TableRow>
                  <TableCell colSpan={sutunSayisi} className="text-center text-muted-foreground">
                    {arama ? "Aramayla eşleşen beyanname yok" : "Kayıt yok"}
                  </TableCell>
                </TableRow>
              )}
              {satirlar.map((b) => (
                <TableRow key={b.id} data-testid={`row-beyanname-${b.id}`}>
                  {!transit && <TableCell className="font-medium">{b.dosyaNo ?? "—"}</TableCell>}
                  <TableCell className="whitespace-nowrap">{b.beyanNo ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatTarih(b.beyanTarihi)}</TableCell>
                  <TableCell className="max-w-56 truncate" title={b.alici ?? ""}>
                    {b.alici ?? "—"}
                  </TableCell>
                  {!transit && (
                    <TableCell className="max-w-56 truncate" title={b.gonderen ?? ""}>
                      {b.gonderen ?? "—"}
                    </TableCell>
                  )}
                  <TableCell className="max-w-40 truncate" title={b.gumrukIdaresi ?? ""}>
                    {b.gumrukIdaresi ?? "—"}
                  </TableCell>
                  {!transit && (
                    <TableCell className="text-right whitespace-nowrap">
                      {formatPara(b.fatBedeli, b.doviz)}
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap">
                    {transit ? (b.kaynak === "manuel" ? "Elle" : "Excel") : (b.kullanici ?? "—")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span data-testid="text-beyanname-sayac">
            {toplam === 0 ? "Kayıt yok" : `${ilk}–${son} / ${toplam}`}
            {isFetching ? " · yükleniyor…" : ""}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={sayfa === 0}
              onClick={() => setSayfa((p) => Math.max(0, p - 1))}
              data-testid="button-beyanname-onceki"
            >
              Önceki
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={son >= toplam}
              onClick={() => setSayfa((p) => p + 1)}
              data-testid="button-beyanname-sonraki"
            >
              Sonraki
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
