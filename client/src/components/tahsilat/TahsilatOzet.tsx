import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, PhoneCall, Wallet, AlertTriangle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEGMENT_LABEL, SEGMENT_PILL, kisaTutar, tarihGoster, type TahsilatSegment } from "@shared/tahsilatHesaplari";
import { MusteriDrillDown } from "./MusteriDrillDown";

type SegmentFiltre = TahsilatSegment | "AKSIYON";

const MATRIS: { segment: TahsilatSegment; emoji: string; alt: string; aktifKutu: string }[] = [
  { segment: "SAGLIKLI", emoji: "🟢", alt: "Kazandırıyor + ödüyor — dokunma", aktifKutu: "ring-emerald-400" },
  { segment: "BUYUK_RISK", emoji: "🟠", alt: "Kazandırıyor ama ödemiyor — diplomatik takip", aktifKutu: "ring-amber-400" },
  { segment: "KUCUK_NOTR", emoji: "⚪", alt: "Kazandırmıyor ama ödüyor", aktifKutu: "ring-slate-400" },
  { segment: "NAKIT_TUZAGI", emoji: "🔴", alt: "Kazandırmıyor + ödemiyor — hedef liste", aktifKutu: "ring-rose-400" },
];

export function TahsilatOzet({ mizanId }: { mizanId?: string }) {
  const [filtre, setFiltre] = useState<SegmentFiltre>("AKSIYON");
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

  const o = data.ozet;
  const musteriler = data.musteriler as any[];
  const segmentOzet = new Map<string, { sayi: number; toplam: number; toplamUsd: number }>(
    (o.segmentDagilim as any[]).map((s) => [s.segment, { sayi: s.sayi, toplam: s.toplam, toplamUsd: s.toplamUsd || 0 }])
  );

  const delta = o.toplamNetAlacakDelta as number | null;
  const usdEk = (v: number) => (v > 0 ? ` · +${fmtUsd(v)}` : "");
  const kpis = [
    { label: "Dışarıdaki Nakit", value: fmtTry(o.toplamNetAlacak), sub: `${musteriler.length} müşteri${usdEk(o.toplamNetAlacakUsd)}`, color: "#0ea5e9", Icon: Wallet },
    { label: "Nakit Tuzağında", value: fmtTry(o.nakitTuzagiToplam), sub: `${o.nakitTuzagiSayisi} firma — hedef liste${usdEk(o.nakitTuzagiToplamUsd)}`, color: "#e11d48", Icon: PhoneCall },
    { label: "Büyük Riskte", value: fmtTry(o.buyukRiskToplam), sub: `${o.buyukRiskSayisi} firma — diplomatik takip${usdEk(o.buyukRiskToplamUsd)}`, color: "#f59e0b", Icon: AlertTriangle },
    {
      label: "Önceki Mizana Göre",
      value: delta === null ? "—" : `${delta > 0 ? "▲" : delta < 0 ? "▼" : ""} ${fmtTry(Math.abs(delta))}`,
      sub: o.oncekiMizanTarihi ? `ref: ${tarihGoster(o.oncekiMizanTarihi)} (TL hesaplar)` : "önceki mizan yok",
      color: delta === null ? "#64748b" : delta > 0 ? "#e11d48" : "#10b981",
      Icon: delta !== null && delta > 0 ? ArrowUpRight : ArrowDownRight,
    },
  ];

  const liste = musteriler
    .filter((m) => (filtre === "AKSIYON" ? m.segment === "NAKIT_TUZAGI" || m.segment === "BUYUK_RISK" : m.segment === filtre))
    .sort((a, b) => b.netBakiye - a.netBakiye);

  return (
    <div className="space-y-[18px]">
      {/* 4 nakit KPI — accent-bar */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
            <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
            <div className="pl-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">{k.label}</div>
            <div className="mt-2 pl-2 text-[20px] font-extrabold tracking-tight tabular-nums" style={{ color: k.color }}>{k.value}</div>
            <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Segment matrisi — kutuya tıkla → alt liste filtrelenir */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {MATRIS.map((s) => {
          const seg = segmentOzet.get(s.segment) || { sayi: 0, toplam: 0, toplamUsd: 0 };
          const aktif = filtre === s.segment;
          return (
            <button
              key={s.segment}
              onClick={() => setFiltre(aktif ? "AKSIYON" : s.segment)}
              className={cn(
                "rounded-[14px] border bg-card p-4 text-left transition-shadow hover:shadow-md",
                aktif && `ring-2 ${s.aktifKutu}`
              )}
            >
              <div className="text-[13px] font-bold">{s.emoji} {SEGMENT_LABEL[s.segment]}</div>
              <div className="mt-1.5 text-[18px] font-extrabold tabular-nums">{fmtTry(seg.toplam)}</div>
              <div className="text-[11.5px] tabular-nums text-muted-foreground">{seg.sayi} firma{seg.toplamUsd > 0 ? ` · +${fmtUsd(seg.toplamUsd)}` : ""}</div>
              <div className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">{s.alt}</div>
            </button>
          );
        })}
      </div>

      {/* Aranacaklar listesi */}
      <div className="rounded-[14px] border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-rose-500" />
            <h3 className="text-[15px] font-bold">
              {filtre === "AKSIYON" ? "Aranacaklar — Nakit Tuzağı + Büyük Risk" : `${SEGMENT_LABEL[filtre]} Firmalar`}
            </h3>
          </div>
          <span className="text-[12.5px] tabular-nums text-muted-foreground">{liste.length} firma</span>
        </div>
        {liste.length === 0 ? (
          <div className="text-center text-muted-foreground py-10">Bu segmentte firma yok 🎉</div>
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5 text-left">Firma</th>
                  <th className="px-3 py-2.5 text-right">Borç</th>
                  <th className="px-3 py-2.5 text-right">Ödeme %</th>
                  <th className="px-3 py-2.5 text-right">Son Ödeme</th>
                  <th className="px-3 py-2.5 text-right">Yılda İş</th>
                  <th className="px-3 py-2.5 text-right">Değişim</th>
                  <th className="px-5 py-2.5 text-left">Neden</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {liste.map((m) => (
                  <tr key={m.musteriId} className="cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setDrillId(m.musteriId)}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold truncate max-w-[260px]">{m.ad}</span>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", SEGMENT_PILL[m.segment as TahsilatSegment])}>
                          {SEGMENT_LABEL[m.segment as TahsilatSegment]}
                        </span>
                        {m.doviz === "USD" && <span title="Dolar hesabı (120-02)" className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">USD</span>}
                        {m.eslesmemis && <span title="Gümrük eşleşmesi yok" className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">eşleşmemiş</span>}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">{m.hesapKodu}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-orange-700 whitespace-nowrap">{fmtPara(m.netBakiye, m.doviz)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{m.odemeOrani === null ? "—" : `%${Math.round(m.odemeOrani * 100)}`}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{m.gecikme >= 9999 ? "hiç" : `${m.gecikme}g önce`}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{m.ytdIslemSayisi === null ? "—" : m.ytdIslemSayisi}</td>
                    <td className={cn("px-3 py-3 text-right tabular-nums whitespace-nowrap", m.deltaNetBakiye > 0 ? "text-rose-600 font-semibold" : m.deltaNetBakiye < 0 ? "text-emerald-600" : "")}>
                      {m.deltaNetBakiye === null ? "—" : `${m.deltaNetBakiye > 0 ? "▲" : m.deltaNetBakiye < 0 ? "▼" : ""} ${m.doviz === "USD" ? "$" : ""}${kisaTutar(Math.abs(m.deltaNetBakiye))}`}
                    </td>
                    <td className="px-5 py-3 text-[12px] leading-snug text-muted-foreground">{m.neden}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MusteriDrillDown musteriId={drillId} onClose={() => setDrillId(null)} />
    </div>
  );
}
