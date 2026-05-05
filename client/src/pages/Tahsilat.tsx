import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LayoutDashboard, Users, TrendingUp, Link2, Archive, Upload } from "lucide-react";

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

export default function Tahsilat() {
  const [yukleOpen, setYukleOpen] = useState(false);
  const [selectedMizanId, setSelectedMizanId] = useState<string | undefined>();

  const { data: mizanList } = useQuery<MizanRow[]>({ queryKey: ["/api/tahsilat/mizan"] });
  const aktifMizanId = selectedMizanId || mizanList?.[0]?.id;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Müşteri Tahsilat</h1>
          <p className="text-muted-foreground">Mizan yükle, risk analizini ve trend takibini gör.</p>
        </div>
        <div className="flex items-center gap-2">
          {mizanList && mizanList.length > 0 && (
            <Select value={aktifMizanId} onValueChange={setSelectedMizanId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Mizan seç" />
              </SelectTrigger>
              <SelectContent>
                {mizanList.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.mizanTarihi} ({m.kayitSayisi} müşteri)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setYukleOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Mizan Yükle
          </Button>
        </div>
      </div>

      <Tabs defaultValue="ozet" className="w-full">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="ozet" className="gap-2"><LayoutDashboard className="w-4 h-4" /> Özet</TabsTrigger>
          <TabsTrigger value="musteriler" className="gap-2"><Users className="w-4 h-4" /> Müşteriler</TabsTrigger>
          <TabsTrigger value="trend" className="gap-2"><TrendingUp className="w-4 h-4" /> Trend</TabsTrigger>
          <TabsTrigger value="eslestirme" className="gap-2"><Link2 className="w-4 h-4" /> Eşleştirme</TabsTrigger>
          <TabsTrigger value="arsiv" className="gap-2"><Archive className="w-4 h-4" /> Arşiv</TabsTrigger>
        </TabsList>

        <TabsContent value="ozet" className="mt-6"><TahsilatOzet mizanId={aktifMizanId} /></TabsContent>
        <TabsContent value="musteriler" className="mt-6"><MusteriListesi mizanId={aktifMizanId} /></TabsContent>
        <TabsContent value="trend" className="mt-6"><TahsilatTrend /></TabsContent>
        <TabsContent value="eslestirme" className="mt-6"><EslestirmeUI /></TabsContent>
        <TabsContent value="arsiv" className="mt-6"><MizanArsivi /></TabsContent>
      </Tabs>

      <MizanYukleModal open={yukleOpen} onClose={() => setYukleOpen(false)} />
    </div>
  );
}
