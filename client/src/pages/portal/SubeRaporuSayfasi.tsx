import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SubeGiderRaporu } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatPara } from "./portalUtils";

// YEREL bileşenlerden YYYY-MM-DD üretir. Depolanan tarih string'ini PARSE ETMEZ
// (new Date("2026-07-01") UTC yorumlanıp timezone kayması yaratır — bu fonksiyonlar o riski taşımaz).
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ayBasi(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function SubeRaporuSayfasi() {
  const [baslangic, setBaslangic] = useState(ayBasi());
  const [bitis, setBitis] = useState(ymd(new Date()));

  const { data, isLoading } = useQuery<SubeGiderRaporu>({
    queryKey: [`/api/portal/operasyon-takip/rapor/sube?baslangic=${baslangic}&bitis=${bitis}`],
  });

  const excelIndir = () => {
    window.location.href = `/api/portal/operasyon-takip/rapor/sube/excel?baslangic=${baslangic}&bitis=${bitis}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Şube Gider Raporu</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Başlangıç</Label>
              <Input type="date" value={baslangic} onChange={(e) => setBaslangic(e.target.value)} data-testid="input-rapor-baslangic" />
            </div>
            <div className="space-y-1">
              <Label>Bitiş</Label>
              <Input type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} data-testid="input-rapor-bitis" />
            </div>
            <Button variant="outline" onClick={excelIndir} data-testid="button-sube-rapor-excel">Excel İndir</Button>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Yükleniyor…</p>}
          {!isLoading && (data?.subeler.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="text-rapor-bos">Seçilen aralıkta masraf yok.</p>
          )}

          {data?.subeler.map((b) => (
            <div key={b.sube} className="rounded-md border p-3 space-y-1" data-testid={`rapor-sube-${b.sube}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{b.sube}</span>
                <span className="font-bold" data-testid={`rapor-sube-toplam-${b.sube}`}>{formatPara(b.toplam, "TL")}</span>
              </div>
              <div className="border-t pt-1 space-y-0.5">
                {b.turler.map((t) => (
                  <div key={t.masrafTuru} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t.masrafTuru} · {t.adet} adet</span>
                    <span>{formatPara(t.tutar, "TL")}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {data && data.subeler.length > 0 && (
            <div className="flex items-center justify-between border-t pt-3">
              <span className="font-medium">GENEL TOPLAM</span>
              <span className="text-lg font-bold" data-testid="text-rapor-genel-toplam">{formatPara(data.genelToplam, "TL")}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
