import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SubeGiderRaporu } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";
import { formatPara } from "./portalUtils";
import { SayfaBasligi, KpiKart, IK } from "./kasaUI";

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

  const { data, isLoading, isError, error } = useQuery<SubeGiderRaporu>({
    queryKey: [`/api/portal/operasyon-takip/rapor/sube?baslangic=${baslangic}&bitis=${bitis}`],
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const excelIndir = () => {
    window.location.href = `/api/portal/operasyon-takip/rapor/sube/excel?baslangic=${baslangic}&bitis=${bitis}`;
  };

  const veriVar = (data?.subeler.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <SayfaBasligi baslik="Şube Gider Raporu" alt="Seçilen tarih aralığında şube bazlı masraf dökümü" />

      {/* Tarih aralığı + Excel */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Başlangıç</Label>
            <Input type="date" value={baslangic} onChange={(e) => setBaslangic(e.target.value)} data-testid="input-rapor-baslangic" />
          </div>
          <div className="space-y-1">
            <Label>Bitiş</Label>
            <Input type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} data-testid="input-rapor-bitis" />
          </div>
          <Button variant="outline" onClick={excelIndir} data-testid="button-sube-rapor-excel">
            <IK.Download className="mr-1.5 h-4 w-4" />Excel İndir
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">Yükleniyor…</div>
      )}
      {isError && (
        <div className="rounded-xl border bg-card p-4 text-sm text-destructive shadow-sm" data-testid="text-rapor-hata">
          Rapor yüklenemedi: {(error as Error)?.message ?? "Bilinmeyen hata"}
        </div>
      )}
      {!isLoading && !isError && !veriVar && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm" data-testid="text-rapor-bos">
          Seçilen aralıkta masraf yok.
        </div>
      )}

      {veriVar && data && (
        <>
          {/* Özet KPI'lar */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <KpiKart
              ikon={<IK.ArrowUpFromLine className="h-[19px] w-[19px]" />}
              label="Genel Toplam"
              deger={<span data-testid="text-rapor-genel-toplam">{formatPara(data.genelToplam, "₺")}</span>}
              renk="text-rose-600"
              alt={`${data.subeler.length} şube`}
            />
            <KpiKart
              ikon={<Building2 className="h-[19px] w-[19px]" />}
              label="Şube Sayısı"
              deger={data.subeler.length}
              alt="masraf kaydı olan şube"
            />
          </div>

          {/* Şube bazlı döküm */}
          <div className="space-y-4">
            {data.subeler.map((b) => (
              <div key={b.sube} className="overflow-hidden rounded-xl border bg-card shadow-sm" data-testid={`rapor-sube-${b.sube}`}>
                <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3">
                  <span className="font-semibold">{b.sube}</span>
                  <span className="font-bold tabular-nums text-rose-600" data-testid={`rapor-sube-toplam-${b.sube}`}>
                    {formatPara(b.toplam, "₺")}
                  </span>
                </div>
                <div className="divide-y divide-border/60">
                  {b.turler.map((t, i) => (
                    <div key={`${t.masrafTuru}-${i}`} className="flex items-center justify-between px-5 py-2 text-sm hover:bg-muted/30">
                      <span className="text-muted-foreground">
                        {t.masrafTuru} <span className="text-xs">· {t.adet} adet</span>
                      </span>
                      <span className="font-medium tabular-nums">{formatPara(t.tutar, "₺")}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
