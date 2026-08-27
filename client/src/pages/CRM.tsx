import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookUser, CalendarClock, Contact, FileSignature, Layers, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DepartmanYonetimi } from "@/components/crm/DepartmanYonetimi";
import { ExcelIceAktarModal } from "@/components/crm/ExcelIceAktarModal";
import { MusteriPanel } from "@/components/crm/MusteriPanel";
import { Rehber } from "@/components/crm/Rehber";
import { Vekaletler } from "@/components/crm/Vekaletler";
import { bugun, fmtTarih, type CrmDepartman, type CrmMusteriListe, type CrmStats } from "@/components/crm/tipler";

type BekleyenTakip = {
  id: string;
  musteriId: string;
  musteriAd: string;
  konu: string;
  takipTarihi: string | null;
};

type Vekalet = { musteriId: string; vekaletBitis: string | null };

const SEKMELER = [
  { id: "musteriler", etiket: "Müşteriler", Icon: Users },
  { id: "rehber", etiket: "Rehber", Icon: BookUser },
  { id: "vekaletler", etiket: "Vekaletler", Icon: FileSignature },
  { id: "departmanlar", etiket: "Departmanlar", Icon: Layers },
] as const;

type Sekme = (typeof SEKMELER)[number]["id"];

export default function CRM() {
  const [sekme, setSekme] = useState<Sekme>("musteriler");
  const [seciliMusteriId, setSeciliMusteriId] = useState<string | null>(null);
  const [excelAcik, setExcelAcik] = useState(false);

  const { data: musteriler = [] } = useQuery<CrmMusteriListe[]>({ queryKey: ["/api/crm/musteriler"] });
  const { data: departmanlar = [] } = useQuery<CrmDepartman[]>({ queryKey: ["/api/crm/departmanlar"] });
  const { data: stats } = useQuery<CrmStats>({ queryKey: ["/api/crm/stats"] });
  const { data: takipler = [] } = useQuery<BekleyenTakip[]>({ queryKey: ["/api/crm/takipler"] });
  const { data: vekaletler = [] } = useQuery<Vekalet[]>({ queryKey: ["/api/crm/vekaletler"] });

  // Süresi dolmuş vekalet sayısı — KPI ve uyarı şeridi için.
  const BUGUN = bugun();
  const vekaletDolmus = vekaletler.filter(
    (v) => v.vekaletBitis && !v.vekaletBitis.startsWith("3000") && v.vekaletBitis < BUGUN,
  ).length;

  // Rehberden "Firmayı aç" tıklanınca müşteri sekmesine geçilir.
  const musteriAc = (id: string) => {
    setSeciliMusteriId(id);
    setSekme("musteriler");
  };

  const kpis = [
    {
      etiket: "Müşteri",
      deger: String(stats?.musteriSayisi ?? musteriler.length),
      alt: "muhasebe cari listesi",
      renk: "#0ea5e9",
      degerRenk: "#0f172a",
    },
    {
      etiket: "İletişim Kişisi",
      deger: String(stats?.kisiSayisi ?? 0),
      alt: "aktif kayıt",
      renk: "#16a34a",
      degerRenk: "#0f172a",
    },
    {
      etiket: "Kartı Dolu Firma",
      deger: `${stats?.kartliMusteriSayisi ?? 0}`,
      alt: `${stats?.musteriSayisi ?? 0} müşteri içinde`,
      renk: "#7c3aed",
      degerRenk: "#0f172a",
    },
    {
      etiket: "Bekleyen Takip",
      deger: String(stats?.bekleyenTakip ?? 0),
      alt: "kapatılmamış görüşme",
      renk: "#f59e0b",
      degerRenk: (stats?.bekleyenTakip ?? 0) > 0 ? "#b45309" : "#0f172a",
    },
    {
      etiket: "Süresi Dolmuş Vekalet",
      deger: String(vekaletDolmus),
      alt: `${vekaletler.length} firmada vekalet kaydı`,
      renk: "#dc2626",
      degerRenk: vekaletDolmus > 0 ? "#dc2626" : "#0f172a",
    },
  ];

  return (
    <div className="min-h-full bg-slate-50 dark:bg-background">
      <div className="px-6 pb-12 lg:px-8">
        {/* ===== STICKY BAŞLIK + SEKMELER ===== */}
        <div className="sticky top-0 z-20 border-b border-border/70 bg-slate-50/90 pt-5 backdrop-blur dark:bg-background/90">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                <Contact className="h-[22px] w-[22px]" strokeWidth={1.8} />
              </div>
              <div>
                <h1 className="text-[21px] font-extrabold tracking-tight">Müşteri CRM</h1>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  Firma bilgileri, departman bazlı muhataplar ve görüşme geçmişi
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="h-[38px] gap-1.5"
              onClick={() => setExcelAcik(true)}
            >
              <Upload className="h-4 w-4" /> Excel&apos;den Güncelle
            </Button>
          </div>

          {/* Sekme barı — aktif sekme inset alt çizgi */}
          <div className="mt-3.5 flex gap-1 overflow-x-auto">
            {SEKMELER.map((s) => {
              const aktif = sekme === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSekme(s.id)}
                  className={cn(
                    "inline-flex items-center gap-2 whitespace-nowrap rounded-t-lg px-3.5 py-2.5 text-[13.5px] transition-colors",
                    aktif
                      ? "font-bold text-foreground shadow-[inset_0_-2px_0_#0ea5e9]"
                      : "font-semibold text-muted-foreground hover:text-foreground",
                  )}
                >
                  <s.Icon className="h-4 w-4" />
                  {s.etiket}
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== KPI ŞERİDİ ===== */}
        <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.etiket} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
              <span className="absolute bottom-0 left-0 top-0 w-1" style={{ background: k.renk }} />
              <div className="pl-2 text-[10.5px] font-bold uppercase leading-tight tracking-wide text-muted-foreground">
                {k.etiket}
              </div>
              <div className="mt-2 pl-2 text-[22px] font-extrabold tracking-tight tabular-nums" style={{ color: k.degerRenk }}>
                {k.deger}
              </div>
              <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.alt}</div>
            </div>
          ))}
        </div>

        {/* ===== BEKLEYEN TAKİPLER ===== */}
        {takipler.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-[14px] border border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20">
            <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-2.5 dark:border-amber-900/50">
              <CalendarClock className="h-4 w-4 text-amber-600 dark:text-amber-500" />
              <h3 className="text-[12.5px] font-extrabold uppercase tracking-wide text-amber-800 dark:text-amber-500">
                Bekleyen Takipler ({takipler.length})
              </h3>
            </div>
            <div className="divide-y divide-amber-200/70 dark:divide-amber-900/40">
              {takipler.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  onClick={() => musteriAc(t.musteriId)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-amber-100/60 dark:hover:bg-amber-950/40"
                >
                  <span className="w-[86px] shrink-0 text-[12.5px] font-bold tabular-nums text-amber-800 dark:text-amber-500">
                    {fmtTarih(t.takipTarihi)}
                  </span>
                  <span className="text-[13px] font-semibold">{t.musteriAd}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">{t.konu}</span>
                </button>
              ))}
              {takipler.length > 6 && (
                <p className="px-4 py-2 text-[11.5px] text-muted-foreground">
                  ve {takipler.length - 6} takip daha…
                </p>
              )}
            </div>
          </div>
        )}

        {/* ===== İÇERİK ===== */}
        <div className="mt-4">
          {sekme === "musteriler" && (
            <MusteriPanel
              musteriler={musteriler}
              departmanlar={departmanlar}
              seciliId={seciliMusteriId}
              onSecim={setSeciliMusteriId}
            />
          )}
          {sekme === "rehber" && <Rehber onMusteriAc={musteriAc} />}
          {sekme === "vekaletler" && <Vekaletler onMusteriAc={musteriAc} />}
          {sekme === "departmanlar" && <DepartmanYonetimi departmanlar={departmanlar} />}
        </div>
      </div>

      <ExcelIceAktarModal open={excelAcik} onClose={() => setExcelAcik(false)} />
    </div>
  );
}
