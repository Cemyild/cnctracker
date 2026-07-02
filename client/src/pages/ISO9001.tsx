import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Award, ClipboardList, AlertTriangle, Search, FileText, Target, GraduationCap, Truck, BarChart3, Wrench } from "lucide-react";

type Iso9001Stats = {
  belgeCount: number;
  hedefCount: number;
  hedefYesilCount: number;
  egitimCount: number;
  toplamKatilimciCount: number;
  tedarikciCount: number;
  buYilDegerlendirmeCount: number;
  sonToplantıTarihi: string | null;
  acikAksiyon: number;
  surveyCountMusteri: number;
  surveyCountCalisanlar: number;
  dufAcik: number;
  dufGecikmiş: number;
  dufKapali: number;
  tetkikSonTarih: string | null;
  tetkikPlanlanan: number;
  bakimVarlikCount: number;
};

// Modül kartı — wouter Link ile alt rotaya gider (accent-bar + hover lift)
function ActiveCard({ href, icon: Icon, title, accent, children }: { href: string; icon: React.ElementType; title: string; accent: string; children: React.ReactNode }) {
  return (
    <Link href={href}>
      <div
        className="group h-full cursor-pointer overflow-hidden rounded-[14px] border bg-card p-5 transition-all hover:-translate-y-[3px] hover:shadow-[0_12px_26px_rgba(15,23,42,0.08)]"
        style={{ borderLeft: `4px solid ${accent}` }}
      >
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px]" style={{ background: `${accent}14`, color: accent }}>
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="text-[15px] font-bold text-slate-800 dark:text-foreground">{title}</h3>
        </div>
        <div className="space-y-1 text-[12.5px] text-muted-foreground">{children}</div>
      </div>
    </Link>
  );
}

export default function ISO9001() {
  const { data: stats } = useQuery<Iso9001Stats>({
    queryKey: ["/api/iso9001/stats"],
    queryFn: () => fetch("/api/iso9001/stats").then(r => r.json()),
  });

  // 4 durum KPI'sı — gerçek stats'tan türetilir (uydurma alan yok)
  const kpis = [
    {
      label: "Uygunluk Oranı",
      value: stats && stats.hedefCount ? `%${Math.round((stats.hedefYesilCount / stats.hedefCount) * 100)}` : "—",
      sub: stats ? `${stats.hedefYesilCount ?? 0}/${stats.hedefCount ?? 0} yeşil hedef` : "kalite hedefleri",
      color: "#16a34a",
    },
    {
      label: "Açık DÖF",
      value: String(stats?.dufAcik ?? "—"),
      sub: (stats?.dufGecikmiş ?? 0) > 0 ? `${stats?.dufGecikmiş} gecikmiş` : "düzeltici faaliyet",
      color: "#dc2626",
    },
    {
      label: "Planlanan Tetkik",
      value: String(stats?.tetkikPlanlanan ?? "—"),
      sub: stats?.tetkikSonTarih ? `son: ${stats.tetkikSonTarih}` : "iç tetkik",
      color: "#d97706",
    },
    {
      label: "Belge Arşivi",
      value: String(stats?.belgeCount ?? "—"),
      sub: "toplam belge",
      color: "#0ea5e9",
    },
  ];

  return (
    <div className="min-h-full bg-slate-50 dark:bg-background">
      <div className="px-6 pb-12 lg:px-8">
        {/* ===== STICKY HEADER ===== */}
        <div className="sticky top-0 z-20 border-b border-border/70 bg-slate-50/90 pt-5 pb-3.5 backdrop-blur dark:bg-background/90">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
              <Award className="h-[22px] w-[22px]" strokeWidth={1.9} />
            </div>
            <div>
              <h1 className="text-[21px] font-extrabold tracking-tight">ISO 9001:2015 Kalite Yönetim Sistemi</h1>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">Kalite yönetimi modüllerine hızlı erişim ve durum özeti</p>
            </div>
          </div>
        </div>

        {/* ===== 4 Durum KPI (accent-bar) ===== */}
        <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
              <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
              <div className="pl-2 text-[10.5px] font-semibold uppercase tracking-wide leading-tight text-muted-foreground">{k.label}</div>
              <div className="mt-2 pl-2 text-[21px] font-extrabold tracking-tight tabular-nums">{k.value}</div>
              <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ===== 9 Modül Kartı ===== */}
        <div className="mt-7 mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px] font-extrabold">Modüller</h2>
          <span className="text-xs text-muted-foreground">9 modül · karta tıklayarak aç</span>
        </div>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <ActiveCard href="/iso9001/anketler" icon={ClipboardList} title="Anketler" accent="#0ea5e9">
            <p>Müşteri: <span className="font-semibold text-foreground tabular-nums">{stats?.surveyCountMusteri ?? "—"}</span></p>
            <p>Çalışan: <span className="font-semibold text-foreground tabular-nums">{stats?.surveyCountCalisanlar ?? "—"}</span></p>
          </ActiveCard>

          <ActiveCard href="/iso9001/duf" icon={AlertTriangle} title="Düzeltici Faaliyet" accent="#dc2626">
            <p>Açık: <span className="font-semibold text-foreground tabular-nums">{stats?.dufAcik ?? "—"}</span></p>
            {(stats?.dufGecikmiş ?? 0) > 0 && (
              <p className="font-semibold text-orange-500">Gecikmiş: {stats?.dufGecikmiş}</p>
            )}
            <p>Kapalı: <span className="font-semibold text-foreground tabular-nums">{stats?.dufKapali ?? "—"}</span></p>
          </ActiveCard>

          <ActiveCard href="/iso9001/tetkik" icon={Search} title="İç Tetkik" accent="#d97706">
            <p>Son tetkik: <span className="font-semibold text-foreground">{stats?.tetkikSonTarih ?? "—"}</span></p>
            <p>Planlanan: <span className="font-semibold text-foreground tabular-nums">{stats?.tetkikPlanlanan ?? "—"}</span></p>
          </ActiveCard>

          <ActiveCard href="/iso9001/belgeler" icon={FileText} title="Belge Arşivi" accent="#0284c7">
            <p>Toplam belge: <span className="font-semibold text-foreground tabular-nums">{stats?.belgeCount ?? "—"}</span></p>
          </ActiveCard>

          <ActiveCard href="/iso9001/hedefler" icon={Target} title="Kalite Hedefleri" accent="#16a34a">
            <p>Hedef: <span className="font-semibold text-foreground tabular-nums">{stats?.hedefCount ?? "—"}</span></p>
            <p>Yeşil: <span className="font-semibold text-green-600 tabular-nums">{stats?.hedefYesilCount ?? "—"}</span></p>
          </ActiveCard>

          <ActiveCard href="/iso9001/egitimler" icon={GraduationCap} title="Eğitim Kayıtları" accent="#7c3aed">
            <p>Eğitim: <span className="font-semibold text-foreground tabular-nums">{stats?.egitimCount ?? "—"}</span></p>
            <p>Katılımcı: <span className="font-semibold text-foreground tabular-nums">{stats?.toplamKatilimciCount ?? "—"}</span></p>
          </ActiveCard>

          <ActiveCard href="/iso9001/tedarikci" icon={Truck} title="Tedarikçi Değerlendirme" accent="#0f766e">
            <p>Tedarikçi: <span className="font-semibold text-foreground tabular-nums">{stats?.tedarikciCount ?? "—"}</span></p>
            <p>Bu Yıl: <span className="font-semibold text-foreground tabular-nums">{stats?.buYilDegerlendirmeCount ?? "—"}</span> değerlendirme</p>
          </ActiveCard>

          <ActiveCard href="/iso9001/yonetim" icon={BarChart3} title="Yönetim Gözden Geçirme" accent="#0ea5e9">
            <p>Son Toplantı: <span className="font-semibold text-foreground">{stats?.sonToplantıTarihi ?? "—"}</span></p>
            <p>Açık Aksiyon: <span className="font-semibold text-foreground tabular-nums">{stats?.acikAksiyon ?? "—"}</span></p>
          </ActiveCard>

          <ActiveCard href="/iso9001/bakim-onarim" icon={Wrench} title="Bakım & Onarım" accent="#d97706">
            <p>Toplam Varlık: <span className="font-semibold text-foreground tabular-nums">{stats?.bakimVarlikCount ?? "—"}</span></p>
          </ActiveCard>
        </div>
      </div>
    </div>
  );
}
