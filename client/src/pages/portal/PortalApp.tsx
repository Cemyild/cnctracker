import { useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import PortalLogin from "./PortalLogin";
import TemsilciPanel from "./TemsilciPanel";
import MuhasebePanel from "./MuhasebePanel";

export type PortalMe = {
  id: string;
  adSoyad: string;
  rol: "temsilci" | "muhasebe";
  avAdi: string | null;
};

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

  const cikisYap = async () => {
    await apiRequest("POST", "/api/portal/logout");
    queryClient.setQueryData(["/api/portal/me"], null);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between h-14 px-4 border-b sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="CNC" className="h-8 w-auto object-contain" />
          <span className="font-semibold">Ödemeler Portalı</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {me.adSoyad} — {me.rol === "muhasebe" ? "Muhasebe" : "Müşteri Temsilcisi"}
          </span>
          <Button variant="ghost" size="sm" onClick={cikisYap} data-testid="button-portal-cikis">
            <LogOut className="w-4 h-4 mr-1" />
            Çıkış
          </Button>
        </div>
      </header>
      <main className="p-4 max-w-6xl mx-auto">
        {me.rol === "muhasebe" ? <MuhasebePanel /> : <TemsilciPanel me={me} />}
      </main>
    </div>
  );
}
