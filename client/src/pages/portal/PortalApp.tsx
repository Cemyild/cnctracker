import { useEffect } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import PortalLogin from "./PortalLogin";
import PortalSidebar from "./PortalSidebar";
import YeniTalepSayfasi from "./YeniTalepSayfasi";
import TaleplerimSayfasi from "./TaleplerimSayfasi";
import GelenTaleplerSayfasi from "./GelenTaleplerSayfasi";
import DepoOdemeleriSayfasi from "./DepoOdemeleriSayfasi";
import DogrudanOdemeSayfasi from "./DogrudanOdemeSayfasi";
import FirmalarSayfasi from "./FirmalarSayfasi";
import OperasyonKasaSayfasi from "./OperasyonKasaSayfasi";
import OperasyonKapanislarSayfasi from "./OperasyonKapanislarSayfasi";
import OperasyonTakipSayfasi from "./OperasyonTakipSayfasi";
import { type TalepDetay } from "./portalUtils";
import {
  useTalepBildirimleri, bildirimIzniIste, type SayfaAnahtari,
} from "./useTalepBildirimleri";

export type PortalMe = {
  id: string;
  adSoyad: string;
  rol: "temsilci" | "muhasebe" | "operasyon";
  avAdi: string | null;
};

const SAYFA_BASLIKLARI: Record<string, string> = {
  "/portal/yeni-talep": "Yeni Talep",
  "/portal/taleplerim": "Taleplerim",
  "/portal/gelen-talepler": "Gelen Talepler",
  "/portal/depo": "Depo Ödemeleri",
  "/portal/dogrudan-odeme": "Doğrudan Ödeme",
  "/portal/firmalar": "Ödeme Firmaları",
  "/portal/kasam": "Kasam",
  "/portal/kapanislarim": "Kapanışlarım",
  "/portal/sube-masraf": "Şube Masraf",
};

const ROTA_SAYFASI: Record<string, SayfaAnahtari> = {
  "/portal/taleplerim": "taleplerim",
  "/portal/gelen-talepler": "gelenTalepler",
  "/portal/depo": "depo",
};

function PortalIcerik({ me }: { me: PortalMe }) {
  const [location] = useLocation();

  // Tek itici sorgu: 10 sn'de bir tazeler; sayfalar aynı queryKey cache'ini okur.
  const { data: talepler = [] } = useQuery<TalepDetay[]>({
    queryKey: ["/api/portal/talepler"],
    refetchInterval: 10000,
    // Sekme arka plandayken de tazele — bildirimler gizli sekmede tetiklenir
    refetchIntervalInBackground: true,
  });

  const aktifSayfa = ROTA_SAYFASI[location] ?? null;
  const rozetler = useTalepBildirimleri(me, talepler, aktifSayfa);

  useEffect(() => {
    bildirimIzniIste(); // girişten sonra bir kez sorar; reddedilirse sessiz
  }, []);

  const cikisYap = async () => {
    await apiRequest("POST", "/api/portal/logout").catch(() => {});
    queryClient.setQueryData(["/api/portal/me"], null);
  };

  const varsayilanRota = me.rol === "muhasebe" ? "/portal/gelen-talepler" : me.rol === "operasyon" ? "/portal/kasam" : "/portal/yeni-talep";
  const baslik = SAYFA_BASLIKLARI[location] ?? "Ödemeler Portalı";

  return (
    <div className="flex h-screen w-full bg-background">
      <PortalSidebar me={me} rozetler={rozetler} cikisYap={cikisYap} />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center gap-4 h-14 px-4 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
          <SidebarTrigger data-testid="button-portal-sidebar-toggle" />
          <h1 className="text-lg font-semibold" data-testid="text-portal-sayfa-baslik">{baslik}</h1>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <div className="w-full">
            <Switch>
              {me.rol === "temsilci" && (
                <Route path="/portal/yeni-talep">
                  <YeniTalepSayfasi me={me} />
                </Route>
              )}
              {me.rol === "temsilci" && (
                <Route path="/portal/taleplerim" component={TaleplerimSayfasi} />
              )}
              {me.rol === "muhasebe" && (
                <Route path="/portal/gelen-talepler" component={GelenTaleplerSayfasi} />
              )}
              {me.rol === "muhasebe" && (
                <Route path="/portal/depo" component={DepoOdemeleriSayfasi} />
              )}
              {me.rol === "muhasebe" && (
                <Route path="/portal/dogrudan-odeme" component={DogrudanOdemeSayfasi} />
              )}
              {me.rol === "muhasebe" && (
                <Route path="/portal/firmalar" component={FirmalarSayfasi} />
              )}
              {me.rol === "muhasebe" && (
                <Route path="/portal/sube-masraf" component={OperasyonTakipSayfasi} />
              )}
              {me.rol === "operasyon" && (
                <Route path="/portal/kasam" component={OperasyonKasaSayfasi} />
              )}
              {me.rol === "operasyon" && (
                <Route path="/portal/kapanislarim" component={OperasyonKapanislarSayfasi} />
              )}
              <Route>
                <Redirect to={varsayilanRota} />
              </Route>
            </Switch>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function PortalApp() {
  const { data: me, isLoading } = useQuery<PortalMe | null>({
    queryKey: ["/api/portal/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Yükleniyor…
      </div>
    );
  }
  if (!me) return <PortalLogin />;

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <PortalIcerik me={me} />
    </SidebarProvider>
  );
}
