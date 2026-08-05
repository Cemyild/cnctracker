import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, LayoutDashboard } from "lucide-react";
import type { PortalMe } from "./PortalApp";
import { useSanalTarih, tarihParcala } from "./sanalTarih";

// Portalın açılış ekranı. Her rol kendi panelini görür; içerikler sonradan
// teker teker doldurulacak (şimdilik yalnız karşılama + rol özeti).
//
// Not: PortalApp'tan yalnızca TİP alınır (runtime import dairesel olurdu) —
// rol seçimi PortalSidebar'daki kalıpla aynı şekilde burada yapılır.
type Varyant = "temsilci" | "muhasebe" | "operasyon";

function varyantSec(rol: PortalMe["rol"]): Varyant {
  if (rol === "temsilci") return "temsilci";
  if (rol === "operasyon") return "operasyon";
  return "muhasebe"; // muhasebe + admin aynı paneli görür
}

const VARYANT_METNI: Record<Varyant, { rol: string; aciklama: string }> = {
  temsilci: {
    rol: "Müşteri Temsilcisi",
    aciklama: "Ödeme taleplerini buradan oluşturur, açtığın taleplerin durumunu takip edersin.",
  },
  muhasebe: {
    rol: "Muhasebe",
    aciklama: "Gelen talepler, depo ödemeleri, doğrudan ödemeler ve şube masrafları buradan yönetilir.",
  },
  operasyon: {
    rol: "Şube Operasyon",
    aciklama: "Şube kasanı, günlük masraflarını ve gün kapanışlarını buradan yürütürsün.",
  },
};

// Selamlama gerçek saate göre — sanal tarih aracı yalnız GÜNÜ değiştirir, saati değil.
function selamlama(): string {
  const s = new Date().getHours();
  if (s < 6) return "İyi geceler";
  if (s < 12) return "Günaydın";
  if (s < 18) return "İyi günler";
  return "İyi akşamlar";
}

export default function PanelSayfasi({ me }: { me: PortalMe }) {
  const { bugun, sanal } = useSanalTarih();
  const { gun, haftaGun } = tarihParcala(bugun);
  const varyant = varyantSec(me.rol);
  const metin = VARYANT_METNI[varyant];

  return (
    <div className="space-y-6" data-testid={`panel-${varyant}`}>
      <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-transparent dark:border-indigo-950/60 dark:from-indigo-950/30">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{selamlama()},</p>
              <h2 className="mt-1 truncate text-2xl font-semibold text-foreground" data-testid="text-panel-ad">
                {me.adSoyad}
              </h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">{metin.aciklama}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm">
              <CalendarDays className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <div className="leading-tight">
                <div className="font-medium tabular-nums" data-testid="text-panel-tarih">{gun}</div>
                <div className="text-xs text-muted-foreground">
                  {haftaGun}
                  {sanal && <span className="ml-1 text-amber-600 dark:text-amber-400">· test günü</span>}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Role özel bölümler buraya gelecek (özet kartları, kısayollar, bekleyen işler). */}
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <LayoutDashboard className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">{metin.rol} paneli</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Bu ekranın özet kartları hazırlanıyor. Şimdilik soldaki menüden çalışmak istediğin
            bölümü seçebilirsin.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
