import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Award, ClipboardList, AlertTriangle, Search, FileText, Target, GraduationCap, Truck, BarChart3 } from "lucide-react";

type Iso9001Stats = {
  belgeCount: number;
  surveyCountMusteri: number;
  surveyCountCalisanlar: number;
  dufAcik: number;
  dufGecikmiş: number;
  dufKapali: number;
  tetkikSonTarih: string | null;
  tetkikPlanlanan: number;
};

function ActiveCard({ href, icon: Icon, title, children }: { href: string; icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <Link href={href}>
      <div className="rounded-xl border bg-card p-6 hover:border-primary hover:shadow-md transition-all cursor-pointer h-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <h3 className="font-semibold text-base">{title}</h3>
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">{children}</div>
      </div>
    </Link>
  );
}

function ComingSoonCard({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="rounded-xl border bg-muted/40 p-6 opacity-60 h-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-muted">
          <Icon className="w-5 h-5 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-base text-muted-foreground">{title}</h3>
      </div>
      <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">Yakında</span>
    </div>
  );
}

export default function ISO9001() {
  const { data: stats } = useQuery<Iso9001Stats>({
    queryKey: ["/api/iso9001/stats"],
    queryFn: () => fetch("/api/iso9001/stats").then(r => r.json()),
  });

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Award className="w-7 h-7 text-primary" />
        <h2 className="text-2xl font-semibold">ISO 9001:2015 Kalite Yönetim Sistemi</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ActiveCard href="/iso9001/anketler" icon={ClipboardList} title="Anketler">
          <p>Müşteri: <span className="font-medium text-foreground">{stats?.surveyCountMusteri ?? "—"}</span></p>
          <p>Çalışan: <span className="font-medium text-foreground">{stats?.surveyCountCalisanlar ?? "—"}</span></p>
        </ActiveCard>

        <ActiveCard href="/iso9001/duf" icon={AlertTriangle} title="Düzeltici Faaliyet">
          <p>Açık: <span className="font-medium text-foreground">{stats?.dufAcik ?? "—"}</span></p>
          {(stats?.dufGecikmiş ?? 0) > 0 && (
            <p className="text-orange-500 font-medium">Gecikmiş: {stats?.dufGecikmiş}</p>
          )}
          <p>Kapalı: <span className="font-medium text-foreground">{stats?.dufKapali ?? "—"}</span></p>
        </ActiveCard>

        <ActiveCard href="/iso9001/tetkik" icon={Search} title="İç Tetkik">
          <p>Son tetkik: <span className="font-medium text-foreground">{stats?.tetkikSonTarih ?? "—"}</span></p>
          <p>Planlanan: <span className="font-medium text-foreground">{stats?.tetkikPlanlanan ?? "—"}</span></p>
        </ActiveCard>

        <ActiveCard href="/iso9001/belgeler" icon={FileText} title="Belge Arşivi">
          <p>Toplam belge: <span className="font-medium text-foreground">{stats?.belgeCount ?? "—"}</span></p>
        </ActiveCard>
        <ComingSoonCard icon={Target} title="Kalite Hedefleri" />
        <ComingSoonCard icon={GraduationCap} title="Eğitim Kayıtları" />
        <ComingSoonCard icon={Truck} title="Tedarikçi Değerlendirme" />
        <ComingSoonCard icon={BarChart3} title="Yönetim Gözden Geçirme" />
      </div>
    </div>
  );
}
