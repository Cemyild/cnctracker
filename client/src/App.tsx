import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import Dashboard from "@/pages/Dashboard";
import Gumruk from "@/pages/Gumruk";
import Nakliye from "@/pages/Nakliye";
import Sigorta from "@/pages/Sigorta";
import Raporlar from "@/pages/Raporlar";
import Tools from "@/pages/Tools";
import Calisanlar from "@/pages/Calisanlar";
import Hesaplamalar from "@/pages/Hesaplamalar";
import Tahsilat from "@/pages/Tahsilat";
import { Redirect } from "wouter";
import ISO9001 from "@/pages/ISO9001";
import ISO9001Anketler from "@/pages/ISO9001Anketler";
import ISO9001Belgeler from "@/pages/ISO9001Belgeler";
import ISO9001Duf from "@/pages/ISO9001Duf";
import ISO9001Tetkik from "@/pages/ISO9001Tetkik";
import ISO9001KaliteHedefleri from "@/pages/ISO9001KaliteHedefleri";
import ISO9001Egitimler from "@/pages/ISO9001Egitimler";
import ISO9001TedarikciDegerlendirme from "@/pages/ISO9001TedarikciDegerlendirme";
import ISO9001YonetimGozdenGecirme from "@/pages/ISO9001YonetimGozdenGecirme";
import ISO9001BakimOnarim from "@/pages/ISO9001BakimOnarim";
import PublicEgitimDegerlendirme from "@/pages/PublicEgitimDegerlendirme";
import PublicSurvey from "@/pages/PublicSurvey";
import SurveyAnalysis from "@/pages/SurveyAnalysis";
import PortalApp from "@/pages/portal/PortalApp";
import Odemeler from "@/pages/Odemeler";
import NotFound from "@/pages/not-found";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/gumruk": "Gümrük",
  "/sigorta": "Sigorta",
  "/nakliye": "Nakliye",
  "/raporlar": "Raporlar",
  "/araclar": "Araçlar",
  "/calisanlar": "Çalışanlar",
  "/hesaplamalar": "Hesaplamalar",
  "/tahsilat": "Müşteri Tahsilat",
  "/odemeler": "Ödemeler",
  "/anketler": "Anketler",
  "/iso9001": "ISO9001-2015",
  "/iso9001/anketler": "ISO9001-2015 — Anketler",
  "/iso9001/belgeler": "ISO9001-2015 — Belge Arşivi",
  "/iso9001/hedefler": "ISO9001-2015 — Kalite Hedefleri",
  "/iso9001/egitimler": "ISO9001-2015 — Eğitim Kayıtları",
  "/iso9001/tedarikci": "ISO9001-2015 — Tedarikçi Değerlendirme",
  "/iso9001/yonetim": "ISO9001-2015 — Yönetim Gözden Geçirme",
  "/iso9001/bakim-onarim": "ISO9001-2015 — Bakım & Onarım",
  "/iso9001/duf": "ISO9001-2015 — Düzeltici Faaliyet",
  "/iso9001/tetkik": "ISO9001-2015 — İç Tetkik",
};

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/gumruk" component={Gumruk} />
      <Route path="/sigorta" component={Sigorta} />
      <Route path="/nakliye" component={Nakliye} />
      <Route path="/raporlar" component={Raporlar} />
      <Route path="/araclar" component={Tools} />
      <Route path="/calisanlar" component={Calisanlar} />
      <Route path="/hesaplamalar" component={Hesaplamalar} />
      <Route path="/tahsilat" component={Tahsilat} />
      <Route path="/odemeler" component={Odemeler} />
      <Route path="/anketler">
        <Redirect to="/iso9001/anketler" />
      </Route>
      <Route path="/iso9001" component={ISO9001} />
      <Route path="/iso9001/anketler" component={ISO9001Anketler} />
      <Route path="/iso9001/belgeler" component={ISO9001Belgeler} />
      <Route path="/iso9001/hedefler" component={ISO9001KaliteHedefleri} />
      <Route path="/iso9001/duf" component={ISO9001Duf} />
      <Route path="/iso9001/tetkik" component={ISO9001Tetkik} />
      <Route path="/iso9001/egitimler" component={ISO9001Egitimler} />
      <Route path="/iso9001/tedarikci" component={ISO9001TedarikciDegerlendirme} />
      <Route path="/iso9001/yonetim" component={ISO9001YonetimGozdenGecirme} />
      <Route path="/iso9001/bakim-onarim" component={ISO9001BakimOnarim} />
      <Route path="/egitim-degerlendirme/:id" component={PublicEgitimDegerlendirme} />
      <Route path="/anket-sonuclari/:id" component={SurveyAnalysis} />
      <Route path="/survey/:id" component={PublicSurvey} />
      <Route path="/portal" component={PortalApp} />
      <Route path="/portal/:rest*" component={PortalApp} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [location] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [errorAuth, setErrorAuth] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("cnctracker_admin_auth") === "true") {
      setIsAuthenticated(true);
    }
  }, []);
  
  if (
    location.startsWith("/survey/") ||
    location.startsWith("/egitim-degerlendirme/") ||
    location.startsWith("/portal")
  ) {
    return <Router />;
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "cnc2024") { 
      localStorage.setItem("cnctracker_admin_auth", "true");
      setIsAuthenticated(true);
      setErrorAuth(false);
    } else {
      setErrorAuth(true);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <form onSubmit={handleLogin} className="p-8 bg-white rounded-xl shadow-lg border max-w-sm w-full space-y-4">
          <div className="flex justify-center mb-6 text-primary">
            <Lock className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold text-center">Yönetici Girişi</h2>
          <p className="text-sm text-center text-slate-500 mb-4">Sisteme erişmek için şifre giriniz.</p>
          <Input 
            type="password" 
            placeholder="Şifre" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)}
            className={errorAuth ? "border-red-500" : ""}
          />
          {errorAuth && <p className="text-xs text-red-500">Hatalı şifre</p>}
          <Button type="submit" className="w-full">Giriş Yap</Button>
        </form>
      </div>
    );
  }

  const pageTitle = pageTitles[location] || "Dashboard";

  return (
    <div className="flex h-screen w-full bg-background">
      <AppSidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between h-16 px-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="flex items-center gap-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <h1 className="text-lg font-semibold" data-testid="text-page-title">{pageTitle}</h1>
          </div>
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto">
          <Router />
        </main>
      </div>
    </div>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <AppContent />
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
