import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp, TrendingDown, Ban, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEGMENT_LABEL, SEGMENT_PILL, tarihGoster, type TahsilatSegment } from "@shared/tahsilatHesaplari";
import { MusteriDrillDown } from "./MusteriDrillDown";

export function HaftalikRapor({ mizanId }: { mizanId?: string }) {
  const [drillId, setDrillId] = useState<string | null>(null);
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/tahsilat/dashboard", mizanId],
    queryFn: async () => {
      const r = await fetch(`/api/tahsilat/dashboard${mizanId ? `?mizanId=${mizanId}` : ""}`);
      return r.json();
    },
  });

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);
  const fmtUsd = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const fmtPara = (v: number, doviz: string) => (doviz === "USD" ? fmtUsd(v) : fmtTry(v));

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-sky-500" /></div>;
  if (!data?.mizan) return <div className="text-center text-muted-foreground py-12">Henüz mizan yüklenmemiş.</div>;
  const r = data.rapor;
  if (!r) return <div className="text-center text-muted-foreground py-12">Rapor için aynı yıl içinde en az 2 mizan gerekli. Haftalık mizanları yükledikçe bu sekme dönem karşılaştırması gösterir.</div>;

  const usdEk = (v: number) => (v > 0 ? ` +${fmtUsd(v)}` : "");
  const tahsilatOrani = r.toplamYeniFaturaTL > 0 ? (r.toplamTahsilatTL / r.toplamYeniFaturaTL) * 100 : null;
  const kpis = [
    { label: "Dönem Tahsilatı", value: fmtTry(r.toplamTahsilatTL), sub: `bu dönemde gelen para${usdEk(r.toplamTahsilatUsd)}`, color: "#10b981" },
    { label: "Yeni Fatura", value: fmtTry(r.toplamYeniFaturaTL), sub: `bu dönemde kesilen${usdEk(r.toplamYeniFaturaUsd)}`, color: "#0ea5e9" },
    {
      label: "Net Değişim",
      value: r.netDegisimTL === null ? "—" : `${r.netDegisimTL > 0 ? "▲" : r.netDegisimTL < 0 ? "▼" : ""} ${fmtTry(Math.abs(r.netDegisimTL))}`,
      sub: r.netDegisimTL > 0 ? "dışarıdaki nakit büyüdü" : "dışarıdaki nakit azaldı",
      color: r.netDegisimTL > 0 ? "#e11d48" : "#10b981",
    },
    { label: "Tahsilat / Fatura", value: tahsilatOrani === null ? "—" : `%${Math.round(tahsilatOrani)}`, sub: "%100+ = borç eriyor", color: tahsilatOrani !== null && tahsilatOrani >= 100 ? "#10b981" : "#f59e0b" },
  ];

  const ListeKart = ({ baslik, Icon, renk, satirlar, tutarRenk }: any) => (
    <div className="rounded-[14px] border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b px-5 py-3.5">
        <Icon className={cn("h-4 w-4", renk)} />
        <h3 className="text-[14px] font-bold">{baslik}</h3>
      </div>
      {satirlar.length === 0 ? (
        <div className="py-6 text-center text-[12.5px] text-muted-foreground">Bu dönemde yok</div>
      ) : (
        <div className="divide-y">
          {satirlar.map((s: any) => (
            <div key={s.musteriId} className="flex cursor-pointer items-center justify-between gap-2 px-5 py-2.5 hover:bg-slate-50" onClick={() => setDrillId(s.musteriId)}>
              <span className="truncate text-[13px] font-medium">{s.ad}{s.doviz === "USD" ? " · USD" : ""}</span>
              <span className={cn("shrink-0 text-[13px] font-bold tabular-nums", tutarRenk)}>{fmtPara(s.tutar, s.doviz)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const GecisListe = ({ baslik, satirlar, ok }: any) => (
    <div className="rounded-[14px] border bg-card overflow-hidden">
      <div className="border-b px-5 py-3.5"><h3 className="text-[14px] font-bold">{baslik}</h3></div>
      {satirlar.length === 0 ? (
        <div className="py-6 text-center text-[12.5px] text-muted-foreground">Bu dönemde yok</div>
      ) : (
        <div className="divide-y">
          {satirlar.map((g: any) => (
            <div key={g.musteriId} className="flex cursor-pointer items-center justify-between gap-2 px-5 py-2.5 hover:bg-slate-50" onClick={() => setDrillId(g.musteriId)}>
              <span className="truncate text-[13px] font-medium">{g.ad}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-[10.5px] font-bold">
                <span className={cn("rounded-full px-2 py-0.5", SEGMENT_PILL[g.eski as TahsilatSegment])}>{SEGMENT_LABEL[g.eski as TahsilatSegment]}</span>
                <ArrowRight className={cn("h-3 w-3", ok)} />
                <span className={cn("rounded-full px-2 py-0.5", SEGMENT_PILL[g.yeni as TahsilatSegment])}>{SEGMENT_LABEL[g.yeni as TahsilatSegment]}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-[18px]">
      <div className="text-[13px] text-muted-foreground">
        Dönem: <b className="text-foreground">{tarihGoster(r.oncekiMizanTarihi)} → {tarihGoster(data.mizan.mizanTarihi)}</b> · {r.gunSayisi} gün
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
            <span className="absolute bottom-0 left-0 top-0 w-1" style={{ background: k.color }} />
            <div className="pl-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className="mt-2 pl-2 text-[20px] font-extrabold tabular-nums tracking-tight" style={{ color: k.color }}>{k.value}</div>
            <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListeKart baslik="En Çok Ödeyen 5" Icon={TrendingUp} renk="text-emerald-500" satirlar={r.enCokOdeyen} tutarRenk="text-emerald-600" />
        <ListeKart baslik="Borcu En Çok Büyüyen 5" Icon={TrendingDown} renk="text-rose-500" satirlar={r.borcuBuyuyen} tutarRenk="text-rose-600" />
      </div>

      <div className="rounded-[14px] border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-rose-500" />
            <h3 className="text-[14px] font-bold">Bu Dönem Hiç Ödemeyenler (borçlu)</h3>
          </div>
          <span className="text-[12px] tabular-nums text-muted-foreground">{r.hicOdemeyen.sayi} firma · {fmtTry(r.hicOdemeyen.toplamTL)}</span>
        </div>
        {r.hicOdemeyen.ilk10.length === 0 ? (
          <div className="py-6 text-center text-[12.5px] text-muted-foreground">Herkes ödeme yapmış 🎉</div>
        ) : (
          <div className="divide-y">
            {r.hicOdemeyen.ilk10.map((s: any) => (
              <div key={s.musteriId} className="flex cursor-pointer items-center justify-between gap-2 px-5 py-2.5 hover:bg-slate-50" onClick={() => setDrillId(s.musteriId)}>
                <span className="truncate text-[13px] font-medium">{s.ad}{s.doviz === "USD" ? " · USD" : ""}</span>
                <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">son ödeme {s.gecikme >= 9999 ? "hiç" : `${s.gecikme}g önce`}</span>
                <span className="shrink-0 text-[13px] font-bold tabular-nums text-orange-700">{fmtPara(s.netBakiye, s.doviz)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GecisListe baslik="📉 Bozulanlar (segment kötüleşti)" satirlar={r.bozulanlar} ok="text-rose-500" />
        <GecisListe baslik="📈 Düzelenler" satirlar={r.duzelenler} ok="text-emerald-500" />
      </div>

      <MusteriDrillDown musteriId={drillId} onClose={() => setDrillId(null)} />
    </div>
  );
}
