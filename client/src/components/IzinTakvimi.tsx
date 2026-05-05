import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { GunDetayModal } from "./GunDetayModal";

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

interface IzinTakvimiProps {
  onYeniIzin: (tcNo: string | null, tarih: string) => void;
  onDuzenle: (izin: any) => void;
}

export function IzinTakvimi({ onYeniIzin, onDuzenle }: IzinTakvimiProps) {
  const today = new Date();
  const [yil, setYil] = useState(today.getFullYear());
  const [ay, setAy] = useState(today.getMonth() + 1); // 1-12
  const [detayTarih, setDetayTarih] = useState<string | null>(null);

  const { data: izinler, isLoading } = useQuery<any[]>({
    queryKey: [`/api/izinler/takvim?yil=${yil}&ay=${ay}`],
  });
  const { data: tatiller } = useQuery<any[]>({
    queryKey: [`/api/resmi-tatiller?yil=${yil}`],
  });
  const { data: calisanlar } = useQuery<any[]>({ queryKey: ["/api/calisanlar"] });
  const adMap = useMemo(() => {
    const m = new Map<string, string>();
    calisanlar?.forEach((c) => m.set(c.tcNo, c.adSoyad));
    return m;
  }, [calisanlar]);
  const tatilMap = useMemo(() => {
    const m = new Map<string, string>();
    (tatiller ?? []).forEach((t) => m.set(t.tarih, t.ad));
    return m;
  }, [tatiller]);

  // Takvim grid hesabı: hafta Pazartesi başlar
  const grid = useMemo(() => {
    const ilkGun = new Date(Date.UTC(yil, ay - 1, 1));
    const sonGun = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
    const baslangicOffset = (ilkGun.getUTCDay() + 6) % 7; // Pzt=0..Paz=6
    const cells: { tarih: string | null; gun: number | null }[] = [];
    for (let i = 0; i < baslangicOffset; i++) cells.push({ tarih: null, gun: null });
    for (let g = 1; g <= sonGun; g++) {
      const iso = `${yil}-${String(ay).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
      cells.push({ tarih: iso, gun: g });
    }
    while (cells.length % 7 !== 0) cells.push({ tarih: null, gun: null });
    return cells;
  }, [yil, ay]);

  const navigateMonth = (delta: number) => {
    let yeniAy = ay + delta;
    let yeniYil = yil;
    if (yeniAy < 1) { yeniAy = 12; yeniYil--; }
    if (yeniAy > 12) { yeniAy = 1; yeniYil++; }
    setAy(yeniAy);
    setYil(yeniYil);
  };

  const izinHucre = (tarih: string) => (izinler ?? []).filter((iz) => tarih >= iz.baslangicTarihi && tarih <= iz.bitisTarihi);

  const ozet = useMemo(() => {
    const setKisi = new Set<string>();
    let toplamGun = 0;
    (izinler ?? []).forEach((iz) => {
      setKisi.add(iz.tcNo);
      const ayBas = `${yil}-${String(ay).padStart(2, "0")}-01`;
      const sonGun = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
      const ayBit = `${yil}-${String(ay).padStart(2, "0")}-${String(sonGun).padStart(2, "0")}`;
      const bas = iz.baslangicTarihi > ayBas ? iz.baslangicTarihi : ayBas;
      const bit = iz.bitisTarihi < ayBit ? iz.bitisTarihi : ayBit;
      const startMs = Date.UTC(+bas.slice(0, 4), +bas.slice(5, 7) - 1, +bas.slice(8, 10));
      const endMs = Date.UTC(+bit.slice(0, 4), +bit.slice(5, 7) - 1, +bit.slice(8, 10));
      toplamGun += Math.round((endMs - startMs) / 86400000) + 1;
    });
    return { kisi: setKisi.size, gun: toplamGun };
  }, [izinler, yil, ay]);

  const todayIso = today.toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => navigateMonth(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <div className="text-xl font-bold tabular-nums px-3">{AYLAR[ay - 1]} {yil}</div>
          <Button size="icon" variant="outline" onClick={() => navigateMonth(1)}><ChevronRight className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => { setYil(today.getFullYear()); setAy(today.getMonth() + 1); }}>Bugün</Button>
        </div>
        <div className="text-sm text-muted-foreground">
          Bu ay <strong className="text-foreground">{ozet.kisi}</strong> kişi izinli, <strong className="text-foreground">{ozet.gun}</strong> toplam izin günü
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
      ) : (
        <Card>
          <div className="grid grid-cols-7 border-b bg-muted/40">
            {GUN_KISA.map((g) => <div key={g} className="text-center text-xs font-semibold py-2">{g}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((cell, i) => {
              if (!cell.tarih) return <div key={i} className="min-h-[100px] border-r border-b bg-muted/10" />;
              const dow = new Date(Date.UTC(yil, ay - 1, cell.gun!)).getUTCDay();
              const isWeekend = dow === 0 || dow === 6;
              const tatilAd = tatilMap.get(cell.tarih);
              const cellIzinler = izinHucre(cell.tarih);
              const isToday = cell.tarih === todayIso;
              return (
                <div
                  key={i}
                  className={`min-h-[100px] border-r border-b p-1.5 cursor-pointer hover:bg-accent/40 transition-colors ${isWeekend ? "bg-muted/30" : ""} ${tatilAd ? "bg-gray-200/50 dark:bg-gray-800/40" : ""} ${isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                  onClick={() => setDetayTarih(cell.tarih!)}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className={`text-sm font-semibold ${tatilAd ? "text-red-700 dark:text-red-400" : ""}`}>{cell.gun}</div>
                  </div>
                  {tatilAd && <div className="text-[10px] text-red-700 dark:text-red-400 leading-tight truncate" title={tatilAd}>{tatilAd}</div>}
                  <div className="space-y-0.5 mt-1">
                    {cellIzinler.slice(0, 2).map((iz) => (
                      <div key={iz.id} className={`text-[10px] truncate rounded px-1 ${iz.tur === "YILLIK" ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200" : "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200"}`}>
                        {iz.tur === "YILLIK" ? "🔵" : "🟠"} {(adMap.get(iz.tcNo) ?? iz.tcNo).split(" ")[0]}
                      </div>
                    ))}
                    {cellIzinler.length > 2 && (
                      <div className="text-[10px] text-muted-foreground font-semibold">+{cellIzinler.length - 2} kişi</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <GunDetayModal
        open={!!detayTarih}
        onClose={() => setDetayTarih(null)}
        tarih={detayTarih}
        izinler={izinler ?? []}
        adMap={adMap}
        onEkle={(tarih) => onYeniIzin(null, tarih)}
        onDuzenle={onDuzenle}
      />
    </div>
  );
}
