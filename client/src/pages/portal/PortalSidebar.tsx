import { Link, useLocation } from "wouter";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilePlus2, ListChecks, Inbox, Warehouse, Banknote, Building2, LogOut } from "lucide-react";
import { type PortalMe } from "./PortalApp";
import { type Rozetler, type SayfaAnahtari } from "./useTalepBildirimleri";

type MenuOgesi = {
  title: string;
  href: string;
  icon: typeof Inbox;
  rozetAnahtari?: SayfaAnahtari;
};

const TEMSILCI_MENU: MenuOgesi[] = [
  { title: "Yeni Talep", href: "/portal/yeni-talep", icon: FilePlus2 },
  { title: "Taleplerim", href: "/portal/taleplerim", icon: ListChecks, rozetAnahtari: "taleplerim" },
];

const MUHASEBE_MENU: MenuOgesi[] = [
  { title: "Gelen Talepler", href: "/portal/gelen-talepler", icon: Inbox, rozetAnahtari: "gelenTalepler" },
  { title: "Depo Ödemeleri", href: "/portal/depo", icon: Warehouse, rozetAnahtari: "depo" },
  { title: "Doğrudan Ödeme", href: "/portal/dogrudan-odeme", icon: Banknote },
  { title: "Ödeme Firmaları", href: "/portal/firmalar", icon: Building2 },
];

export default function PortalSidebar({
  me, rozetler, cikisYap,
}: { me: PortalMe; rozetler: Rozetler; cikisYap: () => void }) {
  const [location] = useLocation();
  const menu = me.rol === "muhasebe" ? MUHASEBE_MENU : TEMSILCI_MENU;

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="p-6 border-b border-sidebar-border">
        <div className="flex flex-col items-center justify-center gap-3">
          <img src="/logo.png" alt="CNC" className="h-14 w-auto object-contain" />
          <span className="text-xs text-muted-foreground uppercase tracking-widest text-center">
            Ödemeler Portalı
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menu.map((item) => {
                const rozet = item.rozetAnahtari ? rozetler[item.rozetAnahtari] : 0;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={location === item.href} className="h-10">
                      <Link href={item.href} data-testid={`link-portal-${item.href.split("/").pop()}`}>
                        <item.icon className="w-5 h-5" />
                        <span>{item.title}</span>
                        {rozet > 0 && (
                          <Badge
                            variant="destructive"
                            className="ml-auto"
                            data-testid={`rozet-${item.rozetAnahtari}`}
                          >
                            {rozet}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex flex-col gap-0.5 mb-3 min-w-0">
          <span className="text-sm font-medium truncate" data-testid="text-portal-kullanici">
            {me.adSoyad}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {me.rol === "muhasebe" ? "Muhasebe" : "Müşteri Temsilcisi"}
          </span>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={cikisYap}
          data-testid="button-portal-cikis"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Çıkış
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
