import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LayoutDashboard, Users, TrendingUp, Link2, Archive, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { tarihGoster } from "@shared/tahsilatHesaplari";

import { MizanYukleModal } from "@/components/tahsilat/MizanYukleModal";
import { TahsilatOzet } from "@/components/tahsilat/TahsilatOzet";
import { MusteriListesi } from "@/components/tahsilat/MusteriListesi";
import { TahsilatTrend } from "@/components/tahsilat/TahsilatTrend";
import { EslestirmeUI } from "@/components/tahsilat/EslestirmeUI";
import { MizanArsivi } from "@/components/tahsilat/MizanArsivi";

interface MizanRow {
  id: string;
  mizanTarihi: string;
  kayitSayisi: number;
}

const TABS = [
  { id: "ozet", label: "Özet", Icon: LayoutDashboard },
  { id: "musteriler", label: "Müşteriler", Icon: Users },
  { id: "trend", label: "Trend", Icon: TrendingUp },
  { id: "eslestirme", label: "Eşleştirme", Icon: Link2 },
  { id: "arsiv", label: "Arşiv", Icon: Archive },
];

export default function Tahsilat() {
  const [yukleOpen, setYukleOpen] = useState(false);
  const [selectedMizanId, setSelectedMizanId] = useState<string | undefined>();
  const [tab, setTab] = useState("ozet");

  const { data: mizanList } = useQuery<MizanRow[]>({ queryKey: ["/api/tahsilat/mizan"] });
  const aktifMizanId = selectedMizanId || mizanList?.[0]?.id;

  return (
    <div className="min-h-full bg-slate-50 dark:bg-background">
      <div className="px-6 pb-12 lg:px-8">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          {/* ===== STICKY HEADER + TABS ===== */}
          <div className="sticky top-0 z-20 border-b border-border/70 bg-slate-50/90 pt-5 backdrop-blur dark:bg-background/90">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                  <Users className="h-[22px] w-[22px]" strokeWidth={1.8} />
                </div>
                <div>
                  <h1 className="text-[21px] font-extrabold tracking-tight">Müşteri Tahsilat</h1>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">Mizan yükle, risk analizini ve trend takibini gör</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {mizanList && mizanList.length > 0 && (
                  <Select value={aktifMizanId} onValueChange={setSelectedMizanId}>
                    <SelectTrigger className="h-[38px] w-[220px]"><SelectValue placeholder="Mizan seç" /></SelectTrigger>
                    <SelectContent>
                      {mizanList.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{tarihGoster(m.mizanTarihi)} ({m.kayitSayisi} müşteri)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button onClick={() => setYukleOpen(true)} className="h-[38px] bg-slate-900 text-white hover:bg-slate-800">
                  <Upload className="w-4 h-4 mr-2" /> Mizan Yükle
                </Button>
              </div>
            </div>
            {/* Tab barı — aktif tab inset alt çizgi, her tab lucide ikonlu */}
            <div className="mt-3.5 flex gap-1 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "inline-flex items-center gap-2 whitespace-nowrap rounded-t-lg px-3.5 py-2.5 text-[13.5px] transition-colors",
                    tab === t.id
                      ? "font-bold text-foreground shadow-[inset_0_-2px_0_#0ea5e9]"
                      : "font-semibold text-muted-foreground hover:text-foreground"
                  )}
                >
                  <t.Icon className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <TabsContent value="ozet" className="mt-5"><TahsilatOzet mizanId={aktifMizanId} /></TabsContent>
          <TabsContent value="musteriler" className="mt-5"><MusteriListesi mizanId={aktifMizanId} /></TabsContent>
          <TabsContent value="trend" className="mt-5"><TahsilatTrend /></TabsContent>
          <TabsContent value="eslestirme" className="mt-5"><EslestirmeUI /></TabsContent>
          <TabsContent value="arsiv" className="mt-5"><MizanArsivi /></TabsContent>
        </Tabs>

        <MizanYukleModal open={yukleOpen} onClose={() => setYukleOpen(false)} />
      </div>
    </div>
  );
}
