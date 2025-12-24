import { Switch, Route, useLocation } from "wouter";
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
import NotFound from "@/pages/not-found";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/gumruk": "Gümrük",
  "/sigorta": "Sigorta",
  "/nakliye": "Nakliye",
  "/raporlar": "Raporlar",
  "/araclar": "Araçlar",
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
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [location] = useLocation();
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
